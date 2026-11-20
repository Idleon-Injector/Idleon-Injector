// World 2 pages (sweep 2026-11-20): a Set all that lowers asks "Click again" and an empty one writes nothing; values
// that share one string save one at a time; a save made while another runs keeps its value, on screen and in the game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// The tooltip that says "Click again to …" places itself on the next frame.
globalThis.requestAnimationFrame = () => {};
const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// A question or refusal is read out from a live region on the page.
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const ola = game.gga.OptionsListAccount;

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : node.attributes.class);
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const inputs = (root) => elements(root).filter((node) => node.nodeName === "input");
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const writes = () => requests.filter((entry) => /write/.test(entry)).length;
const asks = (button) => button.attributes["data-again"] === "Click again";

async function until(check, what) {
    for (let i = 0; i < 1000; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]).trim() === name);
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const shown = (input) => String(input.attributes.value);

const click = (button) => button.listeners.click({ preventDefault() {}, currentTarget: button, target: button });
const typeInto = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
// Type a value into a row's field and press Enter.
const enter = (row, value) => {
    const [input] = inputs(row);
    input.listeners.focus?.({ target: input });
    typeInto(input, value);
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    return input;
};
const leave = (row, input) => {
    input.listeners.blur?.({ target: input, relatedTarget: null });
    row.listeners.focusout({ target: input, currentTarget: row, relatedTarget: null });
};
// The player flips a switch: the browser has already moved the box, then reports the change.
const flip = (box, on) => box.listeners.change({ target: { checked: on } });

// Hold the game's writes (whose URL has `match`) until released, to act while a save runs.
const holdWrites = (match = "/write") => {
    const realFetch = globalThis.fetch;
    let release;
    let held = 0;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes(match)) {
            held++;
            await gate;
        }
        return realFetch(url, options);
    };
    return {
        held: () => held,
        release: () => {
            globalThis.fetch = realFetch;
            release();
        },
    };
};

// A Set all field and the button beside it.
const setAllOf = (root) => {
    const row = byClass(root, "account-setall-row")[0];
    return {
        field: byClass(row, "number-input-wrapper")[0],
        input: inputs(row)[0],
        button: buttonNamed(row, "Set all"),
    };
};
const notBusy = (button) => !button.attributes.disabled;

test("sigils: Set all asks before it lowers any sigil, and raising runs on one press", async () => {
    const tiers = game.gga.CauldronP2W[4];
    for (let i = 0; i < 24; i++) tiers[2 * i + 1] = 3;
    const root = await openPage(
        "src/ui/pages/world-2/sigils/sigils.js",
        (root) => byClass(root, "sigil-tier-badge--ethereal").length === 24
    );
    const all = (tier) => Array.from({ length: 24 }, (_, i) => tiers[2 * i + 1]).every((value) => value === tier);
    const picker = byClass(root, "account-setall-row__select")[0];
    const setAll = buttonNamed(root, "Set all");

    picker.listeners.change({ target: { value: "-1" } });
    const before = writes();
    await click(setAll);
    assert.ok(asks(setAll), "the first press asks");
    assert.equal(writes(), before, "nothing was written");
    assert.ok(all(3));
    await click(setAll);
    await until(() => all(-1) && notBusy(setAll), "the second press to lock them");

    picker.listeners.change({ target: { value: "4" } });
    await click(setAll);
    assert.ok(!asks(setAll), "raising didn't ask");
    await until(() => all(4), "the raise to land");
});

test("weekly bosses: a skin picked while the last pick saves is the one saved", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const isPicker = (node) => node.nodeName === "select" && String(node.attributes["aria-label"]).includes("main-bar");
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        elements(root).some(isPicker)
    );
    const picker = elements(root).find(isPicker);
    const value = (option) => String(resolve(option.attributes.value));
    const resolve = (attribute) => (typeof attribute === "function" ? attribute() : attribute);
    const [first, second] = elements(picker)
        .filter((node) => node.nodeName === "option" && !resolve(node.attributes.disabled))
        .map(value)
        .filter((pick) => pick !== "2" && pick !== "__unknown__");

    const hold = holdWrites();
    picker.listeners.change({ target: { value: first } });
    await until(() => hold.held() > 0, "the first pick's save to reach the game");
    picker.listeners.change({ target: { value: second } });
    hold.release();
    await until(() => String(weekly.set0) === second, "the newer pick to save");
    weekly.set0 = 2;
});

test("weekly bosses: the character skins note doesn't send the player to a Save button", async () => {
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        text(root).includes("Character skins")
    );
    assert.ok(text(root).includes("it saves when you pick it"));
    assert.ok(!/then Save/.test(text(root)));
});

test("islands: two islands unlocked close together both stay unlocked (they share one string)", async () => {
    ola[169] = "";
    const root = await openPage("src/ui/pages/world-2/islands/islands.js", (root) => rowNamed(root, "Rando Island"));
    const box = (name) => inputs(rowNamed(root, name)).find((node) => node.attributes.role === "switch");
    const hold = holdWrites();
    const saves = [flip(box("Trash Island"), true)];
    await until(() => hold.held() > 0, "the first save to reach the game");
    saves.push(flip(box("Rando Island"), true));
    hold.release();
    await Promise.all(saves);
    assert.equal(ola[169], "a_", "the game holds both");
    await until(() => box("Trash Island").checked && box("Rando Island").checked, "both switches to show Unlocked");
    ola[169] = "";
});

