/**
 * Pinned cheats: the ones a player keeps in Home's My cheats whether they are on or not. A pin is set from any cheat
 * row (a page's cheats panel, the Cheats area) or from the row's Pin tag in My cheats.
 *
 * They are saved in the config file (injectorConfig.pinnedCheats), like the startup cheats, so the in-game menu and a
 * browser show the same pins and they survive a restart. A press shows at once; its save waits its turn with the
 * menu's other config saves and changes only that one cheat in the list the file holds then, so presses on different
 * rows can't undo each other. Once the last save answers, the pins are the file's again.
 */
import van from "../vendor/van-1.6.0.js";
import { fetchConfig, saveConfigPart } from "../services/api.js";

const pinsOf = (file) => {
    const list = file?.injectorConfig?.pinnedCheats;
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
};

export const pins = van.state([]);
export const isPinned = (cheat) => pins.val.includes(cheat);

// Saves sent and not answered yet: while any runs, a read doesn't put back what the presses changed.
let saving = 0;
/** Take the pins from a config read (My cheats reads the file for the startup cheats too). */
export const takePins = (file) => {
    if (!saving) pins.val = pinsOf(file);
};
const loadPins = () =>
    fetchConfig()
        .then(takePins)
        .catch(() => {});
loadPins();
// The other window (the in-game menu, a browser) may have pinned one.
window.addEventListener("focus", loadPins);

/** Pin or unpin `cheat`. Resolves once saved; rejects when the save failed (the pins are then the file's again). */
export const setPinned = (cheat, on) => {
    pins.val = on ? [...new Set([...pins.val, cheat])] : pins.val.filter((item) => item !== cheat);
    saving++;
    return saveConfigPart((current) => {
        const others = pinsOf(current).filter((item) => item !== cheat);
        return { injectorConfig: { pinnedCheats: on ? [...others, cheat] : others } };
    }).then(
        ({ config }) => {
            if (--saving === 0) pins.val = pinsOf(config);
        },
        async (error) => {
            if (--saving === 0) await loadPins();
            throw error;
        }
    );
};
