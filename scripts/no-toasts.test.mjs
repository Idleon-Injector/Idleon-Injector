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
await loadUi(router);
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
    assert.equal(text(hint), "Enter a value for FIND VALUE, or choose UNKNOWN INITIAL VALUE");
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

    // Typing again clears it; a good value is written and the row confirms in place.
    field().listeners.input({ target: { value: "7" } });
    await settle();
    assert.equal(under(), undefined);
    field().listeners.keydown(event({ key: "Enter" }));
    for (let i = 0; field() && i < 100; i++) await settle();
    assert.equal(field(), undefined, "the field closes once the game took it");
    assert.ok(byClass(page, "is-confirmed").length, "the written row washes once");
});

test("a risky button asks in place: CLICK AGAIN, then the second click runs it, or it runs out", async (t) => {
    const { clickAgain } = await importRepo("src/ui/components/inPlace.js");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const button = globalThis.document.createElement("button");
    button.setAttribute("aria-label", "Disable all");

    assert.equal(clickAgain(button, "disable 12 bribes."), false, "the first click only asks");
    assert.equal(button.attributes["data-again"], "CLICK AGAIN");
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

test("a typed value that needs confirming asks beside its field; only Enter again in the field answers", async () => {
    const { askAtField } = await importRepo("src/ui/components/inPlace.js");
    let inField = true;
    const ask = askAtField(() => inField);
    assert.throws(
        () => ask("lower showdowns from 9 to 3."),
        (error) => {
            assert.equal(error.message, "Enter it again to lower showdowns from 9 to 3.");
            return error.askAgain === true;
        }
    );
    inField = false; // leaving the field saves too, but never answers
    assert.throws(() => ask("lower showdowns from 9 to 3."));
    inField = true;
    assert.equal(ask("lower showdowns from 9 to 3."), true);
});
