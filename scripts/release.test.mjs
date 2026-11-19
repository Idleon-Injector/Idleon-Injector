/**
 * The release packaging: each archive holds exactly its allowlist, SHA256SUMS is in sha256sum's format for
 * every archive, and the build scripts produce the binaries the updater expects on the Node in .nvmrc.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { releaseMessage } from "./discord-release.mjs";
import { ARCHIVES, allowedFiles, checkArchive, checksums, listArchive, pack } from "./release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tempDir = () => fs.mkdtempSync(join(tmpdir(), "idleon-release-test-"));
const writeTree = (dir, files) =>
    files.forEach((file) => {
        fs.mkdirSync(dirname(join(dir, file)), { recursive: true });
        fs.writeFileSync(join(dir, file), `contents of ${file}`);
    });
// What a checkout holds besides the release files; none of it may ship.
const REPO_CLUTTER = [".git/HEAD", "node_modules/ws/index.js", "src/main.js", "src/cheats.js", "README.md", ".env"];

test("each release archive is the updater's: its binary, cheats.js and config.js", () => {
    assert.deepEqual(ARCHIVES.map(({ name }) => name).sort(), [
        "InjectCheatsUI-Linux.tar.gz",
        "InjectCheatsUI-Windows.zip",
        "InjectCheatsUI-macOS-arm64.tar.gz",
        "InjectCheatsUI-macOS-x64.tar.gz",
    ]);
    for (const { name, binary } of ARCHIVES)
        assert.deepEqual(allowedFiles(name), [binary, "cheats.js", "config.js", "LICENSE"]);
    assert.throws(() => allowedFiles("InjectCheatsUI.zip"), /isn't a release archive/);
});

for (const { name } of ARCHIVES) {
    test(`${name} holds only its allowlist, at the root, from a full checkout`, (t) => {
        const dir = tempDir();
        t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
        writeTree(join(dir, "src"), [...allowedFiles(name), ...REPO_CLUTTER]);

        const archive = pack(name, join(dir, "src"), join(dir, "out"));

        assert.deepEqual(listArchive(archive).sort(), allowedFiles(name).sort());
    });
}

test("an archive with a file outside the allowlist, or without one it needs, fails the check", (t) => {
    const dir = tempDir();
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const name = "InjectCheatsUI-Linux.tar.gz";
    writeTree(dir, [...allowedFiles(name), "README.md"]);
    const tar = process.platform === "win32" ? join(process.env.SystemRoot, "System32", "tar.exe") : "tar";
    const make = (archive, files) => execFileSync(tar, ["-czf", join(dir, archive), "-C", dir, ...files]);

    make("extra.tar.gz", [...allowedFiles(name), "README.md"]);
    assert.throws(() => checkArchive(join(dir, "extra.tar.gz"), name), /Not allowed: README\.md\./);

    make("missing.tar.gz", ["InjectCheatsUI-linux", "cheats.js"]);
    assert.throws(() => checkArchive(join(dir, "missing.tar.gz"), name), /Missing: config\.js, LICENSE\./);
});

test("packing refuses when a release file wasn't built", (t) => {
    const dir = tempDir();
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    writeTree(dir, ["cheats.js", "config.js", "LICENSE"]);

    assert.throws(() => pack("InjectCheatsUI-Windows.zip", dir, join(dir, "out")), /InjectCheatsUI\.exe not built/);
    assert.equal(fs.existsSync(join(dir, "out", "InjectCheatsUI-Windows.zip")), false);
});

test("SHA256SUMS has one sha256sum line per archive, with the archive's real hash", (t) => {
    const dir = tempDir();
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    writeTree(
        dir,
        ARCHIVES.map(({ name }) => name)
    );

    const lines = checksums(dir).split("\n");

    assert.equal(lines.pop(), "", "ends with a newline");
    assert.deepEqual(
        lines.map((line) => line.split("  ")[1]),
        ARCHIVES.map(({ name }) => name)
    );
    for (const line of lines) {
        const [, hash, name] = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
        assert.equal(
            hash,
            createHash("sha256")
                .update(fs.readFileSync(join(dir, name)))
                .digest("hex")
        );
    }
});

test("sha256sum itself accepts SHA256SUMS", { skip: spawnSync("sha256sum", ["--version"]).status !== 0 }, (t) => {
    const dir = tempDir();
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    writeTree(
        dir,
        ARCHIVES.map(({ name }) => name)
    );
    fs.writeFileSync(join(dir, "SHA256SUMS"), checksums(dir));

    const out = execFileSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: dir, encoding: "utf8" });

    assert.equal(out.match(/: OK$/gm).length, ARCHIVES.length);
});

test("SHA256SUMS refuses a release that misses a platform", (t) => {
    const dir = tempDir();
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    writeTree(dir, ["InjectCheatsUI-Windows.zip", "InjectCheatsUI-Linux.tar.gz", "InjectCheatsUI-macOS-x64.tar.gz"]);

    assert.throws(() => checksums(dir), /missing InjectCheatsUI-macOS-arm64\.tar\.gz/);
});

test("the build scripts write each archive's binary on the Node major in .nvmrc", () => {
    const { scripts } = JSON.parse(fs.readFileSync(join(root, "package.json"), "utf8"));
    const node = fs.readFileSync(join(root, ".nvmrc"), "utf8").trim();
    const pkgScripts = Object.values(scripts).filter((script) => /\bpkg\b/.test(script));

    for (const { binary } of ARCHIVES) {
        assert.equal(pkgScripts.filter((script) => script.endsWith(`--output ${binary}`)).length, 1, binary);
    }
    for (const script of pkgScripts) assert.match(script, new RegExp(` -t node${node}-`));
});

test("the Discord post carries the notes, bolds headings, pings nobody and fits Discord's limit", () => {
    const release = {
        name: "3.0.0",
        tagName: "3.0.0",
        url: "https://github.com/Idleon-Injector/Idleon-Injector/releases/tag/3.0.0",
        body: "## What's Changed\r\n* a fix by @someone\n@everyone",
    };
    const { allowed_mentions, embeds } = releaseMessage(release);

    assert.deepEqual(allowed_mentions, { parse: [] });
    assert.equal(embeds[0].title, "3.0.0");
    assert.equal(embeds[0].url, release.url);
    assert.equal(embeds[0].description, "**What's Changed**\n* a fix by @someone\n@everyone");

    const long = releaseMessage({ ...release, name: "", body: "x".repeat(10_000) }).embeds[0];
    assert.equal(long.title, "3.0.0", "falls back to the tag");
    assert.equal(long.description.length, 4096);
    assert.ok(long.description.endsWith(`[Read the full notes](${release.url})`));

    assert.equal(releaseMessage({ ...release, body: null }).embeds[0].description, undefined);
});

test("without the webhook secret the Discord post is skipped with a notice, not an error", () => {
    const env = { ...process.env };
    delete env.DISCORD_RELEASE_WEBHOOK;
    const run = spawnSync(process.execPath, [join(root, "scripts", "discord-release.mjs"), "3.0.0"], {
        env,
        encoding: "utf8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^::notice title=Not posted to Discord::.*DISCORD_RELEASE_WEBHOOK/);
});
