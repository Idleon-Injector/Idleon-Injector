// No toasts in the WebUI (#77): each message is said where it happened. The command box, the Cheats rows and the
// status line have their own tests (menu-command, cheat-results, hooks/webui-warning); these cover the rest.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const uiFiles = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? entry.name === "vendor"
                ? []
                : uiFiles(join(dir, entry.name))
            : /\.(js|css)$/.test(entry.name)
              ? [join(dir, entry.name)]
              : []
    );

test("nothing in the WebUI calls a toast, a notification bell or a confirm() popup", () => {
    const found = uiFiles("src/ui").flatMap((file) =>
        readFileSync(join(root, file), "utf8")
            .split("\n")
            .map((line, i) => [file, i + 1, line])
            .filter(([, , line]) =>
                /\bnotify\(|\bToast\b|NotificationHistory|notificationHistory|notification-history|\bconfirm\(\s*[`"']|window\.confirm\(/.test(
                    line
                )
            )
    );
    assert.deepEqual(
        found.map(([file, line, text]) => `${file}:${line}: ${text.trim()}`),
        [],
        "say it in place instead"
    );
});

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const classOf = (node) => String(node.className ?? node.attributes?.class ?? "");
const byClass = (node, name) => find(node, (child) => classOf(child).split(/\s+/).includes(name));
const event = (extra = {}) => ({ preventDefault() {}, stopPropagation() {}, ...extra });

const { router } = await createFakeApi();
const { store } = await loadUi(router);
// The click-again question shows in the menu's tooltip and is read out once, from a live region on the page.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

test("value search: a refused scan is said in its hint line, a bad value under its field", async () => {
    const { Search } = await importRepo("src/ui/components/views/Search.js");
    const page = Search();
    for (let i = 0; !byClass(page, "search-query-input").length && i < 100; i++) await settle();
    const query = byClass(page, "search-query-input")[0];
    for (let i = 0; i < 100 && !find(page, (n) => /OptionsListAccount/.test(n.data ?? "")).length; i++) await settle(); // the keys load

    // Enter with no value: the scan doesn't run, and the hint line under the field says why.
    query.listeners.keydown(event({ key: "Enter" }));
    await settle(50);
    const hint = byClass(page, "search-type-hint")[0];
    assert.equal(hint.attributes.role, "status");
    assert.equal(text(hint), "Enter a value for Find Value, or choose Unknown Initial Value");
    assert.ok(byClass(hint, "search-refusal").length, "it pulses (a refusal)");

    // Typing takes the refusal back; a scan finds values.
    query.listeners.input({ target: { value: "5" } });
    await settle();
    assert.doesNotMatch(text(byClass(page, "search-type-hint")[0]), /Enter a value/);
    query.listeners.keydown(event({ key: "Enter" }));
    for (let i = 0; !byClass(page, "edit-btn").length && i < 200; i++) await settle();

    // A value the field can't take is said under the field, and nothing is written.
    byClass(page, "edit-btn")[0].listeners.click(event());
    await settle();
    const field = () => byClass(page, "result-edit-input")[0];
    field().listeners.input({ target: { value: "abc" } });
    field().listeners.keydown(event({ key: "Enter" }));
    await settle();
    const under = () => byClass(page, "said--under").find((line) => /said--failed/.test(classOf(line)));
    assert.ok(under(), "a line under the field");
    assert.equal(under().attributes.role, "status", "screen readers hear it");
    assert.match(text(under()), /number/i);
    assert.ok(field(), "the field stays open to fix it");
    assert.equal(field().attributes["aria-invalid"], "true", "the field says it's invalid");
    assert.match(under().id, /^search-edit-error-\d+$/);
    assert.equal(field().attributes["aria-describedby"], under().id, "and points at why");

    // Typing again clears it; a good value is written and the row confirms in place.
    field().listeners.input({ target: { value: "7" } });
    await settle();
    assert.equal(under(), undefined);
    assert.equal(field().attributes["aria-invalid"], "false");
    assert.equal(field().attributes["aria-describedby"], "");
    field().listeners.keydown(event({ key: "Enter" }));
    for (let i = 0; field() && i < 100; i++) await settle();
    assert.equal(field(), undefined, "the field closes once the game took it");
    assert.ok(byClass(page, "is-confirmed").length, "the written row washes once");
});

test("value search: a scan waits while a value is being written, so a failed write is still said", async (t) => {
    const { Search } = await importRepo("src/ui/components/views/Search.js");
    const page = Search();
    for (let i = 0; !byClass(page, "search-query-input").length && i < 100; i++) await settle();
    const query = byClass(page, "search-query-input")[0];
    for (let i = 0; i < 100 && !find(page, (n) => /OptionsListAccount/.test(n.data ?? "")).length; i++) await settle();
    query.listeners.input({ target: { value: "5" } });
    await settle();
    query.listeners.keydown(event({ key: "Enter" }));
    for (let i = 0; !byClass(page, "edit-btn").length && i < 200; i++) await settle();

    let fail;
    t.mock.method(store, "setGgaValue", () => new Promise((_, reject) => (fail = reject)));
    byClass(page, "edit-btn")[0].listeners.click(event());
    await settle();
    const field = () => byClass(page, "result-edit-input")[0];
    field().listeners.input({ target: { value: "8" } });
    field().listeners.keydown(event({ key: "Enter" })); // the write starts
    await settle();
    query.listeners.keydown(event({ key: "Enter" })); // a scan while it runs
    await settle();
    assert.equal(text(byClass(page, "search-type-hint")[0]), "Wait until the value is written");

    fail(new Error("the game kept 5"));
    await settle();
    const under = byClass(page, "said--under").find((line) => /said--failed/.test(classOf(line)));
    assert.ok(field(), "the field is still open");
    assert.equal(text(under), "the game kept 5", "and says why the value wasn't written");
});

test("value search: a NEXT scan keeps the warning that the NEW scan stopped at its limit", async (t) => {
    const hits = [{ path: "OptionsListAccount[1]", value: 5, formattedValue: "5", type: "number" }];
    const answers = [
        { results: hits, totalCount: 1, truncated: true }, // NEW: hit the limit
        { results: hits, totalCount: 1, truncated: false }, // NEXT: within those results only
    ];
    t.mock.method(store, "searchGga", async () => answers.shift());
    const { Search } = await importRepo("src/ui/components/views/Search.js");
    const page = Search();
    for (let i = 0; !byClass(page, "search-query-input").length && i < 100; i++) await settle();
    const query = byClass(page, "search-query-input")[0];
    for (let i = 0; i < 100 && !find(page, (n) => /OptionsListAccount/.test(n.data ?? "")).length; i++) await settle();
    const warned = () => /stopped at its result limit/.test(text(byClass(page, "search-note")[0]));

    query.listeners.input({ target: { value: "5" } });
    await settle();
    query.listeners.keydown(event({ key: "Enter" }));
    await settle(50);
    assert.ok(warned(), "the NEW scan says some matches are missing");
    query.listeners.keydown(event({ key: "Enter" }));
    await settle(50);
    assert.equal(answers.length, 0, "a NEXT scan ran");
    assert.ok(warned(), "and they're still missing");
});

test("a risky button asks in place: Click again, then the second click runs it, or it runs out", async (t) => {
    const { clickAgain } = await importRepo("src/ui/components/inPlace.js");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const button = globalThis.document.createElement("button");
    button.setAttribute("aria-label", "Disable all");

    assert.equal(clickAgain(button, "disable 12 bribes."), false, "the first click only asks");
    assert.equal(button.attributes["data-again"], "Click again");
    assert.equal(button.attributes["aria-label"], "Click again to disable 12 bribes.");
    assert.equal(clickAgain(button, "disable 12 bribes."), true, "the second click runs it");
    assert.equal(button.attributes["data-again"], undefined, "and the button is itself again");
    assert.equal(button.attributes["aria-label"], "Disable all");

    clickAgain(button, "disable 12 bribes.");
    assert.equal(clickAgain(button, "disable 13 bribes."), false, "other targets ask again");
    t.mock.timers.tick(4000);
    assert.equal(button.attributes["data-again"], undefined, "it runs out after a few seconds");
    assert.equal(clickAgain(button, "disable 13 bribes."), false, "a click after that asks again");
});

test("a second click on other targets asks again, even when the question reads the same", async (t) => {
    const { clickAgain } = await importRepo("src/ui/components/inPlace.js");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const button = globalThis.document.createElement("button");
    // The player asks for 2 shown items, then searches for 2 others and clicks again.
    assert.equal(clickAgain(button, "register 2 shown items.", { targets: ["Grasslands1", "Jungle1"] }), false);
    assert.equal(
        clickAgain(button, "register 2 shown items.", { targets: ["Desert1", "Snow1"] }),
        false,
        "the new items get their own question"
    );
    assert.equal(button.attributes["data-again"], "Click again");
    assert.equal(clickAgain(button, "register 2 shown items.", { targets: ["Desert1", "Snow1"] }), true);
});

test("one button's question running out doesn't hide another button's question", async (t) => {
    const { clickAgain } = await importRepo("src/ui/components/inPlace.js");
    const { TooltipContainer } = await importRepo("src/ui/components/Tooltip.js");
    const tooltip = TooltipContainer();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const first = globalThis.document.createElement("button");
    const second = globalThis.document.createElement("button");

    clickAgain(first, "reset the first.");
    t.mock.timers.tick(3000);
    clickAgain(second, "reset the second.");
    t.mock.timers.tick(1000); // the first runs out
    await Promise.resolve(); // the tooltip redraws
    assert.equal(first.attributes["data-again"], undefined);
    assert.match(classOf(tooltip), /\bvisible\b/, "the second question still shows");
    assert.equal(text(tooltip), "Click again to reset the second.");
    t.mock.timers.tick(3000);
    await Promise.resolve();
    assert.doesNotMatch(classOf(tooltip), /\bvisible\b/, "and goes when it runs out itself");
});

test("a question hidden before its tooltip is placed stays hidden", async (t) => {
    const { hideTooltip, showTooltip, TooltipContainer } = await importRepo("src/ui/components/Tooltip.js");
    const tooltip = TooltipContainer();
    await settle(); // the container becomes the tooltip that gets placed
    const box = () => ({ top: 100, bottom: 120, left: 100, right: 200, width: 100, height: 20 });
    tooltip.getBoundingClientRect = box;
    const field = globalThis.document.createElement("input");
    field.getBoundingClientRect = box;
    const frames = [];
    t.mock.method(globalThis, "requestAnimationFrame", (frame) => frames.push(frame));
    globalThis.window ??= { innerWidth: 800, innerHeight: 600 };

    // The field asks, and the player leaves it before the next frame places the tooltip.
    showTooltip(field, "Enter again to lock Big Brain Time.");
    hideTooltip(field);
    frames.splice(0).forEach((frame) => frame());
    await Promise.resolve();
    assert.doesNotMatch(classOf(tooltip), /\bvisible\b/, "the queued frame doesn't bring it back");

    showTooltip(field, "Enter again to lock Big Brain Time.");
    frames.splice(0).forEach((frame) => frame());
    await Promise.resolve();
    assert.match(classOf(tooltip), /\bvisible\b/, "a question still showing is placed");
});

test("a typed value that needs confirming asks beside its field; only Enter again in the field answers", async () => {
    const { askAtField } = await importRepo("src/ui/components/inPlace.js");
    const field = globalThis.document.createElement("input");
    const ask = askAtField(() => field);
    globalThis.document.activeElement = field;
    assert.throws(
        () => ask("lower showdowns from 9 to 3."),
        (error) => error.message === "Re-enter" && error.askAgain === true,
        "the first Enter is refused; the field's save state says Re-enter"
    );
    globalThis.document.activeElement = field;
    field.listeners.keydown({ key: "Enter" });
    assert.equal(ask("lower showdowns from 9 to 3."), true, "Enter again in the field answers");

    globalThis.document.activeElement = null; // leaving the field saves too, but never answers
    assert.throws(() => ask("lower showdowns from 9 to 3."));
    assert.throws(() => ask("lower showdowns from 9 to 3."));
    globalThis.document.activeElement = field;
    assert.throws(() => ask("lower showdowns from 9 to 3."), "back in the field, it asks before it answers");
    field.listeners.keydown({ key: "Enter" });
    assert.equal(ask("lower showdowns from 9 to 3."), true);
});

test("leaving the field forgets the question, even if the player is back in it when that save asks", async () => {
    const { askAtField } = await importRepo("src/ui/components/inPlace.js");
    const field = globalThis.document.createElement("input");
    const ask = askAtField(() => field);
    globalThis.document.activeElement = field;
    assert.throws(() => ask("lower showdowns from 9 to 3."), "Enter asks");

    // Tab away: leaving saves, and that save reads the game before it asks; the player clicks back meanwhile.
    globalThis.document.activeElement = null;
    field.listeners.focusout({ relatedTarget: null });
    globalThis.document.activeElement = field;
    assert.throws(() => ask("lower showdowns from 9 to 3."), "the save from leaving only asks again");
    field.listeners.keydown({ key: "Enter" });
    assert.equal(ask("lower showdowns from 9 to 3."), true, "an Enter after that answers");
});

test("a save queued before the question was asked can't answer it; only an Enter after it does", async () => {
    const { askAtField } = await importRepo("src/ui/components/inPlace.js");
    const { useAutoSave } = await importRepo("src/ui/components/views/account/autoSave.js");
    const row = globalThis.document.createElement("div");
    const field = globalThis.document.createElement("input");
    row.append(field);
    const ask = askAtField(() => field);
    // Like a prayer's level: each save reads the game first (the test ends each read), then asks to lock it.
    const reads = [];
    const written = [];
    const { handlers } = useAutoSave({
        prepare: () => ({
            write: async () => {
                await new Promise((resolve) => reads.push(resolve));
                ask("lock Big Brain Time.");
                written.push(0);
                return 0;
            },
        }),
    });
    // The field's own listeners hear a key before the row's save handler does.
    const pressEnter = () => {
        field.listeners.keydown?.({ key: "Enter" });
        handlers.onkeydown({ key: "Enter", target: field, preventDefault() {} });
    };
    const endRead = async () => {
        reads.shift()();
        await settle();
    };

    globalThis.document.activeElement = field;
    pressEnter(); // Enter on 0: the save reads the game
    globalThis.document.activeElement = null; // the player leaves: a save is queued behind it
    handlers.onfocusout({ relatedTarget: null, currentTarget: row });
    globalThis.document.activeElement = field; // and comes back before the read ends
    await endRead(); // the first save asks
    await endRead(); // the queued save runs
    assert.deepEqual(written, [], "the queued save only asks again");

    pressEnter();
    await endRead();
    assert.deepEqual(written, [0], "an Enter after the question answers it");
});

test("an Enter that confirms IME input doesn't answer a typed question", async () => {
    const { askAtField } = await importRepo("src/ui/components/inPlace.js");
    const field = globalThis.document.createElement("input");
    const ask = askAtField(() => field);
    const asks = (error) => error.askAgain === true;
    globalThis.document.activeElement = field;
    assert.throws(() => ask("lock Big Brain Time."), asks);
    field.listeners.keydown({ key: "Enter", isComposing: true });
    field.listeners.keydown({ key: "Enter", keyCode: 229 });
    assert.throws(() => ask("lock Big Brain Time."), asks, "a composition Enter doesn't answer");
    field.listeners.keydown({ key: "Enter" });
    assert.equal(ask("lock Big Brain Time."), true, "a plain Enter after the question does");
    globalThis.document.activeElement = null;
});
