// An action button tells a screen reader how its press ended (#77): busy while it saves, then "done" or "failed"
// from the page's live region. The button itself only changes colour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;

const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });

test("an action button says how its press ended, for screen readers", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const status = van.state(null);
    let finish;
    const button = ActionButton({
        label: "Add all",
        status,
        onClick: () => {
            status.val = "loading";
            return new Promise((resolve) => (finish = resolve));
        },
    });
    click(button);
    await settle();
    assert.equal(button.attributes["aria-busy"], "true", "busy while it saves");
    status.val = "success";
    finish();
    await settle(50);
    const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    assert.equal(region.textContent, "Add all: done");
    assert.equal(button.attributes["aria-busy"], "false");

    status.val = null;
    const failing = ActionButton({
        label: "Add",
        status,
        onClick: async () => {
            status.val = "loading";
            await settle();
            status.val = "error";
        },
    });
    await click(failing);
    await settle(50);
    assert.equal(region.textContent, "Add: failed");
});

// In-game check: on Arcade Shop, "Reset all" ran and "Max all" and "Max all cosmic" flashed done, as all four bulk
// buttons share the page's one status. The result belongs to the button that ran.
test("buttons that share one status show its result only on the one pressed", async () => {
    const { BulkActionBar } = await importRepo("src/ui/components/views/account/BulkActionBar.js");
    const status = van.state(null);
    const run = async () => {
        status.val = "loading";
        await settle();
        status.val = "success";
    };
    const bar = BulkActionBar({
        actions: [
            { label: "Max all", status, onClick: run },
            { label: "Max all cosmic", status, onClick: run },
            { label: "Reset all", variant: "danger", status, onClick: run },
        ],
    });
    const [max, cosmic, reset] = bar.childNodes;
    const shows = (button, kind) => String(button.attributes.class).includes(`account-btn--${kind}`);
    await click(reset);
    await settle();
    assert.ok(shows(reset, "success"), "the pressed button says done");
    assert.ok(!shows(max, "success") && !shows(cosmic, "success"), "the others don't");

    await click(max);
    await settle();
    assert.ok(shows(max, "success") && !shows(reset, "success"), "the next press takes the result with it");
    status.val = "error";
    await settle();
    assert.ok(shows(max, "error") && !shows(cosmic, "error") && !shows(reset, "error"));
});

// The pointer is still on the button it just pressed, so its done colour has to beat the kind's hover colour.
test("a pressed button's done or failed colour beats its kind's hover colour", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = async (file) => readFile(new URL(`../src/ui/styles/${file}`, import.meta.url), "utf8");
    // Classes and pseudo-classes in one compound selector; :not() counts its inside (no ids or elements here).
    const weight = (selector) => (selector.match(/\.[\w-]+|:(?!not\()[\w-]+/g) ?? []).length;
    const selectors = (text, pattern) =>
        [...text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
            .filter(([, , body]) => /(^|[\s;])color:/.test(body))
            .flatMap(([, head]) => head.split(","))
            .map((selector) => selector.trim())
            .filter((selector) => pattern.test(selector));
    const hover = selectors(await css("_buttons.css"), /^\.btn-(main|quiet|danger):hover/).map(weight);
    assert.equal(hover.length, 3, "the three kinds' hover rules");
    const pages = await css("_account-pages.css");
    for (const kind of ["success", "error"]) {
        const done = selectors(pages, new RegExp(`account-btn--${kind}:.*:hover`)).map(weight);
        assert.ok(
            done.some((w) => w > Math.max(...hover)),
            `account-btn--${kind} on hover outweighs the kinds' hover colour`
        );
    }
});

// A failed bulk write re-reads the page before its handler ends (Masterclass), and its status clears after 1.2 s:
// the failure is still said, though the status is empty again by the time the handler ends.
test("a failure is said even when the status clears while the page reads again", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const status = van.state(null);
    const button = ActionButton({
        label: "Max all",
        status,
        onClick: async () => {
            status.val = "loading";
            await settle();
            status.val = "error";
            await settle(150);
            status.val = null; // useWriteStatus clears it while the re-read still runs
            await settle(150);
        },
    });
    await click(button);
    await settle(50);
    const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    assert.equal(region.textContent, "Max all: failed");
});

