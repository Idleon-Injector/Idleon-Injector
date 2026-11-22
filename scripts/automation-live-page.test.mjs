// The automation pages while an automation runs (#214), on the fake game. An item's switch that turns its automation
// on says so on the automation's own row; an open page reads a running automation again every few seconds, so what it
// holds and the rows follow the game without Refresh, while text the player is typing and a save in flight stay; the
// saving % says what it keeps (#218).
import assert from "node:assert/strict";
import { test } from "node:test";
import { automationTabKit } from "./automation-tab-kit.mjs";
import { importRepo } from "./known-bugs/index.mjs";

const kit = await automationTabKit();
const { text, byClass, row, field, until, settle, idle } = kit;
const automation = await importRepo("src/ui/components/views/account/automation.js");
const { formatNumber } = await importRepo("src/ui/utils/numberFormat.js");
automation.steps.liveMs = 20; // a few seconds in the game; quick here

// Nothing is laid out in the fake DOM: a node is on screen unless `onScreen` is off or it sits in a hidden tab pane
// (TabbedList's hidden class) or a hidden node, as offsetParent says in a browser.
let onScreen = true;
const hiddenHere = (node) =>
    node.attributes?.hidden === true || /account-page-pane--hidden/.test(String(node.attributes?.class ?? ""));
Object.defineProperty(Object.getPrototypeOf(globalThis.document.createElement("div")), "offsetParent", {
    configurable: true,
    get() {
        if (!onScreen) return null;
        for (let at = this; at; at = at.parentNode) if (hiddenHere(at)) return null;
        return {};
    },
});

