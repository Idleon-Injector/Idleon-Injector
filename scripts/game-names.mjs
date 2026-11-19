// The game names the injector depends on, checked against a pinned list taken from a known game version.
//
//   node scripts/game-names.mjs check            (part of npm run check) every name in src/cheats and src/ui must be
//                                                 in scripts/game-names.json; no game file needed
//   node scripts/game-names.mjs update [N.js]    look every name up in the game's code (a file path or URL; default:
//                                                 the web game), fail on missing ones, rewrite game-names.json and
//                                                 list the hooked game functions whose code changed
//   node scripts/game-names.mjs watch [N.js]     (the Game update watch workflow) compare the game's code with
//                                                 game-names.json; open one GitHub issue per game version that is off
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PINNED_PATH = path.join(root, "scripts", "game-names.json");
const SITE = "https://www.legendsofidleon.com";
const SOURCE_DIRS = ["src/cheats", "src/ui"];

// Names a pattern catches that belong to the injector, not the game.
const OWN_NAMES = new Set(["_isPatched", "gga", "cheatConfig", "injectorConfig"]);

// kind -> [regex over source text, how the captured name becomes the game name]
const PATTERNS = [
    ["class", /\bevents\((\d+)\)/g, (n) => `scripts.ActorEvents_${n}`],
    ["method", /["'.](_customBlock_\w+)/g],
    // Not inside a longer dotted name: "com.stencyl.behavior.Script" is a class name, not a behavior.
    ["behavior", /(?<![.\w$])behavior\.(\w+)/g],
    ["firebase", /(?<![.\w$])firebase\.(\w+)/g],
    ["clist", /\bcList\.(\w+)/g],
    ["clist", /\breadCList\(\s*["'`](\w+)/g],
    ["clist", /\bdefinitionsPath\s*:\s*["'`](\w+)/g],
    ["gga", /\bgga\.(\w+)/g],
    ["gga", /\b(?:gga|writeVerified|readGgaEntries)\(\s*["'`](\w+)/g],
    // Pages also pass a save key through settings like writePath: `UpgVault[${i}]`, levelsPath: "Atoms" or
    // const EQUIPPED_MAIN_PATH = "EquipmentOrder[0]"; hooks name one with createProxy(gga, "GemsOwned", ...).
    ["gga", /\b(?!definitionsPath\b)\w*(?:[pP]ath|PATH)\s*[:=]\s*["'`](\w+)(?=[[."'`])/g],
    ["gga", /\bcreate\w*Proxy\(\s*gga\s*,\s*["'`](\w+)/g],
    // defineHook({ early: "scripts.ActorEvents_116", ... }) hooks that class before setup.
    ["class", /\bearly\s*:\s*["'`](scripts\.ActorEvents_\d+)["'`]/g],
];
// ponytail: a name that only reaches the game through a variable or another helper isn't seen. The mod model (#14-#18)
// declares names in one place; the collector reads those declarations (defineHook so far).

// The game names one source file uses, as "kind:name" strings. Comments and import lines are skipped: a comment
// naming "firebase.js" or an import of "./gga.js" isn't a dependency. A // after a colon is a URL, not a comment.
export function namesInSource(text) {
    const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(?<![:"'`\\])\/\/.*$/gm, "")
        .replace(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["'][^"']*["'];?/gm, "")
        // defineHook({ target: () => firebase, method: "playButton" }) wraps firebase.playButton.
        .replace(/\btarget\s*:\s*\(\)\s*=>\s*([\w$.()]+)\s*,\s*method\s*:\s*["'`](\w+)["'`]/g, "$1.$2");
    const found = new Set();
    for (const [kind, re, toName = (n) => n] of PATTERNS) {
        for (const m of code.matchAll(re)) if (!OWN_NAMES.has(m[1])) found.add(`${kind}:${toName(m[1])}`);
    }
    return found;
}

// Every name used under src/cheats and src/ui -> the files that use it.
export function collectNames(dir = root) {
    const names = new Map();
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (p.endsWith(".js") && !p.includes(`${path.sep}vendor${path.sep}`)) {
                const rel = path.relative(dir, p).replaceAll("\\", "/");
                for (const n of namesInSource(fs.readFileSync(p, "utf8"))) {
                    if (!names.has(n)) names.set(n, new Set());
                    names.get(n).add(rel);
                }
            }
        }
    };
    for (const d of SOURCE_DIRS) walk(path.join(dir, d));
    return names;
}

// Where `.<name>=function` (or `<name>:function` with `sep` ":") starts its "function" keyword, or -1. The game's file
// has line breaks in odd places, for example between "=" and "function".
export function functionAt(game, name, sep = "=") {
    const head = sep === "=" ? `.${name}=` : `${name}:`;
    for (let i = game.indexOf(head); i >= 0; i = game.indexOf(head, i + 1)) {
        let k = i + head.length;
        while (k < game.length && /\s/.test(game[k])) k++;
        if (game.startsWith("function", k)) return k;
    }
    return -1;
}

// `text` somewhere not followed by more of a name: ".h.Cards" must not match ".h.Cards2".
const includesName = (game, text) => {
    for (let i = game.indexOf(text); i >= 0; i = game.indexOf(text, i + 1)) {
        if (!/[\w$]/.test(game[i + text.length] ?? "")) return true;
    }
    return false;
};

// How each kind appears in the game's code. Plain indexOf only: N.js holds a 1.4 MB run of word characters that an
// unanchored \w+ regex takes minutes on.
const IN_GAME = {
    class: (g, x) => g.includes(`["${x}"]=`),
    method: (g, x) => functionAt(g, x) >= 0,
    behavior: (g, x) => functionAt(g, x) >= 0,
    firebase: (g, x) => functionAt(g, x) >= 0 || functionAt(g, x, ":") >= 0,
    clist: (g, x) => g.includes(`"${x}"`) || includesName(g, `.${x}`),
    gga: (g, x) => g.includes(`"${x}"`) || includesName(g, `.h.${x}`),
};

export const inGame = (game, name) => {
    const [kind, ...rest] = name.split(":");
    return IN_GAME[kind](game, rest.join(":"));
};

// The source of `.<name>=function(...){...}`, from its first brace to the matching one, skipping strings and comments.
export function functionSource(game, name) {
    const at = functionAt(game, name);
    if (at < 0) return null;
    const open = game.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < game.length; i++) {
        const c = game[i];
        if (c === '"' || c === "'" || c === "`") {
            for (i++; i < game.length && game[i] !== c; i++) if (game[i] === "\\") i++;
        } else if (c === "/" && game[i + 1] === "*") {
            i = game.indexOf("*/", i + 2) + 1;
        } else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return game.slice(open, i + 1);
    }
    return null;
}

// A hash of a game function's code that ignores the minifier's renaming: identifiers of up to three characters that
// aren't property names (e, t, Na, ...) all count as the same name. Property names, strings and numbers count.
export function fingerprint(game, name) {
    const src = functionSource(game, name);
    if (src === null) return null;
    const normal = src.replace(/(?<![.\w$])[A-Za-z_$][\w$]{0,2}(?![\w$])/g, "_");
    return createHash("sha256").update(normal).digest("hex").slice(0, 16);
}

// The functions worth a fingerprint: the game methods and behaviors the injector names.
const fingerprinted = (names) =>
    [...names]
        .filter((n) => n.startsWith("method:") || n.startsWith("behavior:"))
        .map((n) => n.slice(n.indexOf(":") + 1))
        .sort();

export function unknownNames(names, pinned) {
    const known = new Set(Object.entries(pinned.names).flatMap(([kind, list]) => list.map((x) => `${kind}:${x}`)));
    return [...names.keys()].filter((n) => !known.has(n)).sort();
}

export function buildPinned(names, game, meta) {
    const byKind = {};
    for (const n of [...names.keys()].sort()) {
        const [kind, ...rest] = n.split(":");
        (byKind[kind] ??= []).push(rest.join(":"));
    }
    const fingerprints = {};
    for (const f of fingerprinted(names.keys())) fingerprints[f] = fingerprint(game, f);
    return { game: meta, names: byKind, fingerprints };
}

// The web game's N.js. Its folder (ytGl5oc in 2026) can change, so it's read from the site's "Play" link, which
// lives in one of the scripts the landing page loads.
export async function findWebGameUrl(fetchText = async (url) => (await fetch(url)).text()) {
    const landing = await fetchText(`${SITE}/`);
    for (const [, script] of landing.matchAll(/(?:href|src)="(\/[^"]+\.js)"/g)) {
        const folder = (await fetchText(`${SITE}${script}`)).match(/className:"[^"]*Play[^"]*",href:"\/([\w-]+)\/"/);
        if (folder) return `${SITE}/${folder[1]}/N.js`;
    }
    throw new Error(`No Play link found on ${SITE}: the site changed, so the watcher can't find the game's code.`);
}

async function loadGame(source) {
    if (!/^https?:/.test(source)) {
        const text = fs.readFileSync(source, "utf8");
        return { text, meta: { source: path.basename(source), sha256: sha256(text) } };
    }
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    const text = await res.text();
    const meta = { source, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
    return { text, meta: { ...meta, sha256: sha256(text) } };
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// What's off between the code's game names, the pinned fingerprints and one version of the game's code.
export function compare(names, pinned, game) {
    const missing = [...names.keys()].filter((n) => !inGame(game, n)).sort();
    const changed = Object.entries(pinned.fingerprints)
        .filter(([f, hash]) => hash !== null && fingerprint(game, f) !== hash)
        .map(([f]) => f)
        .sort();
    return { missing, changed };
}

// The issue for a game version that breaks something, or null. Its title carries the version id, so the watcher can
// tell it already reported that version.
export function watchIssue({ missing, changed }, meta, names) {
    if (!missing.length && !changed.length) return null;
    const id = meta.sha256.slice(0, 12);
    const day = meta.lastModified ? new Date(meta.lastModified).toISOString().slice(0, 10) : "new version";
    const counts = [];
    if (missing.length) counts.push(`${missing.length} missing game name${missing.length > 1 ? "s" : ""}`);
    if (changed.length) counts.push(`${changed.length} changed game function${changed.length > 1 ? "s" : ""}`);
    const lines = [
        `The web game's code changed (\`N.js\` from ${meta.lastModified ?? "an unknown date"}, sha256 \`${id}\`).`,
    ];
    if (missing.length) {
        lines.push("", "Missing from the game's code. The code that uses them is broken until it's fixed:");
        for (const n of missing) lines.push(`- \`${n}\` in ${[...(names.get(n) ?? [])].join(", ")}`);
    }
    if (changed.length) {
        lines.push(
            "",
            "Game functions the injector names whose code changed. Check that their hooks still do the right thing:"
        );
        for (const f of changed) lines.push(`- \`${f}\``);
    }
    lines.push(
        "",
        "Once the code is fixed, run `npm run game-names:update` and commit `scripts/game-names.json`. The watcher then finds nothing for this version.",
        "",
        "Opened by the Game update watch workflow."
    );
    // known-problem: lumbot tells players about open issues with this label.
    return {
        id,
        title: `Game update ${day} (${id}): ${counts.join(", ")}`,
        body: lines.join("\n"),
        labels: ["known-problem"],
    };
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
const GITHUB = {
    issueTitles: () =>
        JSON.parse(gh("issue", "list", "--state", "all", "--limit", "1000", "--json", "title")).map((i) => i.title),
    openIssue: ({ title, body, labels }) =>
        gh(
            "issue",
            "create",
            "--title",
            title,
            "--body",
            body,
            ...labels.flatMap((label) => ["--label", label])
        ).trim(),
};

// One watch run: report a game version once. A version already in an issue title (open or closed) is skipped.
export async function watch({ names, pinned, source, load = loadGame, github = GITHUB, log = console.log }) {
    const { text, meta } = await load(source);
    const issue = watchIssue(compare(names, pinned, text), meta, names);
    if (!issue) return log(`The game's code (${meta.sha256.slice(0, 12)}) matches the pinned names and fingerprints.`);
    if (github.issueTitles().some((t) => t.includes(`(${issue.id})`))) return log(`Already reported: ${issue.id}`);
    log(`Opened ${github.openIssue(issue)}`);
}

const where = (names, n) => [...names.get(n)].join(", ");
const readPinned = () => JSON.parse(fs.readFileSync(PINNED_PATH, "utf8"));

async function main([command = "check", source]) {
    const names = collectNames();
    if (command === "check") {
        const unknown = unknownNames(names, readPinned());
        for (const n of unknown) console.error(`Unknown game name ${n} (${where(names, n)})`);
        if (unknown.length) {
            console.error("If the name is new, run: npm run game-names:update");
            return 1;
        }
        console.log(`game names: ${names.size} known`);
        return 0;
    }
    if (command === "watch") {
        await watch({ names, pinned: readPinned(), source: source ?? (await findWebGameUrl()) });
        return 0;
    }
    if (command === "update") {
        const { text, meta } = await loadGame(source ?? (await findWebGameUrl()));
        const missing = [...names.keys()].filter((n) => !inGame(text, n)).sort();
        for (const n of missing) console.error(`Not in the game's code: ${n} (${where(names, n)})`);
        if (missing.length) return 1;
        const old = fs.existsSync(PINNED_PATH) ? JSON.parse(fs.readFileSync(PINNED_PATH, "utf8")) : null;
        const pinned = buildPinned(names, text, meta);
        for (const [f, hash] of Object.entries(pinned.fingerprints)) {
            if (hash === null) console.error(`Couldn't read the code of ${f}`);
            else if (old?.fingerprints?.[f] && old.fingerprints[f] !== hash) console.log(`Changed in the game: ${f}`);
        }
        fs.writeFileSync(PINNED_PATH, `${JSON.stringify(pinned, null, 4)}\n`);
        console.log(`game-names.json: ${names.size} names, ${Object.keys(pinned.fingerprints).length} fingerprints`);
        return 0;
    }
    console.error("usage: node scripts/game-names.mjs check | update [N.js path or URL] | watch [N.js path or URL]");
    return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2)).catch((err) => {
        console.error(err.message);
        return 1;
    });
}
