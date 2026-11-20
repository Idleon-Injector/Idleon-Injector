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
// About 400 copies of 20-70 KB: ~20 MB. The cap is only a safety net for unusually large saves.
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
 *
 * @param {{ character: string, save: object }} copy
 * @param {{ character: string, save: object }} now
 * @returns {Array<{ key: string, changes: Array<{ path: string, copy: any, now: any, neverRestored: boolean, restorable: boolean }> }>}
 */
function diffSave(copy, now) {
    const groups = new Map();
    const add = (keys, filePath, copyValue, nowValue) => {
        const neverRestored = isNeverRestored(keys);
        const restorable =
            copyValue !== undefined &&
            !neverRestored &&
            keys.every(writableKey) &&
            // A map can't be rebuilt from JSON (the game's maps are objects of its own class), and a top-level value
            // that is an object may be one of the injector's proxies.
            !isMap(copyValue) &&
            !isMap(nowValue) &&
            !(keys.length === 1 && isObject(nowValue));
        if (!groups.has(keys[0])) groups.set(keys[0], []);
        groups.get(keys[0]).push({ path: filePath, copy: copyValue, now: nowValue, neverRestored, restorable });
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
 * @returns {Array<{ path: string, value: any }>}
 */
function restoreWrites(groups, select) {
    const selected = (p) =>
        select === "all" || select.some((s) => p === s || p.startsWith(`${s}.`) || p.startsWith(`${s}[`));
    return groups
        .flatMap((group) => group.changes)
        .filter((change) => change.restorable && selected(change.path))
        .map((change) => ({ path: `gga.${change.path}`, value: change.copy }));
}

// <ISO time with - for :>_<character>.json.gz, e.g. 2026-11-20T01-02-03-456Z_Luumii.json.gz
const FILE = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3}Z)_(\w+)\.json\.gz$/;

/**
 * Store a copy (the JSON from the game) and return its id. Written to a temporary file and renamed, so a crash
 * can't leave half a copy.
 */
async function writeCopy(dir, time, json) {
    const character = String(JSON.parse(json).character).replace(/\W/g, "_");
    const id = `${new Date(time).toISOString().replace(/[:.]/g, "-")}_${character}`;
    const file = path.join(dir, `${id}.json.gz`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${file}.tmp`, await gzip(json));
    await fs.rename(`${file}.tmp`, file);
    return id;
}

/**
 * Every stored copy, newest first.
 * @returns {Promise<Array<{ id: string, time: number, character: string, size: number }>>}
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
        copies.push({
            id: name.slice(0, -".json.gz".length),
            time: Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}`),
            character: m[5],
            size,
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
 * drop the oldest kept ones while the total is over the size cap.
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
        if (age < DAY || (newestOfDay && age < 30 * DAY)) kept.push(copy);
        else expired.push(copy.id);
    }
    let total = kept.reduce((sum, copy) => sum + copy.size, 0);
    let trimmed = 0;
    // The newest copy always stays, whatever its size.
    while (total > maxBytes && kept.length > 1) {
        const oldest = kept.pop();
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
