/**
 * Builds the release archives from an allowlist and writes SHA256SUMS for them.
 *
 *   node scripts/release.mjs pack <archive name>   archive the built binary, cheats.js and config.js into release/
 *   node scripts/release.mjs sums <dir>            write <dir>/SHA256SUMS for every release archive in <dir>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// The updater's own list, so the archive names and the binary inside each can't drift from what it downloads.
const { RELEASE_ARCHIVES, CHECKSUMS_ASSET } = createRequire(import.meta.url)("../src/modules/autoUpdater.js");
export const ARCHIVES = Object.values(RELEASE_ARCHIVES).flat();
export { CHECKSUMS_ASSET };

// Windows' own tar (bsdtar) writes and reads zip; Git Bash's GNU tar on the PATH doesn't, and it's what the updater extracts with.
const tar = process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
// GNU tar (Linux) can't write zip; there it takes zip/unzip, which only the tests need.
const zipViaTar = process.platform !== "linux";

/** The allowlist: exactly the files an archive holds, at its root. */
export function allowedFiles(archiveName) {
    const archive = ARCHIVES.find((entry) => entry.name === archiveName);
    if (!archive)
        throw new Error(`${archiveName} isn't a release archive (${ARCHIVES.map((a) => a.name).join(", ")}).`);
    return [archive.binary, "cheats.js", "config.js"];
}

/** The file names inside an archive. */
export function listArchive(path) {
    const out =
        path.endsWith(".zip") && !zipViaTar
            ? execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
            : execFileSync(tar, ["-tf", path], { encoding: "utf8" });
    return out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((name) => name.replace(/^\.\//, ""));
}

/** Throws unless the archive holds exactly its allowlist. */
export function checkArchive(path, archiveName) {
    const allowed = allowedFiles(archiveName);
    const names = listArchive(path);
    const extra = names.filter((name) => !allowed.includes(name));
    const missing = allowed.filter((name) => !names.includes(name));
    if (extra.length || missing.length) {
        throw new Error(
            `${archiveName} doesn't match its allowlist.` +
                (extra.length ? ` Not allowed: ${extra.join(", ")}.` : "") +
                (missing.length ? ` Missing: ${missing.join(", ")}.` : "")
        );
    }
}

/** Archives the allowlisted files from `srcDir` into `outDir/<archiveName>` and checks the result. */
export function pack(archiveName, srcDir, outDir) {
    const files = allowedFiles(archiveName);
    const missing = files.filter((file) => !fs.statSync(join(srcDir, file), { throwIfNoEntry: false })?.isFile());
    if (missing.length) throw new Error(`Can't pack ${archiveName}: ${missing.join(", ")} not built in ${srcDir}.`);

    fs.mkdirSync(outDir, { recursive: true });
    const out = join(outDir, archiveName);
    fs.rmSync(out, { force: true });
    // COPYFILE_DISABLE keeps macOS tar from adding ._ metadata files.
    const env = { ...process.env, COPYFILE_DISABLE: "1" };
    if (archiveName.endsWith(".zip") && !zipViaTar) {
        execFileSync("zip", ["-q", "-X", out, ...files], { cwd: srcDir, env });
    } else {
        execFileSync(tar, ["-a", "-cf", out, "-C", srcDir, ...files], { env });
    }
    checkArchive(out, archiveName);
    return out;
}

/** `sha256sum` output for every release archive in `dir`; throws if one is missing. */
export function checksums(dir) {
    const missing = ARCHIVES.filter(({ name }) => !fs.existsSync(join(dir, name))).map(({ name }) => name);
    if (missing.length) throw new Error(`Not releasing without every platform: missing ${missing.join(", ")}.`);
    return ARCHIVES.map(({ name }) => {
        const hash = createHash("sha256")
            .update(fs.readFileSync(join(dir, name)))
            .digest("hex");
        return `${hash}  ${name}\n`;
    }).join("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, arg] = process.argv.slice(2);
    if (command === "pack" && arg) {
        console.log(`Packed ${pack(arg, root, join(root, "release"))}: ${allowedFiles(arg).join(", ")}`);
    } else if (command === "sums" && arg) {
        const text = checksums(arg);
        fs.writeFileSync(join(arg, CHECKSUMS_ASSET), text);
        process.stdout.write(text);
    } else {
        console.error("Usage: node scripts/release.mjs pack <archive name> | sums <dir>");
        process.exit(1);
    }
}
