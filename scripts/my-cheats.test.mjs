// Home's My cheats and the pins on every cheat row: a pin and an Autostart press are saved in the config file and read
// back, the list is A to Z, and a cheat that is off with neither tag leaves it once the pointer does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
// The next `failSaves` file saves fail, as a locked config.custom.js does; the rest save as the server does.
let failSaves = 0;
let saves = 0;
const save = router.routes.POST.get("/api/config/save");
router.routes.POST.set("/api/config/save", async (req, res) => {
    saves++;
    if (failSaves > 0) {
        failSaves--;
        return res.status(500).json({ error: "The config file is locked" });
    }
    return save(req, res);
});
// The next `failReads` reads of the config fail, as when the injector can't be reached.
let failReads = 0;
const read = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    if (failReads > 0) {
        failReads--;
        return res.status(500).json({ error: "The injector can't be reached" });
    }
    return read(req, res);
});
const { store } = await loadUi(router);
// The pins and My cheats read the config again when the window comes back.
globalThis.window = { addEventListener() {} };
const { default: van } = await importRepo("src/ui/vendor/van-1.6.0.js");
const { fetchConfig, saveConfigPart } = await importRepo("src/ui/services/api.js");
const { isPinned, setPinned, takePins } = await importRepo("src/ui/menu/pins.js");
const { CheatRow, PIN_FAILED } = await importRepo("src/ui/components/SystemCheats.js");
const { MyCheats } = await importRepo("src/ui/components/MyCheats.js");
await store.loadCheats();
await store.loadCheatStates();

const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const classOf = (node) => node.className ?? node.attributes?.class ?? "";
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const until = async (check, what) => {
    for (let tries = 0; tries < 100; tries++) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`waited for ${what}`);
};
const file = async () => {
    const config = await fetchConfig();
    return { pins: config.injectorConfig.pinnedCheats, startup: config.startupCheats };
};
const reset = async () => {
    await saveConfigPart(() => ({ injectorConfig: { pinnedCheats: [] }, startupCheats: [] }));
    takePins(await fetchConfig());
};

const panel = MyCheats(van.state(true));
const listed = () => find(panel, (node) => node.attributes?.["data-cheat"]).map((row) => row.attributes["data-cheat"]);
const rowOf = (cheat) => find(panel, (node) => node.attributes?.["data-cheat"] === cheat)[0];
const tagOf = (cheat, kind) => find(rowOf(cheat), (node) => classOf(node).includes(`my-tag--${kind}`))[0];
const press = (node) => node.listeners.click({ currentTarget: node });
const said = () => text(find(panel, (node) => /said--line/.test(classOf(node)))[0]);
// On in the fake game: godlike crit, godlike reach, w1 companion, wide attire. Off: godlike food, w1 anvil.
const ON = "godlike crit";
const OFF = "godlike food";

test("a pin is saved in the config file, read back, and an unpin takes it out", async () => {
    await reset();
    await setPinned(OFF, true);
    assert.deepEqual((await file()).pins, [OFF]);
    takePins(await fetchConfig());
    assert.equal(isPinned(OFF), true, "read back from the file");

    await setPinned(OFF, false);
    assert.deepEqual((await file()).pins, []);
    assert.equal(isPinned(OFF), false);
});

test("a pinned cheat that is off is listed; unpinned, it stays while the pointer is in the list, then leaves", async () => {
    await reset();
    await setPinned(OFF, true);
    await until(() => listed().includes(OFF), "the pinned cheat to arrive");

    press(tagOf(OFF, "pin"));
    await until(() => tagOf(OFF, "pin").attributes["aria-pressed"] === "false", "the tag to show it unpinned");
    await until(async () => !(await file()).pins.length, "the unpin to be saved");
    assert.ok(listed().includes(OFF), "nothing moves under the player's hand");

    panel.listeners.pointerleave();
    await until(() => !listed().includes(OFF), "the row to leave");
    assert.ok(listed().includes(ON), "a cheat that is on stays");
});

test("the list is one list, A to Z by name", async () => {
    await reset();
    await setPinned("w1 anvil", true);
    await setPinned(OFF, true);
    await setPinned("multiply damage", true);
    await until(() => listed().includes("multiply damage"), "the pins to arrive");
    const names = find(panel, (node) => /account-row__bonus/.test(classOf(node))).map(text);
    assert.ok(names.length >= 7, names.join(", "));
    assert.deepEqual(
        names,
        [...names].sort((a, b) => a.localeCompare(b)),
        names.join(", ")
    );
});

test("Autostart saves the startup cheats, on and then off", async () => {
    await reset();
    await until(() => tagOf(ON, "auto").attributes.disabled === false, "the startup cheats to be read");
    press(tagOf(ON, "auto"));
    await until(() => tagOf(ON, "auto").attributes["aria-pressed"] === "true", "the tag to show it on");
    await until(async () => (await file()).startup.includes(ON), "the startup cheats to be saved");

    press(tagOf(ON, "auto"));
    await until(async () => !(await file()).startup.length, "it to be taken out");
    await until(() => tagOf(ON, "auto").attributes["aria-pressed"] === "false", "the tag to show it off");
});

test("a pin whose save fails goes back to the file's state and says so; the next save that works clears it", async () => {
    await reset();
    failSaves = 1;
    press(tagOf(ON, "pin"));
    await until(() => said().includes("Couldn't save"), "the failure under the list");
    assert.equal(tagOf(ON, "pin").attributes["aria-pressed"], "false", "back to what the file holds");
    assert.deepEqual((await file()).pins, []);

    press(tagOf(ON, "pin"));
    await until(() => tagOf(ON, "pin").attributes["aria-pressed"] === "true" && said() === "", "the retry to save");
    assert.deepEqual((await file()).pins, [ON]);
});

test("a pin that can't be saved or read back goes back to what the file last said", async () => {
    await reset();
    failReads = 10; // the save's own read fails, and so does the read after it
    const saved = setPinned(OFF, true).then(
        () => "saved",
        () => "failed"
    );
    assert.equal(isPinned(OFF), true, "the press shows at once");
    assert.equal(await saved, "failed");
    assert.equal(isPinned(OFF), false, "back to the file's pins");
    failReads = 0;
});

test("quick presses on a pin end as the last press, in the file and on the tag", async () => {
    await reset();
    const tag = tagOf(ON, "pin");
    // Three presses before the first save answers: pin, unpin, pin.
    const before = saves;
    press(tag);
    press(tag);
    press(tag);
    await until(() => saves === before + 3, "all three saves");
    await until(() => tag.attributes["aria-pressed"] === "true", "the tag to settle");
    assert.deepEqual((await file()).pins, [ON], "the file ends as the last press");
    assert.equal(tag.attributes["aria-pressed"], "true");
});

test("a page's cheat row pins from its own pin, and a failed pin is said on that row", async () => {
    await reset();
    const row = CheatRow(
        { cheat: OFF, label: "Food never runs out" },
        { openId: van.state(null), config: van.state(null) }
    );
    const pin = find(row, (node) => /cheat-pin/.test(classOf(node)))[0];
    const line = () => text(find(row, (node) => /system-cheats__said/.test(classOf(node)))[0]);

    failSaves = 1;
    press(pin);
    await until(() => line() === PIN_FAILED, "the failure on the row");
    assert.equal(pin.attributes["aria-pressed"], "false");

    press(pin);
    await until(() => pin.attributes["aria-pressed"] === "true" && line() === "", "the retry to save and clear it");
    assert.deepEqual((await file()).pins, [OFF]);
    await until(() => listed().includes(OFF), "My cheats to list it");
});
