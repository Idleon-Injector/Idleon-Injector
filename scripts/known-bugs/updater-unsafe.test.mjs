import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { KNOWN_BUGS, captureLogger, loadCommonJs } from "./index.mjs";

/**
 * A stand-in for the https module. `answer(url)` returns a body, or nothing to never answer.
 * Requests time out the way Node's do: a "timeout" event that the caller has to act on.
 */
function fakeHttps(answer) {
    const requests = [];
    const request = (options, onResponse) => {
        const url = `https://${options.hostname}${options.path}`;
        requests.push(url);
        const req = new EventEmitter();
        req.setTimeout = (ms, listener) => {
            if (listener) req.on("timeout", listener);
            setTimeout(() => req.emit("timeout"), ms).unref?.();
            return req;
        };
        if (options.timeout) req.setTimeout(options.timeout);
        options.signal?.addEventListener("abort", () => req.emit("error", options.signal.reason));
        req.destroy = (error) => error && req.emit("error", error);
        req.end = () => {
            const body = answer(url);
            if (body === undefined) return;
            const res = Readable.from([Buffer.from(body)]);
            Object.assign(res, { statusCode: 200, headers: {} });
            onResponse(res);
        };
        return req;
    };
    return { request, requests };
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

test(
    "the updater gives up on a silent server and refuses a tampered download",
    { todo: KNOWN_BUGS.updaterUnsafe },
    async (t) => {
        const logger = { "./utils/logger": captureLogger() };

        // 1. A check that never gets an answer must not hold up startup.
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const silent = fakeHttps(() => undefined);
        let settled = false;
        loadCommonJs("src/modules/updateChecker.js", { https: silent, ...logger })
            .checkForUpdates("1.0.0")
            .finally(() => (settled = true));
        t.mock.timers.tick(60_000);
        await new Promise((resolve) => setImmediate(resolve));
        t.mock.timers.reset();
        assert.match(silent.requests[0], /^https:\/\/api\.github\.com\//);
        assert.doesNotMatch(silent.requests[0], /MrJoiny/, "the check must not go to the archived repo");
        assert.ok(settled, "an update check with no answer must give up within a minute");

        // 2. A download that doesn't match the checksum the release publishes must be refused.
        const archive = "the real release archive";
        const archives = ["InjectCheatsUI-Windows.zip", "InjectCheatsUI-Linux.tar.gz"];
        archives.push("InjectCheatsUI-macOS-arm64.tar.gz", "InjectCheatsUI-macOS-x64.tar.gz");
        const release = {
            tag_name: "v99.0.0",
            html_url: "https://github.com/fixture/releases/v99.0.0",
            assets: [
                ...archives.map((name) => ({
                    name,
                    browser_download_url: `https://downloads.fixture/${name}`,
                    size: archive.length,
                    digest: `sha256:${sha256(archive)}`,
                })),
                { name: "SHA256SUMS", browser_download_url: "https://downloads.fixture/SHA256SUMS", size: 0 },
            ],
        };
        const server = fakeHttps((url) => {
            if (url.startsWith("https://api.github.com/")) return JSON.stringify(release);
            if (url.endsWith("/SHA256SUMS")) return archives.map((name) => `${sha256(archive)}  ${name}`).join("\n");
            return "a tampered archive"; // what actually arrives
        });
        const info = await loadCommonJs("src/modules/updateChecker.js", { https: server, ...logger }).checkForUpdates(
            "1.0.0"
        );

        let extractDir;
        const fakeFs = {
            ...fs,
            mkdirSync: (path, ...rest) => fs.mkdirSync((extractDir = path), ...rest),
        };
        const extract = () =>
            ["cheats.js", "config.js"].forEach((file) => fs.writeFileSync(join(extractDir, file), ""));
        const { performUpdate } = loadCommonJs("src/modules/autoUpdater.js", {
            https: server,
            http: server,
            fs: fakeFs,
            child_process: { execFileSync: extract },
            ...logger,
        });
        process.pkg = {}; // the updater only runs in packaged builds
        t.after(() => {
            delete process.pkg;
            if (extractDir) fs.rmSync(dirname(extractDir), { recursive: true, force: true });
        });
        await assert.rejects(
            performUpdate(info),
            "a download that doesn't match the published checksum must be refused"
        );
    }
);
