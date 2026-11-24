/**
 * Screenshot every page of the WebUI against the fake game, at desktop and overlay width, and flag the ones
 * that need a look: errors, anything too wide for the window, a break of the layout rules in DESIGN.md's Page
 * standards (layout.mjs, measured at rest and with every row's controls showing), and changes since the baseline.
 *
 *   npm run page-shots                      run, compare with the baseline, print the flagged shots
 *   npm run page-shots -- --update-baseline  then make this run the new baseline (after the release check)
 *   npm run page-shots -- --only world-1     only the areas whose name contains "world-1"
 *   npm run page-shots -- --pages w1.anvil,w5.gaming   only these pages (a PR's summary shoots the pages it touches)
 *   npm run page-shots -- --widths 400,740,1024,1440   other window widths (default 1440,400)
 *
 * Screenshots go to .scratch/page-shots/current (with report.json and, for changed shots, a diff image);
 * the baseline is .scratch/page-shots/baseline. Both stay outside git. Needs Chrome, Edge or Chromium
 * (CHROME_PATH picks one). Exits 1 when a shot is flagged.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { startFakeApi } from "./fake-api.mjs";
import { DIFF_THRESHOLD, flagsFor, summarize } from "./report.mjs";
import { collectLayout, layoutBreaks } from "./layout.mjs";

const require = createRequire(import.meta.url);
const CDP = require("chrome-remote-interface");
const root = fileURLToPath(new URL("../../", import.meta.url));

/** Desktop, and the in-game overlay's width. */
const WIDTHS = [
    { width: 1440, height: 900 },
    { width: 400, height: 800 },
];
const MAX_HEIGHT = 8000;
// ponytail: the usual install paths; CHROME_PATH covers anything else.
const BROWSERS = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
];

const { values: args } = parseArgs({
    options: {
        out: { type: "string", default: join(root, ".scratch/page-shots/current") },
        baseline: { type: "string", default: join(root, ".scratch/page-shots/baseline") },
        "update-baseline": { type: "boolean", default: false },
        only: { type: "string" },
        pages: { type: "string" },
        threshold: { type: "string", default: String(DIFF_THRESHOLD) },
        widths: { type: "string" },
    },
});
const widths = args.widths
    ? args.widths.split(",").map((w) => ({ width: Number(w), height: Number(w) > 1000 ? 900 : 800 }))
    : WIDTHS;

