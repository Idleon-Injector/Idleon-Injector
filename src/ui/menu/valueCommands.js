/**
 * Commands that take a value from a list (an item, a monster, a pack), #23. The cheat list has one entry per value
 * ("spawn rift2 · Rift Slug"), which the console's autocomplete wants; the WebUI shows each command once instead, with a
 * field that suggests its values and, where the command takes one, an amount (components/ValueFields.js).
 *
 * `noun` names a value in a refusal ("Not a monster."), `amount` is the amount field's word (`amountNeeded` when the
 * command fails without it), `anyText` lets a value outside the list through (nomore takes a pattern), and `name`
 * turns a list entry into the name the player knows.
 */

const stripped = (pattern) => (message, code) => message.replace(pattern, "").trim() || code;
const spaced = (message, code) => code.replace(/_/g, " ");

export const VALUE_COMMANDS = {
    drop: { label: "Drop an item", noun: "item", amount: "Amount" },
    nomore: { label: "Stop an item dropping", noun: "item", anyText: true },
    multiplestacks: { label: "Chest stacks of an item", noun: "item", amount: "Stacks", amountNeeded: true },
    spawn: { label: "Spawn a monster", noun: "monster", amount: "Amount" },
    keychain: { label: "Maxed keychain stat", noun: "stat" },
    buy: { label: "Buy a gem shop pack", noun: "pack", name: stripped(/\s*\(One Time Use.*$/) },
    bulk: { label: "Drop every item of a type", noun: "type", amount: "Amount", name: spaced },
    class: { label: "Change class", noun: "class", name: stripped(/^Change to |\s*\(ID: \d+\)$/g) },
    lvl: {
        label: "Set a level",
        noun: "skill",
        amount: "Level",
        amountNeeded: true,
        name: stripped(/^Change | level$/g),
    },
    "w4 chips": { label: "Add lab chips", noun: "chip", amount: "Amount", amountNeeded: true, name: spaced },
    "w5 jargems": { label: "Add jar gems", noun: "gem", amount: "Amount", amountNeeded: true, name: spaced },
    "w6 sumunit": { label: "Always the same unit", noun: "unit", name: spaced },
};

/** The value command `value` is one entry of ("spawn rift2" -> "spawn"), or "". */
export const valueCommandOf = (value) =>
    Object.keys(VALUE_COMMANDS).find((command) => value.startsWith(`${command} `)) ?? "";

/** One entry of value command `command` ("spawn rift2", "Rift Slug") as `{ code, name }`. */
export const valueOf = (command, cheat) => {
    const spec = VALUE_COMMANDS[command];
    const code = cheat.value.slice(command.length + 1);
    const message = cheat.message || "";
    return { code, name: (spec.name ? spec.name(message, code) : message) || code };
};

/** A value command's values from the cheat list, in the list's order. */
export const valuesOf = (command, cheats) =>
    cheats.filter((cheat) => cheat.value.startsWith(`${command} `)).map((cheat) => valueOf(command, cheat));

/** What the player typed, as the code the command takes: a code or a name, any case; null when it is neither. */
export const codeOf = (typed, values) => {
    const text = typed.trim().toLowerCase();
    if (!text) return null;
    const found =
        values.find((value) => value.code.toLowerCase() === text) ??
        values.find((value) => value.name.toLowerCase() === text);
    return found ? found.code : null;
};
