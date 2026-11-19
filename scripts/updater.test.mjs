/**
 * The updater against a fake GitHub (a stand-in https module, no real network), with real archives,
 * real extraction and the real replace script run against a temporary install folder.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { captureLogger, loadCommonJs } from "./known-bugs/index.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const binaryName = basename(process.execPath);
const [archiveName, archiveBinary] = {
    win32: ["InjectCheatsUI-Windows.zip", "InjectCheatsUI.exe"],
    linux: ["InjectCheatsUI-Linux.tar.gz", "InjectCheatsUI-linux"],
    darwin:
        process.arch === "arm64"
            ? ["InjectCheatsUI-macOS-arm64.tar.gz", "InjectCheatsUI-macos-arm64"]
            : ["InjectCheatsUI-macOS-x64.tar.gz", "InjectCheatsUI-macos-x64"],
}[process.platform];
const DOWNLOADS = "https://github.com/fixture/releases/download/v99.0.0/";
const SUMS_URL = DOWNLOADS + "SHA256SUMS";
const ARCHIVE_URL = DOWNLOADS + archiveName;
const NEW_RELEASE = { "cheats.js": "new cheats", "config.js": "new config", [archiveBinary]: "new binary" };
// The real archive ships the whole repo, so the same names turn up elsewhere in it.
const DECOYS = { "src/modules/server/routes/config.js": "a route", "src/cheats.js": "not the bundle" };

/**
 * A stand-in for the https module. `routes[url]` is a body, `{ status, headers, body }`, or missing to never
 * answer; requests with a timeout get a "timeout" event the caller has to act on, as Node's do.
 */
function fakeHttps(routes) {
    const requests = [];
    const request = (options, onResponse) => {
        const url = `https://${options.hostname}${options.path}`;
        requests.push(url);
        const req = new EventEmitter();
        const timer = options.timeout && setTimeout(() => req.emit("timeout"), options.timeout);
        timer?.unref?.();
        req.destroy = (error) => req.emit("error", error);
        req.end = () => {
            const route = routes[url];
            if (route === undefined) return;
            clearTimeout(timer);
            const { status = 200, headers = {}, body = "" } = typeof route === "string" ? { body: route } : route;
            onResponse(Object.assign(Readable.from([Buffer.from(body)]), { statusCode: status, headers }));
        };
        return req;
    };
    return { request, requests };
}

const writeTree = (dir, files) =>
    Object.entries(files).forEach(([file, content]) => {
        fs.mkdirSync(dirname(join(dir, file)), { recursive: true });
        fs.writeFileSync(join(dir, file), content);
    });
const readTree = (dir) =>
    Object.fromEntries(fs.readdirSync(dir).map((file) => [file, fs.readFileSync(join(dir, file), "utf8")]));
const updateTempDirs = () => fs.readdirSync(tmpdir()).filter((name) => name.startsWith("idleon-update-"));
const sums = (lines) =>
    Object.entries(lines)
        .map(([name, hash]) => `${hash}  ${name}\n`)
        .join("");
const releaseInfo = (names) => ({
    updateAvailable: true,
    latestVersion: "v99.0.0",
    assets: names.map((name) => ({ name, url: DOWNLOADS + name })),
});

/**
 * An installed previous release and a new one, packed the way the release workflow packs it.
 * `load(routes)` returns the updater wired to a fake GitHub serving `routes`.
 */
