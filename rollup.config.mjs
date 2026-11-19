/**
 * Rollup Configuration
 *
 * Bundles src/cheats/ modules into a single cheats.js file.
 * The output is an IIFE that runs in the browser context.
 *
 * Usage:
 *   npm run build:cheats       - Build once
 *   npm run watch:cheats       - Watch mode (rebuild on changes)
 */

import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

// Get package version for banner
let version = "dev";
try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    version = pkg.version || "dev";
} catch {
    // Ignore errors
}

const banner = `/*
 * Idleon Injector - Cheats Module v${version}
 * Auto-generated from src/cheats/ - ${new Date().toISOString().split("T")[0]}
 *
 * For config changes: edit config.custom.js
 * To modify cheats: edit source files in src/cheats/ and run:
 *   npm run build:cheats
 *
 * This file CAN be edited directly, but changes will be lost on rebuild.
 * The source of truth is in src/cheats/
 */`;

const formatBytes = (bytes) => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) {
        return `${kilobytes.toFixed(2)} KB`;
    }

    const megabytes = kilobytes / 1024;
    return `${megabytes.toFixed(2)} MB`;
};

const bundleStats = () => ({
    name: "bundle-stats",
    generateBundle(_outputOptions, bundle) {
        const moduleIds = new Set();
        let chunkCount = 0;
        let assetCount = 0;
        let totalChunkBytes = 0;
        const chunkSummaries = [];

        for (const [fileName, output] of Object.entries(bundle)) {
            if (output.type === "chunk") {
                const chunkBytes = Buffer.byteLength(output.code);

                chunkCount += 1;
                totalChunkBytes += chunkBytes;
                chunkSummaries.push(`${fileName} (${formatBytes(chunkBytes)})`);

                for (const moduleId of Object.keys(output.modules)) {
                    moduleIds.add(moduleId);
                }
            } else {
                assetCount += 1;
            }
        }

        console.log("\nRollup bundle stats:");
        if (chunkSummaries.length > 0) {
            console.log(`  Chunks: ${chunkCount} (${chunkSummaries.join(", ")})`);
        } else {
            console.log(`  Chunks: ${chunkCount}`);
        }
        console.log(`  Assets: ${assetCount}`);
        console.log(`  Modules: ${moduleIds.size}`);
        console.log(`  Bundle size: ${formatBytes(totalChunkBytes)}`);
    },
});

const hooksDir = fileURLToPath(new URL("src/cheats/hooks/", import.meta.url));
const cheatsDir = fileURLToPath(new URL("src/cheats/cheats/", import.meta.url));

/** The .js files directly in a folder, sorted. A file starting with "_" (the example) is skipped. */
const filesIn = (dir) =>
    readdirSync(dir)
        .filter((file) => file.endsWith(".js") && !file.startsWith("_"))
        .sort();

/** The hook files in src/cheats/hooks/, in the order they install. */
export const hookFiles = () => filesIn(hooksDir);

/** The cheat files in src/cheats/cheats/ (each declares defineCheat rows), in the order they register. */
export const cheatFiles = () => filesIn(cheatsDir);

// `import "virtual:hooks"` and `import "virtual:cheats"` in cheats/main.js import every file in the folder, so a
// new hook or cheat is just a new file.
// ponytail: watch mode sees edits, not a newly added file; restart it after adding one.
const folder = (id, dir) => ({
    name: `${id}-folder`,
    resolveId: (source) => (source === `virtual:${id}` ? `\0virtual:${id}` : null),
    load: (source) =>
        source === `\0virtual:${id}`
            ? filesIn(dir)
                  .map((file) => `import ${JSON.stringify(dir + file)};`)
                  .join("\n")
            : null,
});

export default {
    input: "src/cheats/main.js",
    output: {
        file: "cheats.js",
        format: "iife",
        banner,
        // Preserve readable output
        indent: "",
        // Don't add strict mode (game context may not support it)
        strict: false,
    },
    // Treat all imports as internal (bundle everything)
    treeshake: {
        moduleSideEffects: true,
    },
    plugins: [folder("hooks", hooksDir), folder("cheats", cheatsDir), bundleStats()],
};
