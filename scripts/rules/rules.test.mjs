// The 3.0 rules (#19): each one refuses a pre-3.0 example and accepts the 3.0 way, and the repo follows them apart
// from scripts/rules/exceptions.json. "allowed" there is permanent, each with its reason; "oldStyle" is the code
// still to convert, which only shrinks, and 3.0 ships when it's empty.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check, checkRepo, compare, repoRoot, RULES } from "./rules.mjs";

const exceptions = JSON.parse(readFileSync(new URL("./exceptions.json", import.meta.url), "utf8"));
const rulesOf = (file, source) => check(file, source).map(({ rule }) => rule);
const HOOK = "src/cheats/hooks/fixture.js";
const PAGE = "src/ui/pages/world-1/fixture/fixture.js";

test("patching the game outside defineHook is refused, and the message names the 3.0 way", () => {
    const [found] = check(HOOK, 'Object.defineProperty(events(12).prototype, "_customBlock_X", { value: () => 1 });');
    assert.equal(
        found.message,
        `${HOOK}:1 patches the game with Object.defineProperty. That's the pre-3.0 way; declare a hook with defineHook instead (see AGENTS.md).`
    );
    assert.deepEqual(rulesOf(HOOK, "gga.Cards = new Proxy(gga.Cards, {});"), ["patch"]);
    assert.deepEqual(rulesOf(HOOK, "behavior.randomFloat = function () { return 1; };"), ["patch"]);
    assert.deepEqual(rulesOf(HOOK, "if (fn._isPatched) fn();"), ["patch"]);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", "actor.growTo = (x) => x;"), ["patch"]);

    assert.deepEqual(
        rulesOf(HOOK, 'defineHook({ id: "rng", target: () => behavior, method: "randomFloat" }, (base) => base);'),
        []
    );
    assert.deepEqual(
        rulesOf("src/cheats/core/hooks.js", "Object.defineProperty(target, key, {}); new Proxy(a, {});"),
        []
    );
    // Not the game: a DOM handler, an argument slot, and the injector's own config.
    assert.deepEqual(rulesOf("src/cheats/ui/fixture.js", "button.onclick = () => close();"), []);
    assert.deepEqual(rulesOf(HOOK, "args[1] = function () {};"), []);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", "cheatConfig.misc.keychain = () => [];"), []);
});

test("eval and new Function are refused", () => {
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", "eval(params[0]);"), ["eval"]);
    assert.deepEqual(rulesOf("src/ui/pages/world-1/fixture/fixture.js", 'new Function("return 1")();'), ["eval"]);
    assert.deepEqual(rulesOf("src/modules/fixture.js", 'Function("return 1")();'), ["eval"]);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", "const value = gga[params[0]];"), []);
});

test("game-side mods don't touch window, and UI code doesn't add globals", () => {
    assert.deepEqual(rulesOf(HOOK, "window.myCheatState = {};"), ["window"]);
    assert.deepEqual(rulesOf(HOOK, "const engine = globalThis.bEngine;"), ["window"]);
    assert.deepEqual(rulesOf(PAGE, "window.pageState = {};"), ["window"]);

    assert.deepEqual(rulesOf(HOOK, 'import { gga } from "../core/globals.js"; gga.Money;'), []);
    assert.deepEqual(rulesOf(HOOK, "const { window: frame } = options; frame.ok;"), []);
    assert.deepEqual(rulesOf(PAGE, 'if (!window.confirm("Reset?")) return;'), []);
    assert.deepEqual(rulesOf("src/cheats/main.js", "window.cheat = cheat;"), []);
});

test("routes belong to the core", () => {
    assert.deepEqual(rulesOf(PAGE, 'router.post("/api/mine", handler);'), ["route"]);
    assert.deepEqual(rulesOf("src/modules/server/routes/fixture.js", 'router.post("/api/mine", handler);'), []);
    assert.deepEqual(rulesOf(PAGE, 'const level = levels.get("stamps");'), []);
});