function setup(t, releaseFiles = { ...NEW_RELEASE, ...DECOYS }) {
    const dir = fs.mkdtempSync(join(tmpdir(), "updater-test-"));
    const install = join(dir, "install");
    const release = join(dir, "release");
    const installed = {
        "cheats.js": "old cheats",
        "config.js": "old config",
        "config.custom.js": "my settings",
        [binaryName]: "old binary",
    };
    writeTree(install, installed);
    writeTree(release, releaseFiles);

    const archivePath = join(dir, archiveName);
    if (process.platform === "win32") {
        const command = `Compress-Archive -Path '${release}\\*' -DestinationPath '${archivePath}'`;
        execFileSync("powershell", ["-NoProfile", "-Command", command], { stdio: "pipe" });
    } else {
        execFileSync("tar", ["-czf", archivePath, "-C", release, "."], { stdio: "pipe" });
    }
    const archive = fs.readFileSync(archivePath);

    process.pkg = {}; // the updater only runs in packaged builds
    const tempDirsBefore = updateTempDirs();
    t.after(() => {
        delete process.pkg;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const load = (routes) => {
        const server = fakeHttps(routes);
        const modules = {
            https: server,
            "./utils/logger": captureLogger(),
            "./utils/runtimePaths": { getRuntimeBaseDir: () => install },
        };
        return { server, modules, ...loadCommonJs("src/modules/autoUpdater.js", modules) };
    };
    const assertUnchanged = () => {
        assert.deepEqual(readTree(install), installed, "the install must be left exactly as it was");
        assert.deepEqual(updateTempDirs(), tempDirsBefore, "a refused update must remove its temp files");
    };
    return { install, installed, archive, load, assertUnchanged };
}

/** Run the generated replace script the way updateService launches it, and return its exit code. */
function runScript(t, scriptPath) {
    const tempDir = dirname(scriptPath);
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const [shell, args] = process.platform === "win32" ? ["cmd.exe", ["/d", "/c", scriptPath]] : ["bash", [scriptPath]];
    try {
        execFileSync(shell, args, { stdio: "ignore" });
        return 0;
    } catch (error) {
        return error.status;
    }
}

test("an update from the previous release replaces exactly cheats.js, config.js and the binary", async (t) => {
    const { install, installed, archive, load } = setup(t);
    const latest = "https://api.github.com/repositories/1463002607/releases/latest";
    const assets = [archiveName, "SHA256SUMS"].map((name) => ({ name, browser_download_url: DOWNLOADS + name }));
    const { server, modules, performUpdate } = load({
        [latest]: JSON.stringify({ tag_name: "v99.0.0", html_url: "https://github.com/fixture", assets }),
        [SUMS_URL]: sums({ "other-file.zip": "0".repeat(64), [archiveName]: sha256(archive) }),
        // GitHub answers downloads with a redirect to its file host.
        [ARCHIVE_URL]: { status: 302, headers: { location: "https://objects.fixture/archive?sig=1" } },
        "https://objects.fixture/archive?sig=1": { body: archive },
    });

    const info = await loadCommonJs("src/modules/updateChecker.js", modules).checkForUpdates("2.0.0");
    assert.equal(info.updateAvailable, true);
    const prepared = await performUpdate(info);
    assert.deepEqual(readTree(install), installed, "preparing must not touch the install");
    assert.ok(server.requests.every((url) => url.startsWith("https://")));

    assert.equal(runScript(t, prepared.scriptPath), 0);
    assert.deepEqual(readTree(install), {
        "cheats.js": "new cheats",
        "config.js": "new config",
        "config.custom.js": "my settings",
        [binaryName]: "new binary",
    });
});

test("a redirect to plain http is refused", async (t) => {
    const { archive, load, assertUnchanged } = setup(t);
    const { server, performUpdate } = load({
        [SUMS_URL]: sums({ [archiveName]: sha256(archive) }),
        [ARCHIVE_URL]: { status: 302, headers: { location: "http://objects.fixture/archive" } },
        "http://objects.fixture/archive": { body: archive },
    });
    await assert.rejects(performUpdate(releaseInfo([archiveName, "SHA256SUMS"])), {
        message:
            "Update refused: the download was sent to http://objects.fixture/archive, which is not https. Nothing was changed.",
    });
    assert.deepEqual(server.requests, [SUMS_URL, ARCHIVE_URL], "nothing may be requested after the http redirect");
    assertUnchanged();
});

test("a download that doesn't match its checksum is refused", async (t) => {
    const { archive, load, assertUnchanged } = setup(t);
    const { performUpdate } = load({
        [SUMS_URL]: sums({ [archiveName]: sha256(archive) }),
        [ARCHIVE_URL]: { body: archive.subarray(0, archive.length - 1) }, // cut short
    });
    await assert.rejects(performUpdate(releaseInfo([archiveName, "SHA256SUMS"])), {
        message: `Update refused: ${archiveName} doesn't match its checksum, so it may be damaged or tampered with. Nothing was changed.`,
    });
    assertUnchanged();
});

test("a release without SHA256SUMS, or without a line for the archive, is refused", async (t) => {
    const { archive, load, assertUnchanged } = setup(t);
    const routes = { [ARCHIVE_URL]: { body: archive } };

    const noFile = load(routes);
    await assert.rejects(noFile.performUpdate(releaseInfo([archiveName])), {
        message:
            "Update refused: this release has no SHA256SUMS file, so the download can't be checked. Nothing was changed.",
    });
    assert.deepEqual(noFile.server.requests, [], "nothing is downloaded without a checksum to check it against");

    const noLine = load({ ...routes, [SUMS_URL]: sums({ "something-else.zip": sha256(archive) }) });
    await assert.rejects(noLine.performUpdate(releaseInfo([archiveName, "SHA256SUMS"])), {
        message: `Update refused: SHA256SUMS has no checksum for ${archiveName}. Nothing was changed.`,
    });
    assertUnchanged();
});

test("an archive missing an expected file changes nothing, even with that name elsewhere in it", async (t) => {
    const { "config.js": _, ...withoutConfig } = NEW_RELEASE;
    const { archive, load, assertUnchanged } = setup(t, { ...withoutConfig, ...DECOYS });
    const { performUpdate } = load({
        [SUMS_URL]: sums({ [archiveName]: sha256(archive) }),
        [ARCHIVE_URL]: { body: archive },
    });
    await assert.rejects(performUpdate(releaseInfo([archiveName, "SHA256SUMS"])), {
        message: "Update refused: the download is missing config.js. Nothing was changed.",
    });
    assertUnchanged();
});

test("a download that stops answering times out", async (t) => {
    const { archive, load, assertUnchanged } = setup(t);
    const { server, performUpdate } = load({ [SUMS_URL]: sums({ [archiveName]: sha256(archive) }) });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const result = performUpdate(releaseInfo([archiveName, "SHA256SUMS"]));
    while (server.requests.length < 2) await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(30_000);
    await assert.rejects(result, /the download stopped answering for 30 seconds/);
    t.mock.timers.reset();
    assertUnchanged();
});

test("if a file can't be replaced, the replace script puts every file back", async (t) => {
    const { install, installed, archive, load } = setup(t);
    const { performUpdate } = load({
        [SUMS_URL]: sums({ [archiveName]: sha256(archive) }),
        [ARCHIVE_URL]: { body: archive },
    });
    const prepared = await performUpdate(releaseInfo([archiveName, "SHA256SUMS"]));

    // cheats.js is replaced first, then config.js can't be written.
    const locked = join(install, "config.js");
    fs.chmodSync(locked, 0o444);

    assert.notEqual(runScript(t, prepared.scriptPath), 0);
    assert.deepEqual(readTree(install), installed);
});