async function launchBrowser() {
    const exe = process.env.CHROME_PATH || BROWSERS.find((path) => existsSync(path));
    if (process.env.CHROME_PATH && !existsSync(exe)) throw new Error(`CHROME_PATH ${exe} does not exist.`);
    if (!exe) throw new Error("No Chrome, Edge or Chromium found; set CHROME_PATH to one.");
    const profile = await mkdtemp(join(tmpdir(), "page-shots-"));
    const browser = spawn(
        exe,
        [
            "--headless=new",
            "--remote-debugging-port=0",
            `--user-data-dir=${profile}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--force-color-profile=srgb",
            "--font-render-hinting=none",
            "about:blank",
        ],
        { stdio: "ignore" }
    );
    const exited = new Promise((resolve) => browser.once("exit", resolve));
    // Chrome writes the port it picked to DevToolsActivePort.
    let port = 0;
    for (let i = 0; i < 150 && !port; i++) {
        await delay(100);
        port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0]);
    }
    if (!port) {
        browser.kill();
        throw new Error(`${exe} did not open its debugging port`);
    }
    const client = await CDP({ port });
    const close = async () => {
        await client.close().catch(() => {});
        browser.kill();
        await exited;
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    };
    return { client, close };
}

/** Runs in the page: helpers the crawl calls through Runtime.evaluate. */
const PAGE_HELPERS = String.raw`(() => {
    const visible = (el) => el.getClientRects().length > 0;
    const pane = () => document.querySelector(".tab-pane.active") || document.body;
    // A nav by its own classes and labels; the pill's state classes come and go as tabs open.
    const navKey = (nav) => nav.className.replace(/(has-pill|pill-glides|pill-floats)/g, "").trim() + "|" + [...nav.querySelectorAll(".account-sub-tab-btn")].map((b) => b.textContent.trim()).join("/");
    const navs = () => [...pane().querySelectorAll(".account-sub-nav")].filter(visible);
    const describe = (el) => {
        if (!el) return "";
        const classes = [...el.classList].slice(0, 2).map((c) => "." + c).join("");
        return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + classes;
    };
    // Boxes the stylesheets ask to scroll sideways (overflow-x or overflow: auto/scroll); the rest shouldn't.
    let sideways = null;
    const sidewaysSelectors = () => {
        const found = [];
        const walk = (rules) => {
            for (const rule of rules) {
                if (rule.cssRules) walk(rule.cssRules);
                if (rule.styleSheet) walk(rule.styleSheet.cssRules);
                if (rule.selectorText && /auto|scroll/.test(rule.style?.overflowX || "")) found.push(rule.selectorText);
            }
        };
        for (const sheet of document.styleSheets) {
            try { walk(sheet.cssRules); } catch { /* another origin's sheet */ }
        }
        return found;
    };
    window.__shots = {
        nextNav(skip) {
            const nav = navs().find((n) => !skip.includes(navKey(n)));
            return nav ? { key: navKey(nav), labels: [...nav.querySelectorAll(".account-sub-tab-btn")].map((b) => b.textContent.trim()) } : null;
        },
        click(key, index) {
            const nav = navs().find((n) => navKey(n) === key);
            nav.querySelectorAll(".account-sub-tab-btn")[index].click();
        },
        overflow() {
            sideways ??= sidewaysSelectors();
            const viewport = document.documentElement.clientWidth;
            const boxes = [];
            const page = document.scrollingElement;
            if (page.scrollWidth > page.clientWidth + 1) boxes.push({ el: page, box: "the page" });
            for (const el of document.querySelectorAll("body *")) {
                if (el.scrollWidth <= el.clientWidth + 1 || !visible(el)) continue;
                if (!/auto|scroll/.test(getComputedStyle(el).overflowX)) continue;
                if (/auto|scroll/.test(el.style.overflowX) || sideways.some((s) => el.matches(s))) continue;
                boxes.push({ el, box: describe(el) });
            }
            if (!boxes.length) return null;
            return {
                viewport,
                boxes: boxes.map(({ el, box }) => {
                    const edge = el === page ? viewport : el.getBoundingClientRect().right;
                    // The outermost thing that sticks out: its parent doesn't.
                    const culprit = [...el.querySelectorAll("*")].find((c) => visible(c) && c.getBoundingClientRect().right > edge + 1 && !(c.parentElement !== el && c.parentElement.getBoundingClientRect().right > edge + 1));
                    return { box, by: el.scrollWidth - el.clientWidth, culprit: describe(culprit) };
                }),
            };
        },
        height() {
            let extra = 0;
            for (const el of document.querySelectorAll("*")) {
                if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY) && visible(el)) {
                    extra = Math.max(extra, el.scrollHeight - el.clientHeight);
                }
            }
            return Math.max(document.scrollingElement.scrollHeight, innerHeight + extra);
        },
    };
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}";
    document.head.appendChild(style);
})()`;

/** Compare two PNGs (base64) in the browser: share of changed pixels, and a diff image when any changed. */
const COMPARE = String.raw`async (before, after) => {
    const load = async (b64) => createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const [a, b] = await Promise.all([load(before), load(after)]);
    if (a.width !== b.width || a.height !== b.height) {
        return { sizeChanged: true, before: a.width + "x" + a.height, after: b.width + "x" + b.height };
    }
    const pixels = (img) => {
        const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const p = pixels(a), q = pixels(b);
    const out = new ImageData(a.width, a.height);
    let changed = 0;
    for (let i = 0; i < p.length; i += 4) {
        const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
        const grey = 170 + ((q[i] + q[i + 1] + q[i + 2]) / 3) * 0.33;
        out.data.set(d > 24 ? [255, 0, 90, 255] : [grey, grey, grey, 255], i);
        if (d > 24) changed++;
    }
    if (!changed) return { ratio: 0 };
    const canvas = new OffscreenCanvas(a.width, a.height);
    canvas.getContext("2d").putImageData(out, 0, 0);
    const blob = await canvas.convertToBlob();
    const image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(blob);
    });
    return { ratio: changed / (p.length / 4), image };
}`;

const slug = (text) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "tab";

// The shots a --pages run takes: each picked page's shot and its tabs' ("world-1/anvil", "world-5/gaming/garden").
// Filled while the pages are listed; null for a run without --pages.
let pickedShots = null;
const isPickedShot = (name) => {
    const rest = name.slice(name.indexOf("/") + 1);
    return pickedShots.some(
        (p) => rest === p || rest.startsWith(`${p}/`) || (rest.startsWith(p) && /^-\d+$/.test(rest.slice(p.length)))
    );
};

async function listPngs(dir) {
    const entries = await readdir(dir, { recursive: true }).catch(() => []);
    return entries
        .map((f) => f.split("\\").join("/"))
        .filter(
            (f) =>
                f.endsWith(".png") &&
                !f.startsWith("diff/") &&
                widths.some(({ width }) => f.startsWith(`${width}/`)) &&
                (!args.only || f.split("/")[1].includes(args.only))
        )
        .map((f) => f.slice(0, -4))
        .filter((name) => !pickedShots || isPickedShot(name));
}

async function main() {
    if (args.only && args["update-baseline"]) throw new Error("--update-baseline needs a full run, without --only.");
    if (args.pages && args["update-baseline"]) throw new Error("--update-baseline needs a full run, without --pages.");
    if (args.widths && args["update-baseline"])
        throw new Error("--update-baseline needs a full run, without --widths.");
    const threshold = Number(args.threshold);
    const picked = args.pages ? new Set(args.pages.split(",").map((id) => id.trim())) : null;
    if (!(threshold >= 0 && threshold < 1)) throw new Error("--threshold is a share of pixels, like 0.001.");
    const api = await startFakeApi();
    // ponytail: one retry; a CI runner's Chrome once missed the port wait and failed the layout gate (#235).
    const { client, close } = await launchBrowser().catch((error) => {
        console.warn(`${error.message.replace(/\.$/, "")}. Trying once more.`);
        return launchBrowser();
    });
    const { Page, Runtime, Network, Emulation, Log } = client;
    const shots = [];
    try {
        await Promise.all([Page.enable(), Runtime.enable(), Network.enable(), Log.enable()]);

        // Errors since the last shot; a shot takes them.
        let errors = [];
        Runtime.exceptionThrown(({ exceptionDetails: d }) =>
            errors.push(d.exception?.description?.split("\n")[0] ?? d.text)
        );
        Runtime.consoleAPICalled(({ type, args: a }) => {
            if (type === "error") errors.push(a.map((x) => x.value ?? x.description?.split("\n")[0] ?? "").join(" "));
        });
        Log.entryAdded(({ entry }) => {
            if (entry.level === "error")
                errors.push(`${entry.text}${entry.url ? ` (${entry.url.replace(api.url, "/")})` : ""}`);
        });
        // Only the current page's requests count: one cut off by the next navigation never reports back.
        const inflight = new Set();
        let pageLoader = null;
        Network.requestWillBeSent(({ requestId, loaderId }) => {
            if (loaderId === pageLoader) inflight.add(requestId);
        });
        Network.loadingFinished(({ requestId }) => inflight.delete(requestId));
        Network.loadingFailed(({ requestId }) => inflight.delete(requestId));

        const evaluate = async (expression) => {
            const { result, exceptionDetails } = await Runtime.evaluate({
                expression,
                awaitPromise: true,
                returnByValue: true,
            });
            if (exceptionDetails)
                throw new Error(
                    `${expression.slice(0, 80)}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`
                );
            return result.value;
        };
        const open = async (url) => {
            const loaded = Page.loadEventFired();
            inflight.clear();
            pageLoader = null;
            ({ loaderId: pageLoader } = await Page.navigate({ url }));
            await loaded;
        };
        // Quiet: no request for 300ms (10s at most), then two frames.
        const settle = async () => {
            const start = Date.now();
            let quietSince = Date.now();
            while (Date.now() - start < 10000) {
                await delay(50);
                if (inflight.size) quietSince = Date.now();
                else if (Date.now() - quietSince >= 300) break;
            }
            await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
        };

        // Only its own: the width folders, the diffs and the report. Anything else kept in the folder stays.
        for (const own of [...widths.map(({ width }) => String(width)), "diff", "report.json"])
            await rm(join(args.out, own), { recursive: true, force: true });
        for (const { width, height } of widths) {
            const metrics = (h) =>
                Emulation.setDeviceMetricsOverride({ width, height: h, deviceScaleFactor: 1, mobile: false });
            await metrics(height);
            await open(api.url);
            await evaluate("localStorage.clear()");
            await open(api.url);
            await evaluate(`(async () => {
                const { menuTree } = await import("/menu/pageRegistry.js");
                for (let i = 0; i < 200 && !menuTree.val; i++) await new Promise((r) => setTimeout(r, 50));
            })()`);
            await evaluate(PAGE_HELPERS);
            await settle();
            errors = [];

            // A world's pages are its list in the sidebar, so each one is opened by its id.
            const worlds = await evaluate(
                `import("/menu/pageRegistry.js").then((r) => r.menuTree.val.map((w) => ({
                    name: w.folder,
                    open: { world: w.id },
                    pages: w.systems.flatMap((s) =>
                        s.pages.map((p) => ({ id: p.id, path: s.pages.length > 1 ? [s.name, p.tab || p.system] : [s.name] }))
                    ),
                })))`
            );
            if (picked) {
                const known = new Set(worlds.flatMap((w) => w.pages.map((p) => p.id)));
                const unknown = [...picked].filter((id) => !known.has(id));
                if (unknown.length) throw new Error(`--pages: no page has the id ${unknown.join(", ")}.`);
                pickedShots = worlds.flatMap((w) =>
                    w.pages.filter((p) => picked.has(p.id)).map((p) => [w.name, ...p.path.map(slug)].join("/"))
                );
            }
            const areas = [
                { name: "home", open: { view: "HOME" } },
                { name: "cheats", open: { view: "CHEATS" } },
                { name: "settings", open: { view: "CONFIG" } },
                { name: "value-search", open: { view: "SEARCH" } },
                { name: "devtools", open: { view: "DEVTOOLS" } },
                { name: "account-options", open: { view: "ACCOUNT_OPTIONS" } },
                ...worlds,
            ]
                .filter((area) => !args.only || area.name.includes(args.only))
                .map((area) => (picked ? { ...area, pages: (area.pages ?? []).filter((p) => picked.has(p.id)) } : area))
                .filter((area) => !picked || area.pages.length);
            if (picked) {
                const kept = new Set(areas.flatMap((area) => (area.pages ?? []).map((p) => p.id)));
                const dropped = [...picked].filter((id) => !kept.has(id));
                if (dropped.length) throw new Error(`--only=${args.only} leaves out --pages ${dropped.join(", ")}.`);
            }

            const shoot = async (path) => {
                let name = `${width}/${path.join("/")}`;
                for (let n = 2; shots.some((s) => s.name === name); n++) name = `${width}/${path.join("/")}-${n}`;
                await settle();
                const overflow = await evaluate("__shots.overflow()");
                // The layout rules, at rest and as on a touch screen, where every row shows its − / + and pickers.
                const measure = () => evaluate(`(${collectLayout})(document)`);
                const quiet = await measure();
                await Emulation.setEmulatedMedia({ features: [{ name: "hover", value: "none" }] });
                await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
                const shown = await measure();
                await Emulation.setEmulatedMedia({ features: [] });
                const layout = layoutBreaks(quiet, shown);
                await metrics(Math.min(MAX_HEIGHT, Math.max(height, await evaluate("__shots.height()"))));
                await settle();
                const { data } = await Page.captureScreenshot({ format: "png" });
                await metrics(height);
                const file = join(args.out, `${name}.png`);
                await mkdir(dirname(file), { recursive: true });
                await writeFile(file, data, "base64");
                shots.push({ name, errors, overflow, layout, diff: null, misses: Object.fromEntries(api.game.misses) });
                errors = [];
                api.game.misses.clear();
                process.stdout.write(".");
            };
            // Click every tab of the first tab row not opened yet, and go into each; a page with none is a shot.
            const crawl = async (path, opened) => {
                const nav = await evaluate(`__shots.nextNav(${JSON.stringify(opened)})`);
                if (!nav) return shoot(path);
                for (const [index, label] of nav.labels.entries()) {
                    await evaluate(`__shots.click(${JSON.stringify(nav.key)}, ${index})`);
                    await settle();
                    await crawl([...path, slug(label)], [...opened, nav.key]);
                }
            };
            for (const area of areas) {
                for (const page of area.pages?.length ? area.pages : [null]) {
                    const open = page ? { ...area.open, page: page.id } : area.open;
                    await evaluate(
                        `import("/state/store.js").then((m) => m.default.openMenu(${JSON.stringify(open)}))`
                    );
                    await settle();
                    await crawl([area.name, ...(page ? page.path.map(slug) : [])], []);
                }
            }
        }
        process.stdout.write("\n");

        // Compare with the baseline in a blank page.
        const baselineNames = await listPngs(args.baseline);
        await open("about:blank");
        for (const shot of shots) {
            if (!baselineNames.includes(shot.name)) continue;
            const [before, after] = await Promise.all(
                [args.baseline, args.out].map((dir) => readFile(join(dir, `${shot.name}.png`), "base64"))
            );
            const { image, ...diff } = await evaluate(
                `(${COMPARE})(${JSON.stringify(before)}, ${JSON.stringify(after)})`
            );
            shot.diff = diff;
            if (image) {
                const file = join(args.out, "diff", `${shot.name}.png`);
                await mkdir(dirname(file), { recursive: true });
                await writeFile(file, image, "base64");
            }
        }
    } finally {
        await close();
        api.server.close();
    }

    const summary = summarize(shots, await listPngs(args.baseline), threshold);
    const report = {
        threshold,
        shots: shots.map((shot) => ({ ...shot, flags: flagsFor(shot, threshold) })),
        ...summary,
    };
    await mkdir(args.out, { recursive: true });
    await writeFile(join(args.out, "report.json"), JSON.stringify(report, null, 2));
    console.log(summary.text);
    console.log(`\nScreenshots and report.json: ${relative(process.cwd(), args.out) || "."}`);
    if (args["update-baseline"]) {
        await rm(args.baseline, { recursive: true, force: true });
        await cp(args.out, args.baseline, { recursive: true, filter: (src) => !/[\\/]diff([\\/]|$)/.test(src) });
        console.log(`This run is now the baseline: ${relative(process.cwd(), args.baseline)}`);
    }
    process.exitCode = summary.flagged.length ? 1 : 0;
}

await main();