// Bribes: Enable all succeeds, and Disable all pressed within 1.2 s only asks "Click again" in its own handler.
test("a press that only asks says nothing of an earlier press's done", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const status = van.state("success"); // Enable all's result, still showing
    // Bribes reads the game, then asks "Click again" in its own handler (clickAgain marks the button).
    const button = ActionButton({
        label: "Disable all",
        status,
        onClick: async () => {
            await settle();
            button.setAttribute("data-again", "Click again");
        },
    });
    announce(""); // the live region, made on its first use
    const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    await click(button);
    await settle(150);
    assert.equal(region.textContent, "", "nothing said");
});

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${what}`);
}
// One macrotask: a press's announcement has decided by then once its handler ended.
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

// A retry within the 1.2 s the failure shows: the page reads the game first, and its write fails before the status
// is looked at again, so the retry is never seen saving. Its failure is still said.
test("a quick retry that fails again is said", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const { useWriteStatus } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const write = useWriteStatus();
    let read; // the page's read of the game, which the test answers
    const button = ActionButton({
        label: "Max all",
        status: write.status,
        onClick: async () => {
            await new Promise((resolve) => (read = resolve));
            await write.run(async () => {
                throw new Error("The game is busy");
            });
        },
    });
    const region = () => elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    let press = click(button);
    read();
    await press;
    await until(() => region()?.textContent === "Max all: failed", "the first failure to be said");
    announce("");
    press = click(button);
    await turn(); // the announcement looked at the status before the read was answered
    read();
    await press;
    await until(() => region().textContent === "Max all: failed", "the retry's failure to be said");
});

// Give everyone, Bribes, Weekly Bosses: a press within 1.2 s of a done that reads the game and finds nothing to do
// (or fails the read) starts no save, and says nothing of the earlier press's done.
test("a press that starts no save says nothing of the earlier done", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const { useWriteStatus } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const write = useWriteStatus();
    let nothingToDo = false;
    const button = ActionButton({
        label: "Give everyone",
        status: write.status,
        onClick: async () => {
            await turn(); // the page reads the game
            if (nothingToDo) return; // "Everyone already wears it."
            await write.run(async () => {});
        },
    });
    const region = () => elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    await click(button);
    await until(() => region()?.textContent === "Give everyone: done", "the first press's done");
    announce("");
    nothingToDo = true;
    await click(button);
    await turn();
    assert.equal(write.status.val, "success", "the earlier done still shows");
    assert.equal(region().textContent, "", "nothing said");
});

// CodeRabbit (local, on #110): two buttons share one status. While the first press reads the game, the second one
// saves and is done; the first then finds nothing to save, and says nothing of the second one's done.
test("a press says nothing of another button's save on the same status", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const { useWriteStatus } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const write = useWriteStatus();
    let read;
    const first = ActionButton({
        label: "Max all",
        status: write.status,
        onClick: async () => {
            await new Promise((resolve) => (read = resolve)); // the page reads the game, and finds nothing to save
        },
    });
    const second = ActionButton({
        label: "Reset all",
        status: write.status,
        onClick: () => write.run(async () => {}),
    });
    announce("");
    const region = () => elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    const pressed = click(first);
    await click(second);
    await until(() => region().textContent === "Reset all: done", "the second press's done");
    read();
    await pressed;
    await turn(); // the first press's announcement has decided once its handler ended
    assert.equal(region().textContent, "Reset all: done", "the first press says nothing");
});

// CodeRabbit (local, on #110): a failure whose colour clears before the status is looked at again, while the handler
// still reads the page, is still said.
test("a failure is said though its colour cleared before the next look", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const { useWriteStatus } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const write = useWriteStatus({ errorMs: 10 });
    const button = ActionButton({
        label: "Max all",
        status: write.status,
        onClick: async () => {
            await write.run(async () => {
                throw new Error("The game is busy");
            });
            await until(() => write.status.val === null, "the colour to clear"); // the page reads again meanwhile
        },
    });
    announce("");
    const region = () => elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    await click(button);
    await until(() => region().textContent === "Max all: failed", "the failure to be said");
});
