/**
 * Pinned cheats: the ones a player keeps in Home's My cheats whether they are on or not. A pin is set from any cheat
 * row (a page's cheats panel, the Cheats area) or from the row's Pin tag in My cheats.
 * ponytail: concept storage, this browser's localStorage. The in-game overlay and a browser don't share it; the real
 * home (the config file beside the startup cheats, or the server) is decided when this is built for real.
 */
import van from "../vendor/van-1.6.0.js";

const KEY = "myCheatsPins";
const read = () => {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
    } catch {
        return [];
    }
};

export const pins = van.state(read());
export const isPinned = (cheat) => pins.val.includes(cheat);
export const setPinned = (cheat, on) => {
    pins.val = on ? [...new Set([...pins.val, cheat])] : pins.val.filter((item) => item !== cheat);
    try {
        localStorage.setItem(KEY, JSON.stringify(pins.val));
    } catch {
        // Storage refused (a private window): the pin holds until the menu reloads.
    }
};
// Another tab of the menu in this browser pinned or unpinned one.
window.addEventListener("storage", (e) => e.key === KEY && (pins.val = read()));