test("dependencies belong to the core", () => {
    assert.deepEqual(rulesOf(HOOK, 'import debounce from "lodash/debounce";'), ["dependency"]);
    assert.deepEqual(rulesOf(PAGE, 'import van from "../../../vendor/van-1.6.0.js";'), []);
    assert.deepEqual(rulesOf("src/modules/fixture.js", 'const WebSocket = require("ws");'), []);

    const root = mkdtempSync(join(tmpdir(), "rules-"));
    try {
        mkdirSync(join(root, "src"));
        writeFileSync(
            join(root, "package.json"),
            JSON.stringify({ dependencies: { ws: "1" }, devDependencies: { leftpad: "1" } })
        );
        const found = checkRepo(root, ["ws"]);
        assert.deepEqual(
            found.map(({ rule, file, detail }) => [rule, file, detail]),
            [["dependency", "package.json", "leftpad"]]
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("code that runs in the game makes no network calls", () => {
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", 'fetch("https://example.com");'), ["network"]);
    assert.deepEqual(rulesOf(HOOK, "new WebSocket(url);"), ["network"]);
    assert.deepEqual(rulesOf(HOOK, "navigator.sendBeacon(url, data);"), ["network"]);
    // The UI talks to the injector's server; that's its job.
    assert.deepEqual(rulesOf("src/ui/services/fixture.js", 'fetch("/api/cheats");'), []);
});

test("a mod's own timer loop is refused; defineAutomation runs it", () => {
    const [found] = check("src/cheats/automations/fixture.js", "setInterval(tick, 100);");
    assert.match(
        found.message,
        /runs its own timer \(setInterval\)\. That's the pre-3\.0 way; declare the loop with defineAutomation/
    );
    assert.deepEqual(rulesOf(HOOK, "setTimeout(() => done(), 50);"), ["timer"]);
    assert.deepEqual(rulesOf(HOOK, "requestAnimationFrame(draw);"), ["timer"]);

    assert.deepEqual(
        rulesOf(
            "src/cheats/automations/fixture.js",
            'defineAutomation({ id: "w1.fixture", cheat: "fixture", interval: 100, tick, status: () => "on" });'
        ),
        []
    );
    assert.deepEqual(rulesOf("src/cheats/core/automations.js", "setInterval(tick, 100);"), []);
});

test("pages save through writeVerified", () => {
    const [found] = check(PAGE, 'await gga("Money", 5);');
    assert.match(
        found.message,
        /saves with gga\(path, value\) directly\. That's the pre-3\.0 way; save through writeVerified/
    );
    assert.deepEqual(rulesOf(PAGE, 'await ggaMany([{ path: "Money", value: 5 }]);'), ["write"]);

    assert.deepEqual(rulesOf(PAGE, 'await writeVerified("Money", 5);'), []);
    assert.deepEqual(rulesOf(PAGE, 'await writeManyVerified([{ path: "Money", value: 5 }]);'), []);
    assert.deepEqual(rulesOf(PAGE, 'const money = await gga("Money");'), []);
    assert.deepEqual(rulesOf("src/ui/components/views/account/accountShared.js", "await gga(path, value);"), []);
});

test("mods don't import each other", () => {
    assert.deepEqual(rulesOf(HOOK, 'import { other } from "./other.js";'), ["mod-import"]);
    assert.deepEqual(rulesOf(HOOK, 'import { sushiTools } from "../cheats/sushi/station.js";'), ["mod-import"]);
    assert.deepEqual(rulesOf(PAGE, 'import { rows } from "../stamps/stamps.js";'), ["mod-import"]);

    // A mod's own folder, the core, helpers and the page building blocks are fine.
    assert.deepEqual(rulesOf("src/cheats/cheats/sushi.js", 'import { sushiTools } from "./sushi/station.js";'), []);
    assert.deepEqual(
        rulesOf("src/cheats/cheats/sushi/automation.js", 'import { readSushiSettings } from "./settings.js";'),
        []
    );
    assert.deepEqual(
        rulesOf(
            HOOK,
            'import { defineHook } from "../core/hooks.js"; import { withStorageCapScope } from "../helpers/storageCap.js";'
        ),
        []
    );
    assert.deepEqual(
        rulesOf(PAGE, 'import { writeVerified } from "../../../components/views/account/accountShared.js";'),
        []
    );
});

test("nothing imports across the game, server and UI runtimes", () => {
    assert.deepEqual(rulesOf(HOOK, 'import { gga } from "../../ui/services/api.js";'), ["cross-runtime"]);
    assert.deepEqual(rulesOf(PAGE, 'import { cheatState } from "../../../../cheats/core/state.js";'), [
        "cross-runtime",
    ]);
    assert.deepEqual(rulesOf("src/modules/fixture.js", 'require("../cheats/core/state.js");'), ["cross-runtime"]);

    assert.deepEqual(rulesOf("src/main.js", 'require("./modules/utils/logger");'), []);
    assert.deepEqual(rulesOf("src/modules/server/fixture.js", 'require("../../package.json");'), []);
});

test('returning "Error:" strings is refused; a cheat throws instead', () => {
    const [found] = check("src/cheats/cheats/fixture.js", 'function fn() { return "Error: no such item"; }');
    assert.match(found.message, /returns an "Error:" string\. That's the pre-3\.0 way; throw an Error/);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", "function fn(x) { return `Error: ${x}`; }"), [
        "error-string",
    ]);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", 'const fn = (x) => "Error: " + x;'), ["error-string"]);

    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", 'function fn() { throw new Error("No such item"); }'), []);
    assert.deepEqual(rulesOf("src/cheats/cheats/fixture.js", 'function fn() { return "Errors are rare"; }'), []);
});

test("a page listed in a pre-3.0 tab list counts as not yet moved", () => {
    const tabs = 'const TABS = [{ id: "a", label: "A", component: ATab }, { id: "b", label: "B", component: null }];';
    const [found] = check("src/ui/components/views/account/W2Tab.js", tabs);
    assert.equal(
        found.message,
        "src/ui/components/views/account/W2Tab.js:1 lists the page ATab in a shared tab list. That's the pre-3.0 way; move it to src/ui/pages/<world>/<page>/ with definePage, and the menu finds it (see AGENTS.md)."
    );
    assert.equal(check("src/ui/components/views/account/W2Tab.js", tabs).length, 1);
    assert.deepEqual(
        rulesOf("src/ui/components/views/Account.js", 'const TABS = [{ id: "w2", component: W2Tab }];'),
        []
    );
    // A page's own inner tabs are fine.
    assert.deepEqual(rulesOf(PAGE, tabs), []);
});

test('every around hook has an "// Around:" comment saying why base-first does not work', () => {
    const around =
        'defineHook({ id: "rng", target: () => behavior, method: "randomInt", around: true }, (callOriginal) => 1);';
    assert.deepEqual(rulesOf(HOOK, around), ["around-comment"]);
    assert.deepEqual(rulesOf(HOOK, `// Forced rolls.\n${around}`), ["around-comment"]);

    assert.deepEqual(rulesOf(HOOK, `// Around: a forced roll replaces the game's random number.\n${around}`), []);
    assert.deepEqual(rulesOf(HOOK, `// Forced rolls.\n// Around: the game's roll must not run.\n${around}`), []);
    assert.deepEqual(
        rulesOf(HOOK, 'defineHook({ id: "rng", target: () => behavior, method: "randomInt" }, (base) => base);'),
        []
    );
});

test("the exceptions list matches by rule, file and detail, up to its count, and goes stale when code is fixed", () => {
    const offence = (detail) => ({ rule: "patch", file: "a.js", detail });
    const exact = { rule: "patch", file: "a.js", detail: "growTo", count: 1 };
    const any = { rule: "patch", file: "a.js", count: 1 };

    assert.deepEqual(compare([offence("growTo"), offence("other")], [any, exact]), { unexpected: [], stale: [] });
    assert.deepEqual(compare([offence("other"), offence("other")], [exact, any]).unexpected, [offence("other")]);
    assert.deepEqual(compare([], [exact]).stale, [{ ...exact, found: 0 }]);
});

test("every exception names a known rule, a count and a reason; allowed swaps are exact", () => {
    for (const entry of [...exceptions.allowed, ...exceptions.oldStyle]) {
        assert.ok(RULES.includes(entry.rule), `${entry.file}: unknown rule ${entry.rule}`);
        assert.ok(entry.count >= 1, `${entry.file}: count`);
        assert.ok(entry.reason?.length > 10, `${entry.file}: reason`);
    }
    for (const entry of exceptions.allowed.filter(({ rule }) => rule === "patch"))
        assert.ok(entry.detail, `${entry.file}: an allowed swap names the value it swaps`);
});

test("the repo follows the 3.0 rules, apart from the listed exceptions", (t) => {
    const found = checkRepo(repoRoot, exceptions.dependencies);
    const { unexpected, stale } = compare(found, [...exceptions.allowed, ...exceptions.oldStyle]);

    const left = {};
    for (const entry of exceptions.oldStyle) left[entry.rule] = (left[entry.rule] ?? 0) + entry.count;
    const total = Object.values(left).reduce((sum, count) => sum + count, 0);
    const byRule = Object.entries(left).map(([rule, count]) => `${rule} ${count}`);
    t.diagnostic(`Old-style code left before 3.0: ${total} (${byRule.join(", ")}). 3.0 ships at 0.`);

    assert.ok(
        !unexpected.length,
        `New code must follow the 3.0 rules:\n${unexpected.map(({ message }) => message).join("\n")}`
    );
    assert.ok(
        !stale.length,
        stale
            .map(
                ({ rule, file, detail, count, found: now }) =>
                    `scripts/rules/exceptions.json lists ${count} "${rule}"${detail ? ` (${detail})` : ""} in ${file}, but there ${now === 1 ? "is" : "are"} ${now} now. Lower its count, or remove it at 0, so the list only shrinks.`
            )
            .join("\n")
    );
});
