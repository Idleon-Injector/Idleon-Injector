/**
 * Save copies (#32): a copy of the save at every cloud save, kept on the player's PC, compared with the save now and
 * restored value by value. The game side keeps the copy in memory (src/cheats/core/saveCopy.js); the server pulls it
 * and stores it here, one gzipped JSON file per copy, named by time so the folder sorts by time.
 */
const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// About 400 copies of ~120 KB (the test account, gzipped): ~47 MB. The cap is a safety net for larger saves.
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

/**
 * The values a restore never writes back, because the game would grant them twice or misread them. Each is a path
 * pattern over the save's keys ("*" matches any one key). The quotes are from the game's code (N.js, 2026-11).
 */
const NEVER_RESTORED = [
    // Gems bought on the server. On load the game adds the ones it hasn't counted yet:
    // GemsOwned + Math.max(ServerGems - ServerGemsReceived, 0), then ServerGemsReceived = Math.max(...).
    // An older, lower value hands the same gems out again.
    ["ServerGemsReceived"],
    // Bundles bought on the server. On load each one the server has but this map lacks is sent again:
    // 1!=BundlesReceived.h.bun_a && 1==u.getLoad("bun_a") && u.addToMessageQueue("SERVER_CODE","SERVER_ITEM_BUNDLE","bun_a")
    ["BundlesReceived"],
    // The time-away stamps (Forge, Cauldron, Construction, Cooking, Pets, Sailing, and Player for the character in
    // play). The away gains are the time since the stamp: TimeAway.h.GlobalTime - TimeAway.h[this._DummyText], then
    // AFKcode(this._DummyText, ...). An old stamp is a false away gain.
    ["TimeAway"],
    // Each other character's time-away stamp, kept in its PlayerDATABASE entry:
    // TimeAway.h.Player = DummyMap.h.PlayerAwayTime when the character is played.
    ["PlayerDATABASE", "h", "*", "h", "PlayerAwayTime"],
    // Not in the issue's list, kept out for the same reason: the game only counts it up, and at start the cloud save
    // is only loaded if it isn't older than the local one: u.getLoad("CloudsaveTimer") >= CloudsaveTimer.
    // A lower value makes the next start skip the cloud save.
    ["CloudsaveTimer"],
];

const isNeverRestored = (keys) =>
    NEVER_RESTORED.some((pattern) => pattern.every((key, i) => key === "*" || key === keys[i]));

/**
 * Gems the player bought on the server since the copy: ServerGemsReceived went up, and the game added them to
 * GemsOwned (see NEVER_RESTORED). Putting back the copy's GemsOwned or gem purchases would lose them for good, since
 * the game never hands out gems it already counted.
 */
const GEM_KEYS = new Set(["GemsOwned", "GemsPacksPurchased", "GemItemsPurchased"]);

/**
 * The values the game moves by itself while the player is away or idle (timers, progress bars, away gains), so the
 * History page can keep them out of the way. Each is a path as diffSave writes it, with any character's name as "*".
 * Measured on the test accounts: every one changed in at least half of the 4-minute gaps between idle saves.
 * ponytail: a hand list from two accounts; a bigger account moves more, which then shows with the player's own changes.
 */
const ON_ITS_OWN = new RegExp(
    `^(${[
        "TimeAway\\b.*",
        "CloudsaveTimer",
        "Exp0\\[\\d+\\]",
        "PlayerDATABASE\\.h\\.\\*\\.h\\.(Exp0\\[\\d+\\]|PldTraps\\[\\d+\\]\\[2\\]|PlayerAwayTime)",
        "PlacedTraps\\[\\d+\\]\\[2\\]",
        "FarmPlot\\[\\d+\\]\\[6\\]",
        "Territory\\[\\d+\\]\\[0\\]",
        "Breeding\\[25\\]\\[\\d+\\]",
        "Refinery\\[[02]\\]\\[\\d+\\]",
        "AnvilPA\\[\\d+\\]\\[2\\]",
        "CauldronInfo\\[[56]\\]\\[\\d+\\]",
        "CauldronP2W\\[4\\]\\[\\d+\\]",
        "Bubba\\[0\\]\\[\\d+\\]",
        "GamingSprout\\[\\d+\\]\\[1\\]",
        "Gaming\\[14\\]",
        "Summon\\[[23]\\]\\[\\d+\\]",
        "Spelunk\\[3\\]\\[\\d+\\]",
        "Research\\[3\\]\\[(6|13|14|15)\\]",
        "Research\\[7\\]\\[5\\]",
        "Holes\\[(2|9|11|25|27)\\]\\[\\d+\\]",
        "Holes\\[(18|33)\\]\\[0\\]",
        "TowerInfo\\[(6[2-5]|7[1-9]|8[0-7])\\]",
        "CookMaster\\[1\\]\\[1\\]",
        "Meals\\[[12]\\]\\[0\\]",
        "Menagerie\\[0\\]\\[15\\]",
        "Ninja\\[102\\]\\[2\\]",
        "Sushi\\[4\\]\\[[03]\\]",
        "ForgeIntervalProgress\\[\\d+\\]",
        // Timers and running totals kept in the account options: they moved in every idle gap, on both accounts.
        "OptionsListAccount\\[(45|87|124|253|263|288|289|305|423|439)\\]",
    ].join("|")})$`
);
const isOnItsOwn = (filePath) =>
    ON_ITS_OWN.test(filePath.replace(/^PlayerDATABASE\.h\.[^.]+\./, "PlayerDATABASE.h.*."));

