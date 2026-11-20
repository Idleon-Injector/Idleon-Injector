/**
 * Shared UI Utilities
 * Common functions used across multiple UI files
 */

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Apply the fields that differ between base and edited onto latest.
 * Everything the user did not touch keeps its value from latest.
 * @param {object} latest - Current settings; mutated and returned
 * @param {object} base - Settings the edits started from
 * @param {object} edited - Settings including the user's edits
 * @returns {object} latest with the edits applied
 */
export function applyConfigEdits(latest, base, edited) {
    for (const [key, value] of Object.entries(edited)) {
        if (isPlainObject(value) && isPlainObject(latest[key])) {
            applyConfigEdits(latest[key], base?.[key], value);
        } else if (JSON.stringify(value) !== JSON.stringify(base?.[key])) {
            latest[key] = value;
        }
    }
    return latest;
}

/**
 * Debounce a function call
 * @param {Function} func - The function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Convert a game table payload into an index-ordered array.
 * Supports native arrays and object-keyed arrays returned by the bridge.
 * @param {unknown} raw
 * @returns {Array}
 */
export function toIndexedArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    return Object.keys(raw)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k]);
}

/**
 * Bring an element the menu search landed on into view and flash it once (`.search-found`).
 * `find` returns the element or null; it is retried while the page is still rendering it (about 2 s at most).
 * @param {() => Element|null} find
 * @param {boolean} [focus] - also focus it (a button or field), or the first field inside it
 */
export function revealFound(find, focus = false, tries = 40) {
    // Always wait a beat first: the page switch and the row's category render on VanJS's next update.
    setTimeout(() => {
        const el = find();
        if (!el || !el.offsetParent) {
            if (tries > 0) revealFound(find, focus, tries - 1);
            return;
        }
        showFound(el, focus);
    }, 50);
}

function showFound(el, focus) {
    el.scrollIntoView({ block: "center" });
    el.classList.remove("search-found");
    void el.offsetWidth; // restart the flash when the same row is found twice
    el.classList.add("search-found");
    el.addEventListener("animationend", () => el.classList.remove("search-found"), { once: true });
    const fields = el.matches("button, input, select") ? [el] : el.querySelectorAll("input, select, textarea, button");
    if (focus) [...fields].find((field) => field.offsetParent)?.focus();
}

/**
 * Get the config path parts for a cheat value.
 * Maps cheat command like "w1 owl" to path parts ["w1", "owl"].
 * @param {string} cheatValue - e.g., "w1 owl"
 * @returns {string[]|null} - Path parts or null if cheat doesn't map to config
 */
export function getCheatConfigPath(cheatValue) {
    if (!cheatValue) return null;

    const parts = cheatValue.split(" ");
    if (parts.length === 0) return null;

    return parts;
}

/**
 * Check if a config path exists in cheatConfig.
 * @param {string[]} pathParts - Path parts like ["w1", "owl"]
 * @param {object} cheatConfig - The cheatConfig object
 * @returns {boolean}
 */
export function configPathExists(pathParts, cheatConfig) {
    if (!pathParts || !cheatConfig) return false;

    let current = cheatConfig;
    for (const part of pathParts) {
        if (current === null || current === undefined) return false;
        if (typeof current !== "object") return false;
        if (!(part in current)) return false;
        current = current[part];
    }

    // Path exists if we reached a value (could be object, boolean, function, etc.)
    return current !== undefined;
}

/**
 * Detect the type of a search query string for display.
 * @param {string} query - The search query
 * @returns {string} The detected type name
 */
export function detectQueryType(query) {
    const trimmed = query.trim();
    if (trimmed === "") return "empty";
    if (trimmed === "null") return "null";
    if (trimmed === "undefined") return "undefined";
    if (trimmed === "true" || trimmed === "false") return "boolean";
    // Check for range query format: "min-max"
    const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (rangeMatch) return "range";
    if (!isNaN(Number(trimmed))) return "number";
    return "string";
}

/**
 * Copy text to clipboard using fallback method for cross-origin iframes.
 * Uses a temporary textarea element since Clipboard API is blocked.
 * @param {string} text - Text to copy
 * @returns {boolean} Whether copy succeeded
 */
export function copyToClipboard(text) {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        return success;
    } catch {
        return false;
    }
}
