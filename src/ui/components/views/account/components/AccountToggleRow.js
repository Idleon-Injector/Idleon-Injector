import { useWriteStatus } from "../accountShared.js";
import { AccountRow } from "./AccountRow.js";
import { StateSwitch } from "./StateSwitch.js";

/**
 * Shared on/off row: the thing's name, then one switch with the game's word for its state (`words`: on, off).
 * Saves on flip; the switch shows what the game holds once the save is done or refused.
 */
export const AccountToggleRow = ({ info, words, name, checked, rowClass = "", title, write, controlsClass = "" }) => {
    const { status, run } = useWriteStatus();

    return AccountRow({
        info,
        rowClass,
        status,
        controlsClass,
        controls: StateSwitch({
            checked,
            words,
            name: name ?? title,
            title,
            status, // nothing else on the row reads out saving and saved
            onFlip: (next) => run(() => write(next)),
        }),
    });
};