const isObject = (value) => value !== null && typeof value === "object";
const isMap = (value) => isObject(value) && !Array.isArray(value);
// The path resolver splits on these, so a key holding one can't be written.
const writableKey = (key) => !/[.[\]]/.test(key);

/**
 * Every difference between a copy and the save now, by top-level save key. Each change has its path (as the path
 * resolver reads it, without "gga."), the copy's value, the value now, and whether a restore may write it.
 *
 * Objects are compared key by key, so maps and the injector's proxies are written into, never replaced. Below the
 * top level an array whose length changed is one change (written whole); a top-level array is compared by index.
 * The character in play has its data in the top-level keys, so its PlayerDATABASE entry is left out.
 * `gemsBought` marks the gem values a restore leaves alone because gems were bought since the copy (GEM_KEYS), and
 * `onItsOwn` the values the game moves by itself (ON_ITS_OWN).
 *
 * @param {{ character: string, save: object }} copy
 * @param {{ character: string, save: object }} now
 * @returns {Array<{ key: string, changes: Array<{ path: string, copy: any, now: any, neverRestored: boolean, gemsBought: boolean, onItsOwn: boolean, restorable: boolean }> }>}
 */
function diffSave(copy, now) {
    const groups = new Map();
    const boughtGems = (now.save.ServerGemsReceived ?? 0) > (copy.save.ServerGemsReceived ?? 0);
    const add = (keys, filePath, copyValue, nowValue) => {
        const neverRestored = isNeverRestored(keys);
        const gemsBought = boughtGems && GEM_KEYS.has(keys[0]);
        const restorable =
            copyValue !== undefined &&
            // Not in the save now (a map key the game dropped, a shorter array): a restore would add it, and an undo
            // couldn't take it away again.
            nowValue !== undefined &&
            !neverRestored &&
            !gemsBought &&
            keys.every(writableKey) &&
            // A map can't be rebuilt from JSON (the game's maps are objects of its own class), and a top-level value
            // that is an object may be one of the injector's proxies.
            !isMap(copyValue) &&
            !isMap(nowValue) &&
            !(keys.length === 1 && isObject(nowValue));
        if (!groups.has(keys[0])) groups.set(keys[0], []);
        groups.get(keys[0]).push({
            path: filePath,
            copy: copyValue,
            now: nowValue,
            neverRestored,
            gemsBought,
            onItsOwn: isOnItsOwn(filePath),
            restorable,
        });
    };
    const walk = (a, b, keys, filePath) => {
        if (a === b) return;
        const sameKind = isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b);
        if (!sameKind || (Array.isArray(a) && a.length !== b.length && keys.length > 1)) {
            add(keys, filePath, a, b);
            return;
        }
        if (Array.isArray(a)) {
            for (let i = 0; i < Math.max(a.length, b.length); i++)
                walk(a[i], b[i], [...keys, String(i)], `${filePath}[${i}]`);
            return;
        }
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (keys.length === 2 && keys[0] === "PlayerDATABASE" && key === now.character) continue;
            walk(a[key], b[key], [...keys, key], `${filePath}.${key}`);
        }
    };
    for (const key of new Set([...Object.keys(copy.save), ...Object.keys(now.save)])) {
        walk(copy.save[key], now.save[key], [key], key);
    }
    return [...groups].map(([key, changes]) => ({ key, changes }));
}

/**
 * The writes that put the selected changes back: "all", or a list of paths, each selecting itself and everything
 * under it ("Cards" selects every card, "PlayerDATABASE.h.Bob" one character). Changes a restore may not write are
 * never in it.
 * @param {ReturnType<typeof diffSave>} groups
 * @param {"all" | string[]} select
 * @returns {Array<{ path: string, value: any, expect?: any }>}
 */
function restoreWrites(groups, select) {
    const selected = (p) =>
        select === "all" || select.some((s) => p === s || p.startsWith(`${s}.`) || p.startsWith(`${s}[`));
    return groups
        .flatMap((group) => group.changes)
        .filter((change) => change.restorable && selected(change.path))
        .map((change) => ({
            path: `gga.${change.path}`,
            value: change.copy,
            // A gem bought between this plan and the write: the game refuses the restore rather than lose it (in the
            // game, the unguarded writes of a batch wait on its guarded ones).
            ...(GEM_KEYS.has(change.path.split(/[.[]/)[0]) ? { expect: change.now } : {}),
        }));
}

// <ISO time with - for :>_<character>[~<label>].json.gz, e.g. 2026-11-20T01-02-03-456Z_Luumii.json.gz. The label
// (base64url JSON) marks the copies a restore makes: { kind: "before" } or { kind: "restored", from, what }.
const FILE = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3}Z)_(\w+?)(?:~([\w-]+))?\.json\.gz$/;