const ola = kit.gga.OptionsListAccount;
const page = (await importRepo("src/ui/pages/account/clickers/4-automation.js")).ClickersAutomation();
await until(() => row(page, "The Great Mega Reset"), "the clickers page to load");
const orionLine = () => kit.status(page, "Orion");
const stats = () => text(byClass(page, "automation-stats")[0]);
const level = (name) =>
    text(
        byClass(row(page, name), "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === "Level")
            ?.childNodes.at(-1)
    );
const fieldText = (node) => {
    const input = field(node);
    return String(input.value ?? input.attributes.value ?? "");
};
const metric = (node) => byClass(node, "account-field-metric")[0];
const openTab = async (label) => {
    await byClass(page, "tabbed-list__tab")
        .find((node) => text(node).trim() === label)
        .listeners.click({ preventDefault() {} });
    await settle();
};
const ticks = (n = 5) => settle(automation.steps.liveMs * n);
const orionOff = async () => {
    await kit.flip(row(page, "Orion"), false);
    await idle();
};

test("the saving % says what it keeps for the goal", () => {
    assert.equal(automation.SAVING_DETAIL, "Keeps the rest of the goal; others buy with what's above it");
    assert.match(text(row(page, "While saving")), /Keeps the rest of the goal; others buy with what's above it/);
});

test("an upgrade switched on while Orion is off turns Orion on, and Orion's row says why", async () => {
    assert.equal(orionLine(), "Off");
    await kit.flip(row(page, "Feather Generation"), true);
    assert.equal(kit.running("automation orion"), true);
    await until(
        () => /^On, since an upgrade was switched on/.test(orionLine()),
        () => `Orion's row to say why it is on, not "${orionLine()}"`
    );
});

test("Orion's own switch is the player's choice: its row no longer says an upgrade turned it on", async () => {
    await orionOff();
    assert.equal(orionLine(), "Off");
    await kit.flip(row(page, "Orion"), true);
    await idle();
    assert.equal(kit.running("automation orion"), true);
    assert.doesNotMatch(orionLine(), /since an upgrade/);
});

test("an upgrade switched on while Orion already runs doesn't claim it turned Orion on", async () => {
    await kit.flip(row(page, "Feather Multiplier"), true);
    assert.doesNotMatch(orionLine(), /since an upgrade/);
    await kit.flip(row(page, "Feather Multiplier"), false);
});

test("Orion switched off elsewhere: the open page shows it off without Refresh, and the reason is gone", async () => {
    await orionOff();
    await kit.flip(row(page, "Feather Generation"), false);
    await kit.flip(row(page, "Feather Generation"), true); // Orion on by the upgrade again
    await until(() => /since an upgrade/.test(orionLine()), "the reason");
    const orion = kit.getAutomations().find(({ cheat }) => cheat === "automation orion");
    kit.switchAutomation(orion.id, false); // the game's own Off, not the page's
    await until(
        () => orionLine() === "Off",
        () => `the page to follow the game, not "${orionLine()}"`
    );
    kit.switchAutomation(orion.id, true);
    await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
    await idle();
    assert.doesNotMatch(orionLine(), /since an upgrade/, "on by another hand: no upgrade's doing");
});

test("while Orion runs, the open page follows the feathers and the levels without Refresh", async () => {
    assert.equal(kit.running("automation orion"), true);
    const [feathers, generation] = [ola[253], ola[254]];
    try {
        ola[253] = 7.5e12;
        ola[254] = generation + 5;
        await until(
            () => stats().includes(`${formatNumber(7.5e12)} feathers`),
            () => `the feathers to follow, not "${stats()}"`
        );
        await until(() => level("Feather Generation") === formatNumber(generation + 5), "the level to follow");
    } finally {
        [ola[253], ola[254]] = [feathers, generation];
        await until(() => level("Feather Generation") === formatNumber(generation), "the level back");
    }
});

test("while Orion is off, the page doesn't read by itself", async () => {
    await orionOff();
    const feathers = ola[253];
    const shown = stats();
    try {
        ola[253] = 3.3e13;
        await ticks();
        assert.equal(stats(), shown, "stale until Refresh");
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await idle();
        assert.ok(stats().includes(`${formatNumber(3.3e13)} feathers`), "Refresh still reads");
    } finally {
        ola[253] = feathers;
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await idle();
    }
});

test("a page that isn't on screen (another page, a hidden window) doesn't read by itself", async () => {
    await kit.flip(row(page, "Orion"), true);
    await idle();
    const feathers = ola[253];
    const shown = stats();
    onScreen = false;
    try {
        ola[253] = 4.4e13;
        await ticks();
        assert.equal(stats(), shown);
    } finally {
        onScreen = true;
    }
    await until(() => stats().includes(`${formatNumber(4.4e13)} feathers`), "it follows again once shown");
    ola[253] = feathers;
    await until(() => !stats().includes(formatNumber(4.4e13)), "the feathers back");
});

test("only the open tab reads: Orion's rows wait while Poppy's tab is open", async () => {
    const generation = ola[254];
    const shown = level("Feather Generation");
    await openTab("Poppy");
    try {
        ola[254] = generation + 9;
        await ticks();
        assert.equal(level("Feather Generation"), shown, "Orion's pane is hidden");
    } finally {
        await openTab("Orion");
    }
    await until(() => level("Feather Generation") === formatNumber(generation + 9), "Orion's tab follows once open");
    ola[254] = generation;
    await until(() => level("Feather Generation") === shown, "the level back");
});

test("a stop-at being typed while the page follows the game keeps its text, and Enter saves it", async () => {
    const generation = row(page, "Feather Generation");
    const feathers = ola[253];
    field(generation).listeners.input({ target: { value: "77" } });
    try {
        ola[253] = 5.5e13; // the live reads land while the text is typed
        await until(() => stats().includes(`${formatNumber(5.5e13)} feathers`), "a live read to land");
        await ticks();
        assert.equal(fieldText(generation), "77", "the typed text stays");
        const since = kit.updates.length;
        metric(generation).listeners.keydown({ key: "Enter", target: field(generation), preventDefault() {} });
        await until(() => kit.updates.length > since, "the stop-at's save");
        await idle();
        assert.ok(kit.sent("orion").some(({ id, stopAt }) => id === "0" && stopAt === 77));
        await ticks();
        assert.equal(fieldText(generation), "77", "the saved value stays after the reads after it");
    } finally {
        ola[253] = feathers;
        await kit.type(generation, "");
    }
});

test("a save still answering isn't put back by a live read queued behind it", async () => {
    const generation = row(page, "Feather Generation");
    let release;
    kit.fake.holdUpdates = new Promise((resolve) => (release = resolve));
    try {
        field(generation).listeners.input({ target: { value: "12" } });
        const since = kit.updates.length;
        metric(generation).listeners.keydown({ key: "Enter", target: field(generation), preventDefault() {} });
        await until(() => kit.updates.length > since, "the save to reach the game");
        await ticks(); // live reads queue behind the save, one at a time
        assert.equal(fieldText(generation), "12", "the edit shows while its save answers");
    } finally {
        release();
        kit.fake.holdUpdates = null;
    }
    await idle();
    await ticks();
    assert.equal(fieldText(generation), "12", "the game took it; the reads after show it");
    await kit.type(generation, "");
});

test("a live read that fails is said for the page, and the next one that works clears it", async () => {
    kit.fake.failConfigReads = 1;
    await until(
        () => /the config didn't load/.test(text(page)),
        () => "the failure to be said"
    );
    await until(() => !/the config didn't load/.test(text(page)), "the next read to clear it");
});

test("Shops: an item switched on says so on Shops' row", async () => {
    const shops = (await importRepo("src/ui/pages/account/automation/2-shops.js")).default.component();
    await until(() => row(shops, "Shops"), "the Shops page to load");
    const item = byClass(shops, "automation-pick")[0];
    await kit.flip(item, true);
    await until(
        () => /^On, since an item was switched on/.test(kit.status(shops, "Shops")),
        () => `Shops' row to say why, not "${kit.status(shops, "Shops")}"`
    );
    await kit.flip(item, false);
    await kit.flip(row(shops, "Shops"), false);
});

test("the overview follows an automation switched off in the game, without Refresh", async () => {
    const overview = (await importRepo("src/ui/pages/account/automation/1-overview.js")).default.component();
    await until(() => row(overview, "Orion"), "the overview to load");
    await until(() => kit.status(overview, "Orion") !== "Off", "Orion on in the overview");
    const orion = kit.getAutomations().find(({ cheat }) => cheat === "automation orion");
    kit.switchAutomation(orion.id, false);
    await until(
        () => kit.status(overview, "Orion") === "Off",
        () => `the overview to follow, not "${kit.status(overview, "Orion")}"`
    );
});
