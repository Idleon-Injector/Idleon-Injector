/**
 * API Module
 * Centralizes all fetch requests to the backend.
 * purely handles data: Returns Promises that resolve with data or reject with Error.
 */

const API_BASE = "/api";

/**
 * Generic internal request helper
 * @param {string} endpoint - relative path (e.g. '/config')
 * @param {object} options - fetch options
 */
async function _request(endpoint, options = {}) {
    // Clean endpoint to prevent double slashes when joining with API_BASE
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    const url = `${API_BASE}/${cleanEndpoint}`;

    try {
        const response = await fetch(url, options);

        if (response.status === 204) return null;

        const contentType = response.headers.get("content-type");
        let data = {};

        if (contentType && contentType.includes("application/json")) {
            data = await response.json().catch(() => ({}));
        }

        if (!response.ok) {
            throw new Error(data.details || data.error || data.message || `HTTP Error ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

export async function fetchCheatStates() {
    return _request("/cheat-states");
}

export async function fetchCheatsData() {
    return _request("/cheats");
}

/** Fetch bundle names, codes, and live ownership flags from the injected runtime. */
export async function fetchBundleCatalog() {
    const data = await _request("/game/bundles");
    return data.bundles;
}

/**
 * Run a cheat. `on` sets a toggle cheat to that state instead of flipping it.
 * Resolves with `{ ok: true, message }`; a cheat that failed rejects with its message.
 */
export async function executeCheatAction(action, on) {
    const result = await _request("/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, on }),
    });
    if (!result.ok) throw new Error(result.message);
    return result;
}

export async function fetchConfig() {
    return _request("/config");
}

/** List the menu's page modules and their stylesheets (paths under /pages/). */
export async function fetchPageFiles() {
    return _request("/pages");
}

export async function fetchAppInfo() {
    return _request("/app-info");
}

export async function checkForUpdate(force = false) {
    return _request(`/update/check${force ? "?force=1" : ""}`);
}

export async function applyUpdate() {
    return _request("/update/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
}

export async function updateSessionConfig(updatedConfig) {
    return _request("/config/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
    });
}

export async function saveConfigFile(configToSave) {
    return _request("/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToSave),
    });
}

export async function fetchDevToolsUrl() {
    const data = await _request("/devtools-url");
    if (data && data.url) return data.url;
    throw new Error("No URL received from backend");
}

export async function checkHeartbeat() {
    try {
        return await _request("/heartbeat");
    } catch {
        return null;
    }
}

export async function openExternalUrl(url) {
    return _request("/open-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    });
}

export async function fetchGgaKeys() {
    const data = await _request("/search/keys");
    return data.keys || [];
}

/**
 * Search GGA values.
 * @param {string} query
 * @param {string[]} keys
 * @param {{ withinPaths?: string[], compare?: { op: "gt"|"lt", value: number } }|null} [options]
 * @returns {Promise<{results: Array, totalCount: number, truncated?: boolean}>}
 */
export async function searchGga(query, keys, options = null) {
    return _request("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            keys,
            withinPaths: options?.withinPaths || null,
            compare: options?.compare || null,
        }),
    });
}

/**
 * Read a value from cList (gga.CustomLists.h) by dot/bracket path.
 * @param {string} path - e.g. "Tome[27]" or "RANDOlist[16]"
 * @returns {Promise<any>} The resolved value (unwrapped from { value } envelope)
 */
export async function readCList(path) {
    const data = await _request("/game/gga/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `gga.CustomLists.h.${path}` }),
    });
    return data.value;
}

/**
 * Read selected entries from a large GGA object map.
 * The "gga." prefix is automatically prepended to rootPath.
 * @param {string} rootPath - e.g. "ItemDefinitionsGET.h"
 * @param {string[]} keys - Entry keys to read
 * @param {string[]=} fields - Optional field whitelist per entry
 * @returns {Promise<object>} Object keyed by requested entries
 */
export async function readGgaEntries(rootPath, keys, fields) {
    const normalizedRootPath = rootPath.startsWith("gga.") ? rootPath : `gga.${rootPath}`;
    const data = await _request("/game/gga/read-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: normalizedRootPath, keys, fields }),
    });
    return data.value || {};
}

const normalizeForCompare = (input) => {
    if (Array.isArray(input)) return input.map((entry) => normalizeForCompare(entry));
    if (input && typeof input === "object") {
        const out = {};
        for (const key of Object.keys(input).sort()) out[key] = normalizeForCompare(input[key]);
        return out;
    }
    return input;
};

const coerceNumericForCompare = (input) => {
    if (typeof input === "number") return Number.isNaN(input) ? undefined : input;
    if (typeof input === "string") {
        const trimmed = input.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const coerceBooleanForCompare = (input) => {
    if (typeof input === "boolean") return input;
    if (typeof input === "number") {
        if (input === 1) return true;
        if (input === 0) return false;
        return undefined;
    }
    if (typeof input === "string") {
        const normalized = input.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
        return undefined;
    }
    return undefined;
};

export const matchesVerifiedValue = (expected, actual) => {
    if (typeof expected === "number") {
        const normalizedActual = coerceNumericForCompare(actual);
        if (typeof normalizedActual === "undefined") return false;
        return Object.is(expected, normalizedActual);
    }
    if (typeof expected === "string") return String(actual) === String(expected);
    if (typeof expected === "boolean") return coerceBooleanForCompare(actual) === expected;
    if (expected === null) return actual === null;
    if (Array.isArray(expected) || (expected && typeof expected === "object")) {
        return JSON.stringify(normalizeForCompare(actual)) === JSON.stringify(normalizeForCompare(expected));
    }
    if (typeof expected === "undefined") return typeof actual === "undefined";
    return Object.is(actual, expected);
};

/**
 * Unified read/write helper with built-in typed verification.
 * Read mode:
 *   gga(path) -> returns the raw resolved value
 * Write mode:
 *   gga(path, value) -> returns true/false
 *
 * Verification is semantic/coercive by design for account-page workflows:
 * - numbers can match numeric strings (e.g. 1 === "1")
 * - booleans can match 1/0 and "true"/"false"
 * - objects/arrays are normalized before structural comparison
 *
 * @param {string} path
 * @param {any=} value
 * @returns {Promise<any|boolean>}
 */
export async function gga(path, value) {
    const ggaPath = `gga.${path}`;
    const isWrite = arguments.length >= 2;

    if (!isWrite) {
        const data = await _request("/game/gga/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: ggaPath }),
        });
        return data.value;
    }

    try {
        // The game reads the value back in the same call as the write, before a game tick can change it (#78).
        const { value: verifiedValue } = await _request("/game/gga/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: ggaPath, value }),
        });
        const matches = matchesVerifiedValue(value, verifiedValue);

        if (!matches) {
            console.error(
                `[gga] Write mismatch at ${path}: expected ${JSON.stringify(value)}, got ${JSON.stringify(verifiedValue)}`
            );
            return false;
        }

        return true;
    } catch (error) {
        console.error(`[gga] Write failed at ${path}:`, error);
        return false;
    }
}

/** Delete a cached or derived GGA property by dot/bracket path. */
export async function deleteGga(path) {
    const ggaPath = path.startsWith("gga.") ? path : `gga.${path}`;
    const data = await _request("/game/gga/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ggaPath }),
    });

    if (!data?.ok) throw new Error(`Failed to delete ${ggaPath}`);
}

/**
 * Write many GGA paths in one backend/CDP round-trip and verify each against the value the game
 * read back in that same call, with the same typed comparison as single writes.
 * With `character`, the game writes nothing unless that character is in play, and the request rejects saying who is.
 *
 * @param {Array<{ path: string, value: any }>} writes
 * @param {{ character?: string }} [options]
 * @returns {Promise<{ ok: boolean, results: Array<{ path: string, ok: boolean, actual?: any, error?: string }> }>}
 */
export async function ggaMany(writes, { character } = {}) {
    const normalizedWrites = Array.isArray(writes)
        ? writes.map((entry) => {
              const rawPath = typeof entry?.path === "string" ? entry.path : "";
              return {
                  path: rawPath.startsWith("gga.") ? rawPath : rawPath ? `gga.${rawPath}` : "",
                  value: entry?.value,
                  expect: entry?.expect,
              };
          })
        : [];

    const writeResult = await _request("/game/gga/write-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writes: normalizedWrites, character }),
    });

    const writeByPath = new Map(
        Array.isArray(writeResult?.results) ? writeResult.results.map((entry) => [entry?.path, entry]) : []
    );
    const writeEntries = normalizedWrites.map(
        (entry, index) => writeByPath.get(entry.path) ?? writeResult?.results?.[index]
    );
    // Each written entry's `value` is read back in the game's same call, before a game tick can change it (#78).
    const results = normalizedWrites.map((entry, index) => {
        const writeEntry = writeEntries[index];
        if (!writeEntry?.ok) {
            return {
                path: writeEntry?.path ?? entry.path,
                ok: false,
                error: writeEntry?.error ?? "Batch write failed",
            };
        }

        const actual = writeEntry.value;
        if (!matchesVerifiedValue(entry.value, actual)) {
            console.error(
                `[ggaMany] Write mismatch at ${entry.path}: expected ${JSON.stringify(entry.value)}, got ${JSON.stringify(actual)}`
            );
            return { path: entry.path, ok: false, actual, error: "Write mismatch" };
        }

        return { path: entry.path, ok: true, actual };
    });

    return {
        ok: results.every((result) => result.ok),
        results,
    };
}

/**
 * Read a computed value from a game helper family.
 * Example: readComputed("workbench", "ExtraMaxLvAtom", [baseMax, index])
 *
 * @param {string} namespace
 * @param {string} name
 * @param {Array=} args
 * @returns {Promise<any>}
 */
export async function readComputed(namespace, name, args = []) {
    const data = await _request("/game/computed/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, name, args }),
    });
    return data.value;
}

/**
 * Read many computed values from one game helper family in one backend/CDP round-trip.
 *
 * @param {string} namespace
 * @param {string} name
 * @param {Array[]=} argSets
 * @returns {Promise<Array<{ ok: boolean, value?: any, error?: string }>>}
 */
export async function readComputedMany(namespace, name, argSets = []) {
    const data = await _request("/game/computed/read-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, name, argSets }),
    });
    return data.value || [];
}

/**
 * The save copies the injector keeps (one per cloud save), newest first, and the last failure to store one.
 * @returns {Promise<{ copies: Array<{ id: string, time: number, character: string, size: number }>, warning: string|null }>}
 */
export async function fetchSaveCopies() {
    return _request("/save-copies");
}

/**
 * Every difference between a save copy and the save now, by top-level save key. Values marked `neverRestored`
 * (gems and bundles received from the server, the time-away stamps) and others not `restorable` are shown only.
 * Rejects when the copy was taken while playing another character.
 *
 * @param {string} id
 * @returns {Promise<{ id: string, character: string, groups: Array<{ key: string, changes: Array<{ path: string, copy: any, now: any, neverRestored: boolean, restorable: boolean }> }> }>}
 */
export async function compareSaveCopy(id) {
    return _request("/save-copies/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    });
}

/**
 * Put a save copy's values back, through the same game write as ggaMany, each read back and checked.
 * `select` is "all" or a list of paths from compareSaveCopy (a path selects everything under it, e.g. "Cards").
 *
 * @param {string} id
 * @param {"all" | string[]} select
 * @returns {Promise<{ ok: boolean, results: Array<{ path: string, ok: boolean, error?: string }> }>}
 */
export async function restoreSaveCopy(id, select) {
    return _request("/save-copies/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, select }),
    });
}

/**
 * Read many GGA paths in one round-trip, without verification: each result says whether its path could be read.
 * @param {string[]} paths
 * @returns {Promise<Array<{ path: string, ok: boolean, value?: any, error?: string }>>}
 */
export async function readGgaMany(paths) {
    const data = await _request("/game/gga/read-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: paths.map((path) => (path.startsWith("gga.") ? path : `gga.${path}`)) }),
    });
    return data.results;
}

/**
 * The change log this game session, newest action first.
 * @returns {Promise<{ actions: Array<{ id: string, page: string, label: string, time: number, undoneAt?: number, entries: Array<{ path: string, before: any, hasBefore: boolean, after: any, character: string|null, live: boolean, undone: boolean }> }> }>}
 */
export async function fetchChanges() {
    return _request("/changes");
}

/** Add saved values to an action in the change log (the action is made on its first save). */
export async function logChanges(action, entries) {
    return _request("/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entries }),
    });
}

/** Mark entries of an action (by their index) as undone. */
export async function markChangesUndone(id, indexes) {
    return _request("/changes/undone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, indexes }),
    });
}