/**
 * Store a copy (the JSON from the game), with an optional label, and return its id. Written to a temporary file and
 * renamed, so a crash can't leave half a copy; a copy never replaces another taken in the same millisecond.
 */
async function writeCopy(dir, time, json, label = null) {
    const character = String(JSON.parse(json).character).replace(/\W/g, "_");
    const tag = label ? `~${Buffer.from(JSON.stringify(label)).toString("base64url")}` : "";
    await fs.mkdir(dir, { recursive: true });
    const taken = new Set(await fs.readdir(dir));
    let at = time;
    const idAt = (t) => `${new Date(t).toISOString().replace(/[:.]/g, "-")}_${character}`;
    while ([...taken].some((name) => name.startsWith(`${idAt(at)}.`) || name.startsWith(`${idAt(at)}~`))) at++;
    const id = `${idAt(at)}${tag}`;
    const file = path.join(dir, `${id}.json.gz`);
    await fs.writeFile(`${file}.tmp`, await gzip(json));
    await fs.rename(`${file}.tmp`, file);
    return id;
}

/**
 * Every stored copy, newest first; `label` is null for a copy of a cloud save.
 * @returns {Promise<Array<{ id: string, time: number, character: string, size: number, label: object|null }>>}
 */
async function listCopies(dir) {
    let names;
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    const copies = [];
    for (const name of names) {
        const m = FILE.exec(name);
        if (!m) continue;
        const { size } = await fs.stat(path.join(dir, name));
        let label = null;
        try {
            label = m[6] ? JSON.parse(Buffer.from(m[6], "base64url").toString("utf8")) : null;
        } catch {
            label = null;
        }
        copies.push({
            id: name.slice(0, -".json.gz".length),
            time: Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}`),
            character: m[5],
            size,
            label,
        });
    }
    return copies.sort((a, b) => b.time - a.time);
}

/** A stored copy, as the game wrote it: `{ character, players, save }`. */
async function readCopy(dir, id) {
    if (!FILE.test(`${id}.json.gz`)) throw new Error(`No save copy ${id}`);
    const data = await fs.readFile(path.join(dir, `${id}.json.gz`)).catch(() => {
        throw new Error(`No save copy ${id}`);
    });
    return JSON.parse((await gunzip(data)).toString("utf8"));
}

const localDay = (time) => new Date(time).toDateString();

/**
 * Which copies to delete: keep every copy from the last 24 hours and the newest copy of each day for 30 days, then
 * drop the oldest kept ones while the total is over the size cap. A restore's own copies (labelled: "Before restore"
 * is the way back from it) stay their 30 days, and go last for the size cap.
 * @param {Awaited<ReturnType<typeof listCopies>>} copies - newest first
 * @returns {{ expired: string[], trimmed: number }} the ids to delete; `trimmed` of them only for the size cap
 */
function pickExpired(copies, now, maxBytes = MAX_TOTAL_BYTES) {
    const seenDays = new Set();
    const kept = [];
    const expired = [];
    for (const copy of copies) {
        const age = now - copy.time;
        const newestOfDay = !seenDays.has(localDay(copy.time));
        seenDays.add(localDay(copy.time));
        if (age < DAY || ((newestOfDay || copy.label) && age < 30 * DAY)) kept.push(copy);
        else expired.push(copy.id);
    }
    let total = kept.reduce((sum, copy) => sum + copy.size, 0);
    let trimmed = 0;
    // The newest copy always stays, whatever its size; the oldest cloud-save copies go before a restore's own.
    while (total > maxBytes && kept.length > 1) {
        const at = kept.findLastIndex((copy, i) => i > 0 && !copy.label);
        const [oldest] = kept.splice(at > 0 ? at : kept.length - 1, 1);
        total -= oldest.size;
        expired.push(oldest.id);
        trimmed++;
    }
    return { expired, trimmed };
}

/** Delete the copies retention no longer keeps; returns how many went for the size cap. */
async function pruneCopies(dir, now = Date.now()) {
    const { expired, trimmed } = pickExpired(await listCopies(dir), now);
    for (const id of expired) await fs.unlink(path.join(dir, `${id}.json.gz`));
    return trimmed;
}

module.exports = {
    NEVER_RESTORED,
    MAX_TOTAL_BYTES,
    diffSave,
    restoreWrites,
    writeCopy,
    listCopies,
    readCopy,
    pickExpired,
    pruneCopies,
};
