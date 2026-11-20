// Review follow-ups (#111, #113, #126) on the fake game: after a failed save the page shows what the game holds, a
// failure stays until what failed is done, a save keeps its Undo while another waits, and an older save's answer
// doesn't speak over a newer one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const gga = game.gga;
const ola = gga.OptionsListAccount;

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
const switches = (root) => inputs(root).filter((node) => node.attributes.role === "switch");
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]).trim() === name);
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const saveState = (row) => classes(byClass(row, "save-state")[0] ?? { attributes: {} });

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const quietly = async (task) => {
    const realError = console.error;
    console.error = () => {};
    try {
        return await task();
    } finally {
        console.error = realError;
    }
};

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
};
const flip = (box, on) => box.listeners.change({ target: { checked: on } });

// The game takes the write of `path`, but its answer is lost on the way back: the page hears a failure.
const landThenFail = (path) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (!String(url).includes("/write") || !String(options?.body).includes(path)) return response;
        return new Response(JSON.stringify({ error: "the connection dropped" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    return () => (globalThis.fetch = realFetch);
};

// #111: Printer's Clear fails, then the player tabs through the slot without typing: the failure stays.
test("a field left with nothing to save keeps a button's failure, and takes back its own", async () => {
    const { useAutoSave } = await importRepo("src/ui/components/views/account/autoSave.js");
    let draft = "ok";
    const row = useAutoSave({
        prepare: () => {
            if (draft === "bad") throw new Error("enter a number");
            return { unchanged: true };
        },
    });
    await row.run(async () => {
        throw new Error("the game refused");
    });
    assert.equal(row.status.val, "error");
    await row.save();
    assert.equal(row.status.val, "error", "the button's failure stays");
    assert.equal(row.reason.val, "the game refused");

    draft = "bad";
    await row.save();
    assert.equal(row.reason.val, "enter a number");
    draft = "ok";
    await row.save();
    assert.equal(row.status.val, null, "the field's own failure goes once nothing needs saving");
});

// #126 (#114): a failed Prisma save showed the set remembered from before it, though the write had landed.
test("bubbles: a Prisma save whose answer is lost shows what the game holds", async () => {
    ola[384] = "0";
    const root = await openPage("src/ui/pages/world-2/bubbles/bubbles.js", (r) => byClass(r, "brewing-row").length > 4);
    const [box] = switches(byClass(root, "brewing-section--orange")[0]);
    const restore = landThenFail("OptionsListAccount[384]");
    try {
        await quietly(() => flip(box, true));
    } finally {
        restore();
    }
    assert.notEqual(String(ola[384]).replace(/,/g, ""), "0", "the game took it");
    await until(() => box.checked === true, "the switch to show the game's Prisma");
    ola[384] = "0";
});

// #126 (#114) and #113: a failed island save, and a failed Unlock all, show what the game holds.
test("islands: an unlock or Unlock all whose answer is lost shows what the game holds", async () => {
    ola[169] = "";
    const root = await openPage("src/ui/pages/world-2/islands/islands.js", (r) => rowNamed(r, "Rando Island"));
    const box = (name) => switches(rowNamed(root, name))[0];

    let restore = landThenFail("OptionsListAccount[169]");
    try {
        await quietly(() => flip(box("Trash Island"), true));
    } finally {
        restore();
    }
    assert.equal(ola[169], "_", "the game took it");
    await until(() => box("Trash Island").checked === true, "Trash Island to show unlocked");

    restore = landThenFail("OptionsListAccount[169]");
    try {
        await quietly(async () => {
            await buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
            await until(() => ola[169] === "abcde_", "Unlock all to land");
        });
    } finally {
        restore();
    }
    // A switch nobody flipped shows its state through its bound attribute.
    await until(() => box("Rando Island").attributes.checked === true, "every island to show unlocked");
    ola[169] = "";
});

// #126 (#119): a save that waited behind another's reads lost the Undo beside the first.
test("levels: a save that reads first keeps its Undo while another row's save waits", async () => {
    const root = await openPage("src/ui/pages/account/player/1-levels.js", (r) => rowNamed(r, "Mining level"));
    const money = rowNamed(root, "Money");
    const mining = rowNamed(root, "Mining level");
    const enter = (row, value) => {
        const [input] = inputs(row);
        input.value = String(value);
        input.listeners.input({ target: input });
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    };
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/game/gga/read")) {
            held++;
            await gate;
        }
        return realFetch(url, options);
    };
    try {
        enter(money, gga.Money + 7);
        await until(() => held > 0, "Money's save to read the game");
        enter(mining, gga.Lv0[2] + 2);
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await until(() => /save-state--success/.test(saveState(mining)), "Mining to save");
    assert.match(saveState(money), /save-state--success/);
    const undoShown = (row) => byClass(row, "save-state__undo")[0]?.attributes.hidden === false;
    assert.ok(undoShown(money), "Money offers Undo");
    assert.ok(undoShown(mining), "Mining offers Undo");
});

// #126 (#125): an older save's refusal said "not saved" after a newer save of the slot landed.
test("sushi station: an older save's failure says nothing once a newer one of the slot saved", async () => {
    const root = await openPage("src/ui/pages/world-7/sushi-station/2-station.js", (r) =>
        byClass(r, "sushi-station-tile").some((tile) => !classes(tile).includes("--locked"))
    );
    const tile = byClass(root, "sushi-station-tile").find((node) => !classes(node).includes("--locked"));
    const [input] = inputs(tile);
    const type = (value) => {
        input.listeners.focus({ target: input });
        input.listeners.input({ target: Object.assign(input, { value }) });
        input.listeners.blur({ target: input });
    };
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let first = true;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write") || !first) return realFetch(url, options);
        first = false;
        await gate;
        return new Response(JSON.stringify({ error: "the game refused" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    const before = gga.Sushi[0][0];
    try {
        await quietly(async () => {
            type("3");
            await until(() => !first, "the first save to reach the game");
            type("4");
            await until(() => gga.Sushi[0][0] === 3, "the newer save to land");
            await until(() => classes(tile).includes("--success"), "the tile to show it saved");
            release();
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    assert.doesNotMatch(classes(tile), /--error/, "the older failure isn't shown");
    assert.doesNotMatch(text(globalThis.document.body), /not saved/, "nor said");
    gga.Sushi[0][0] = before;
});

// #126 (#124): an undo write the game kept differently left the totals built from it in the game's cache.
test("an undo the game keeps differently still clears the totals built from it", async () => {
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const levels = gga.Bubba[1];
    const old = levels[0];
    await withAction({ label: "bubba" }, () => writeVerified("Bubba[1][0]", old + 1));
    const [action] = (await fetchChanges()).actions;
    gga.DNSM.h.Bubba_LVzAll = 99;
    // The game keeps every level it's given one higher.
    let kept = old + 1;
    Object.defineProperty(levels, 0, {
        get: () => kept,
        set: (value) => {
            kept = value + 1;
        },
        configurable: true,
    });
    try {
        await quietly(() => assert.rejects(undoAction(action.id), { message: "game kept the value" }));
    } finally {
        Object.defineProperty(levels, 0, { value: old, writable: true, configurable: true, enumerable: true });
    }
    assert.equal(gga.DNSM.h.Bubba_LVzAll, undefined, "the cached total is cleared");
});