test("islands: Set all asks before it lowers an upgrade, and an empty field writes nothing", async () => {
    ola[163] = 500;
    ola[164] = 500;
    const root = await openPage(
        "src/ui/pages/world-2/islands/islands.js",
        (root) => rowNamed(root, "% Bottles") && String(inputs(rowNamed(root, "% Bottles"))[0].value) === "500"
    );
    const { input, field, button } = setAllOf(root);
    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "200");
    await click(button);
    assert.ok(asks(button), "lowering asks");
    assert.equal(writes(), before);
    await click(button);
    await until(() => ola[163] === 200 && ola[164] === 200, "the second press to lower them");
});

test("bubbles: two Prisma switches flipped close together both stay Prisma (they share one string)", async () => {
    ola[384] = "0";
    const root = await openPage(
        "src/ui/pages/world-2/bubbles/bubbles.js",
        (root) => byClass(root, "brewing-row").length > 4
    );
    const [first, second] = inputs(byClass(root, "brewing-section--orange")[0]).filter(
        (node) => node.attributes.role === "switch"
    );
    const hold = holdWrites();
    const saves = [flip(first, true)];
    await until(() => hold.held() > 0, "the first save to reach the game");
    saves.push(flip(second, true));
    hold.release();
    await Promise.all(saves);
    assert.equal(String(ola[384]).split(",").filter(Boolean).length, 2, `the game holds both: ${ola[384]}`);
    ola[384] = "0";
});

test("bubbles: Set all with an empty field writes nothing, lowering asks first, raising runs on one press", async () => {
    const levels = game.gga.CauldronInfo[0];
    for (let i = 0; i < levels.length; i++) levels[i] = 120;
    const root = await openPage(
        "src/ui/pages/world-2/bubbles/bubbles.js",
        (root) => byClass(root, "brewing-row").length > 4
    );
    const orange = byClass(root, "brewing-section--orange")[0];
    const shownRows = () => byClass(orange, "brewing-row").length;
    const all = (level) => levels.slice(0, shownRows()).every((value) => value === level);
    const { input, field } = setAllOf(root);
    const button = buttonNamed(orange, "Set all");

    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.ok(all(120));
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "5");
    await click(button);
    assert.ok(asks(button), "lowering asks");
    assert.equal(writes(), before);
    await click(button);
    await until(() => all(5) && notBusy(button), "the second press to lower them");

    typeInto(input, "50");
    await click(button);
    assert.ok(!asks(button), "raising didn't ask");
    await until(() => all(50), "the raise to land");
});

test("bubbles: a bubble saved while its cauldron's Set all runs keeps the level it saved", async () => {
    const levels = game.gga.CauldronInfo[0];
    for (let i = 0; i < levels.length; i++) levels[i] = 10;
    levels[0] = 50000; // already at the Set all level, so Set all leaves it out
    const root = await openPage(
        "src/ui/pages/world-2/bubbles/bubbles.js",
        (root) => byClass(root, "brewing-row").length > 4
    );
    const orange = byClass(root, "brewing-section--orange")[0];
    const [row, other] = byClass(orange, "brewing-row");
    typeInto(setAllOf(root).input, "50000");

    const hold = holdWrites("/write-many");
    const setAll = click(buttonNamed(orange, "Set all"));
    await until(() => hold.held() > 0, "Set all to reach the game");
    const input = enter(row, 7);
    await until(() => stateOf(row) === "success", "the row's save");
    leave(row, input);
    hold.release();
    await setAll;
    await until(() => shown(inputs(other)[0]) === "50000", "Set all's levels to show");
    assert.equal(levels[0], 7);
    assert.equal(shown(input), "7", "the row shows what the game holds");
});

test("vials: Set all with an empty field writes nothing, lowering asks first, raising runs on one press", async () => {
    const levels = game.gga.CauldronInfo[4];
    for (let i = 0; i < levels.length; i++) levels[i] = 13;
    const root = await openPage(
        "src/ui/pages/world-2/vials/vials.js",
        (root) => byClass(root, "account-row").length > 4
    );
    const shownRows = byClass(root, "account-row").length;
    const all = (level) => levels.slice(0, shownRows).every((value) => value === level);
    const { input, field, button } = setAllOf(root);

    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "5");
    await click(button);
    assert.ok(asks(button), "lowering asks");
    assert.equal(writes(), before);
    await click(button);
    await until(() => all(5) && notBusy(button), "the second press to lower them");

    typeInto(input, "13");
    await click(button);
    assert.ok(!asks(button), "raising didn't ask");
    await until(() => all(13), "the raise to land");
});

test("vials: a vial saved while Set all runs keeps the level it saved (Set all left it out)", async () => {
    const levels = game.gga.CauldronInfo[4];
    for (let i = 0; i < levels.length; i++) levels[i] = 2;
    levels[0] = 13;
    const root = await openPage(
        "src/ui/pages/world-2/vials/vials.js",
        (root) => byClass(root, "account-row").length > 4
    );
    const [row, other] = byClass(root, "account-row");
    const { input: setAllInput, button } = setAllOf(root);
    typeInto(setAllInput, "13");

    const hold = holdWrites("/write-many");
    const setAll = click(button);
    await until(() => hold.held() > 0, "Set all to reach the game");
    const input = enter(row, 4);
    await until(() => stateOf(row) === "success", "the row's save");
    leave(row, input);
    hold.release();
    await setAll;
    await until(() => shown(inputs(other)[0]) === "13", "Set all's levels to show");
    assert.equal(levels[0], 4);
    assert.equal(shown(input), "4", "the row shows what the game holds");
});
