const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createHash } = require("crypto");
const { pipeline } = require("stream/promises");
const { execFileSync } = require("child_process");
const { getRuntimeBaseDir } = require("./utils/runtimePaths");
const { createLogger } = require("./utils/logger");

const log = createLogger("AutoUpdater");

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
// Every release from 3.0 on publishes this asset: one `<sha256 hex>  <asset name>` line per asset, as sha256sum prints.
const CHECKSUMS_ASSET = "SHA256SUMS";
// Each archive holds the packaged release at its root; `binary` is the executable's path inside it.
const RELEASE_ARCHIVES = {
    win32: [{ name: "InjectCheatsUI-Windows.zip", binary: "InjectCheatsUI.exe" }],
    linux: [{ name: "InjectCheatsUI-Linux.tar.gz", binary: "InjectCheatsUI-linux" }],
    darwin: [
        { arch: "arm64", name: "InjectCheatsUI-macOS-arm64.tar.gz", binary: "InjectCheatsUI-macos-arm64" },
        { arch: "x64", name: "InjectCheatsUI-macOS-x64.tar.gz", binary: "InjectCheatsUI-macos-x64" },
    ],
};

/**
 * GET an https URL, following redirects only while they stay on https.
 * @param {string} url
 * @param {number} [redirectCount=0] - Current redirect depth
 * @returns {Promise<import("http").IncomingMessage>} The 200 response, not yet read
 */
function get(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > MAX_REDIRECTS) {
            return reject(new Error("the download redirected too many times."));
        }

        const requestUrl = new URL(url);
        if (requestUrl.protocol !== "https:") {
            return reject(new Error(`the download was sent to ${requestUrl.href}, which is not https.`));
        }

        const options = {
            hostname: requestUrl.hostname,
            port: requestUrl.port,
            path: requestUrl.pathname + requestUrl.search,
            method: "GET",
            headers: { "User-Agent": "Idleon-Injector-AutoUpdater" },
            timeout: REQUEST_TIMEOUT_MS,
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(get(new URL(res.headers.location, requestUrl).href, redirectCount + 1));
            }

            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`the download failed with status ${res.statusCode}.`));
            }

            resolve(res);
        });
        // The timeout is for silence, so a slow but moving download still finishes.
        req.on("timeout", () =>
            req.destroy(new Error(`the download stopped answering for ${REQUEST_TIMEOUT_MS / 1000} seconds.`))
        );
        req.on("error", reject);
        req.end();
    });
}

/**
 * Download a file and return its SHA-256.
 * @param {string} url
 * @param {string} destPath - Local file path to write to
 * @returns {Promise<string>} Lowercase hex digest
 */
async function downloadFile(url, destPath) {
    const res = await get(url);
    const hash = createHash("sha256");
    res.on("data", (chunk) => hash.update(chunk));
    await pipeline(res, fs.createWriteStream(destPath));
    return hash.digest("hex");
}

/**
 * Download a SHA256SUMS file into a map of file name to lowercase hex digest.
 * @param {string} url
 * @returns {Promise<Map<string, string>>}
 */
async function downloadChecksums(url) {
    const res = await get(url);
    let text = "";
    res.setEncoding("utf8");
    for await (const chunk of res) text += chunk;

    const checksums = new Map();
    for (const line of text.split(/\r?\n/)) {
        const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
        if (match) checksums.set(match[2], match[1].toLowerCase());
    }
    return checksums;
}

/**
 * Extract a packaged release archive using platform-native tools.
 * @param {string} archivePath - Path to the archive file
 * @param {string} destDir - Directory to extract into
 */
function extractArchive(archivePath, destDir) {
    if (archivePath.endsWith(".zip")) {
        if (process.platform !== "win32") {
            execFileSync("unzip", ["-o", archivePath, "-d", destDir], { stdio: "pipe" });
            return;
        }

        // Windows' own tar (10 1803+) reads zip. Expand-Archive fails silently when started from PowerShell 7.
        const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
        execFileSync(tar, ["-xf", archivePath, "-C", destDir], { stdio: "pipe" });
        return;
    }

    if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
        execFileSync("tar", ["-xzf", archivePath, "-C", destDir], { stdio: "pipe" });
        return;
    }

    throw new Error(`Unsupported update archive format: ${path.basename(archivePath)}`);
}

/**
 * Generate a Windows batch script that replaces files after the main process exits.
 * It backs up every file first and puts them all back if any copy fails.
 * @param {string} tempDir - Temp directory containing extracted files
 * @param {Array<{src: string, dest: string}>} updateFiles
 * @returns {string} Path to the generated script
 */
function generateWindowsScript(tempDir, updateFiles) {
    const scriptPath = path.join(tempDir, "update.bat");
    const backup = (i) => path.join(tempDir, `backup-${i}`);
    // ping, not timeout: timeout exits at once when started without a console to read from.
    const lines = ["@echo off", "title Idleon Injector - Updating...", "ping -n 3 127.0.0.1 >NUL"];

    updateFiles.forEach(({ dest }, i) => {
        lines.push(`if exist "${dest}" copy /Y "${dest}" "${backup(i)}" >NUL || goto failed`);
    });
    updateFiles.forEach(({ src, dest }) => {
        lines.push(`copy /Y "${src}" "${dest}" >NUL || goto rollback`);
    });
    lines.push("exit /b 0", ":rollback");
    updateFiles.forEach(({ dest }, i) => {
        lines.push(`if exist "${backup(i)}" (copy /Y "${backup(i)}" "${dest}" >NUL) else (del "${dest}" 2>NUL)`);
    });
    lines.push(":failed", "echo The update could not replace its files, so nothing was changed.", "exit /b 1");

    fs.writeFileSync(scriptPath, lines.join("\r\n"), "utf8");
    return scriptPath;
}

