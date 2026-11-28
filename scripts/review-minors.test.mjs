// CodeRabbit's minor findings on the merged 3.0 work (#319): Bubba clears the game's cached level total after every
// upgrade write, Max all waits for the vault's read, Set all keeps whole-number fields whole, a Refresh drops an item
// the game no longer lists, a trophy added shows when the read after it fails, and reduced motion stills the world
// tabs. On the fake game, through the listeners a player triggers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const gga = game.gga;

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
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const click = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node });
const attrOf = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
const saveState = (row) => classes(byClass(row, "save-state")[0] ?? { attributes: {} });
const settled = (row) => /save-state--(success|error)/.test(saveState(row));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await wait(10);
    }
    assert.fail(`timed out waiting for ${what}`);
}
async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
}
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const enter = (row, input) => row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};
// Holds the first request whose URL ends with `part` until released.
const holdFirst = (part) => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const hold = { held: false, release: () => release() };
    globalThis.fetch = async (url, options) => {
        if (!hold.held && String(url).endsWith(part)) {
            hold.held = true;
            await gate;
        }
        return realFetch(url, options);
    };
    hold.restore = () => {
        globalThis.fetch = realFetch;
        release();
    };
    return hold;
};
const cacheCleared = (since) => requests.slice(since).some((entry) => /gga\/delete/.test(entry));

const BUBBA = "src/ui/pages/account/clickers/3-bubba.js";

test("bubba: an upgrade save the game refuses still clears the cached level total", async () => {
    const root = await openPage(BUBBA, (r) => byClass(r, "value-row").length > 0);
    const row = byClass(root, "value-row")[0];
    const level = inputs(row)[0];
    const restore = refuseWrites(gga.Bubba[1], 0);
    const since = requests.length;
    try {
        type(level, Number(gga.Bubba[1][0]) + 1);
        enter(row, level);
        await until(() => settled(row), "the save to end");
    } finally {
        restore();
    }
    assert.match(saveState(row), /save-state--error/);
    await until(() => cacheCleared(since), "the cache clear after the refused save");
});

test("bubba: Set all on the upgrades clears the cached total when another tab is open as it ends", async () => {
    const root = await openPage(BUBBA, (r) => byClass(r, "value-row").length > 0);
    const hold = holdFirst("/gga/write-many");
    const since = requests.length;
    try {
        type(inputs(byClass(root, "account-setall-row")[0])[0], 1);
        click(button(byClass(root, "account-setall-row")[0], "Set all"));
        await wait(30);
        const yes = byClass(root, "tabbed-list__yes")[0];
        if (/\?|max under/.test(trayLine(root)) && yes) click(yes);
        await until(() => hold.held, "the Set all write to start");
        click(byClass(root, "tabbed-list__tab").find((node) => text(node).trim() === "Meat"));
        hold.release();
        await until(() => cacheCleared(since), "the cache clear after Set all");
    } finally {
        hold.restore();
    }
});

test("upgrade vault: Max all waits while the vault is read again", async () => {
    const root = await openPage("src/ui/pages/account/upgrade-vault/upgrade-vault.js", (r) =>
        Boolean(button(r, "Max all"))
    );
    gga.UpgVault[0] = 0;
    click(button(root, "Refresh"));
    await wait(30);
    const hold = holdFirst("/computed/read-many");
    try {
        click(button(root, "Refresh"));
        await until(() => hold.held, "the Refresh to read the maxes");
        assert.ok(attrOf(button(root, "Max all"), "disabled"), "Max all waits for the new maxes");
    } finally {
        hold.restore();
    }
    await until(() => !attrOf(button(root, "Max all"), "disabled"), "Max all once the vault is read");
});

test("clam work: Set all refuses a number too big to stay whole, and writes nothing", async () => {
    const before = gga.Menagerie[0][8];
    const root = await openPage("src/ui/pages/world-7/clam-work/clam-work.js", (r) =>
        Boolean(byClass(r, "account-setall-row")[0])
    );
    const since = requests.length;
    type(inputs(byClass(root, "account-setall-row")[0])[0], "9007199254740992");
    click(button(byClass(root, "account-setall-row")[0], "Set all"));
    await wait(30);
    const yes = byClass(root, "tabbed-list__yes")[0];
    if (/\?|max under/.test(trayLine(root)) && yes) click(yes);
    await until(() => /^Whole numbers only/.test(trayLine(root)), "the refusal on the tray's line");
    assert.equal(gga.Menagerie[0][8], before);
    assert.ok(!requests.slice(since).some((entry) => /write/.test(entry)), "nothing written");
});

test("event shop: a Refresh that reads a shorter catalog leaves the dropped item out of the count", async (t) => {
    const catalog = gga.CustomLists.h.NinjaInfo[39];
    const kept = [...catalog];
    t.after(() => catalog.splice(0, catalog.length, ...kept));
    const root = await openPage("src/ui/pages/account/event-shop/event-shop.js", (r) =>
        /^All \d+ items/.test(trayLine(r))
    );
    const count = () => Number(/^All (\d+) items/.exec(trayLine(root))?.[1]);
    const before = count();
    catalog.splice(catalog.length - 2, 2);
    click(button(root, "Refresh"));
    await until(() => count() === before - 1, "the count to drop the item the game no longer lists");
});

test("trophies: a trophy added shows in the gallery when the read after its save fails", async (t) => {
    const kept = [...gga.Spelunk[16]];
    const realFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = realFetch;
        gga.Spelunk[16] = kept;
    });
    const root = await openPage("src/ui/pages/world-7/gallery/1-trophy.js", (r) =>
        elements(r).some((node) => node.attributes.role === "switch")
    );
    const isOn = (box) => Boolean(attrOf(box, "checked") ?? box.checked);
    const box = elements(root).find((node) => node.attributes.role === "switch" && !isOn(node));
    let wrote = false;
    globalThis.fetch = async (url, options) => {
        const path = options?.body ? JSON.parse(options.body).path : null;
        if (String(url).endsWith("/gga/write") && String(path).startsWith("gga.Spelunk[16]")) wrote = true;
        else if (wrote && String(url).endsWith("/gga/read") && path === "gga.Spelunk[16]")
            return new Response(JSON.stringify({ error: "The game didn't answer" }), { status: 500 });
        return realFetch(url, options);
    };
    const empties = kept.filter((slot) => slot === -1).length;
    box.listeners.change({ target: { checked: true } });
    await until(() => gga.Spelunk[16].filter((slot) => slot === -1).length === empties - 1, "the trophy to save");
    await wait(100);
    assert.ok(isOn(box), "the switch shows the slot the write filled");
});

test("reduced motion stills the world tabs' panes too, after the rule that animates them", () => {
    const css = readFileSync(new URL("../src/ui/styles/_world-tabs.css", import.meta.url), "utf8");
    const animated = css.indexOf("animation: pageIn");
    const still = css.search(
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.world-sub-pane\.active\s*\{\s*animation: none/
    );
    assert.ok(animated >= 0 && still > animated, "the reduced-motion rule comes after the animation, in the same file");
});