/**
 * Generate a Unix shell script that replaces files after the main process exits.
 * It backs up every file first and puts them all back if any copy fails.
 * @param {string} tempDir - Temp directory containing extracted files
 * @param {string} appDir - Application directory to copy files into
 * @param {string} binaryName - Name of the binary executable
 * @param {Array<{src: string, dest: string}>} updateFiles
 * @returns {string} Path to the generated script
 */
function generateUnixScript(tempDir, appDir, binaryName, updateFiles) {
    const scriptPath = path.join(tempDir, "update.sh");
    const backup = (i) => path.join(tempDir, `backup-${i}`);
    const failed = 'echo "The update could not replace its files, so nothing was changed."; exit 1';
    const lines = ["#!/bin/bash", "sleep 1", "rollback() {"];

    updateFiles.forEach(({ dest }, i) => {
        lines.push(`    if [ -e "${backup(i)}" ]; then cp "${backup(i)}" "${dest}"; else rm -f "${dest}"; fi`);
    });
    lines.push(`    ${failed}`, "}");
    updateFiles.forEach(({ dest }, i) => {
        lines.push(`[ ! -e "${dest}" ] || cp "${dest}" "${backup(i)}" || { ${failed}; }`);
    });
    updateFiles.forEach(({ src, dest }) => {
        lines.push(`cp "${src}" "${dest}" || rollback`);
    });

    if (binaryName) {
        const binaryPath = path.join(appDir, binaryName);
        lines.push(`chmod +x "${binaryPath}" 2>/dev/null`);
    }

    fs.writeFileSync(scriptPath, lines.join("\n"), "utf8");
    fs.chmodSync(scriptPath, "755");
    return scriptPath;
}

/**
 * Download, verify and unpack an update, so the application can close only after the update is ready.
 * Nothing in the install changes here; on any problem the update is refused and the temp files removed.
 * @param {Object} releaseInfo - Release info from checkForUpdates (must include assets)
 * @returns {Promise<{scriptPath: string, updatedFileNames: string}>}
 */
async function performUpdate(releaseInfo) {
    if (!process.pkg) {
        throw new Error("Auto-update is only available in packaged builds.");
    }

    const appDir = getRuntimeBaseDir();
    const binaryName = path.basename(process.execPath);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "idleon-update-"));

    try {
        const assets = releaseInfo.assets || [];
        const archive = (RELEASE_ARCHIVES[process.platform] || []).find(
            (candidate) =>
                (!candidate.arch || candidate.arch === process.arch) &&
                assets.some((asset) => asset.name === candidate.name)
        );
        if (!archive) {
            throw new Error(`this release has no download for ${process.platform}/${process.arch}.`);
        }
        const archiveAsset = assets.find((asset) => asset.name === archive.name);
        const checksumsAsset = assets.find((asset) => asset.name === CHECKSUMS_ASSET);
        if (!checksumsAsset) {
            throw new Error(`this release has no ${CHECKSUMS_ASSET} file, so the download can't be checked.`);
        }

        const checksums = await downloadChecksums(checksumsAsset.url);
        const expectedHash = checksums.get(archive.name);
        if (!expectedHash) {
            throw new Error(`${CHECKSUMS_ASSET} has no checksum for ${archive.name}.`);
        }

        const archivePath = path.join(tempDir, archive.name);
        log.info("Downloading update...");
        if ((await downloadFile(archiveAsset.url, archivePath)) !== expectedHash) {
            throw new Error(`${archive.name} doesn't match its checksum, so it may be damaged or tampered with.`);
        }

        log.info("Extracting update...");
        const extractDir = path.join(tempDir, "extracted");
        fs.mkdirSync(extractDir);
        extractArchive(archivePath, extractDir);

        // Exact paths inside the archive, never "a file with this name somewhere in it".
        const installPaths = { "cheats.js": "cheats.js", "config.js": "config.js", [archive.binary]: binaryName };
        const updateFiles = Object.entries(installPaths).map(([archivePath, installName]) => ({
            archivePath,
            src: path.join(extractDir, archivePath),
            dest: path.join(appDir, installName),
        }));
        const missing = updateFiles.filter(({ src }) => !fs.statSync(src, { throwIfNoEntry: false })?.isFile());
        if (missing.length > 0) {
            throw new Error(`the download is missing ${missing.map((file) => file.archivePath).join(", ")}.`);
        }

        const updatedFileNames = updateFiles.map((file) => path.basename(file.dest)).join(", ");
        log.info(`Updating ${updateFiles.length} file(s): ${updatedFileNames}`);

        return {
            scriptPath:
                process.platform === "win32"
                    ? generateWindowsScript(tempDir, updateFiles)
                    : generateUnixScript(tempDir, appDir, binaryName, updateFiles),
            updatedFileNames,
        };
    } catch (error) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error(`Update refused: ${error.message} Nothing was changed.`);
    }
}

module.exports = { performUpdate, RELEASE_ARCHIVES, CHECKSUMS_ASSET };
