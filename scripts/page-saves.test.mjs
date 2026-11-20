// Page saves go through writeVerified: a save lands in the fake game and shows success,
// and a save the game doesn't keep shows as failed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const { getGameContext } = await importRepo("src/cheats/core/globals.js");
const ola = game.gga.OptionsListAccount;

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const byClass = (root, name) =>
    elements(root).filter((node) => String(node.attributes.class).split(" ").includes(name));

async function until(check, what) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root), `${file} to load`);
    return root;
}

const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
// The badge shows a dash until the page has read the value.
// The page shows its rows once it has read the game; until then its body is hidden.
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
const rowLoaded = (root, label) => Boolean(findRow(root, label)) && pageRead(root);

async function setRow(root, label, value) {
    const row = findRow(root, label);
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = String(value);
    input.listeners.input({ target: input });
    // Enter saves.
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    const state = () => String(byClass(row, "save-state")[0].attributes.class);
    await until(() => /save-state--(success|error)/.test(state()), `${label} to finish saving`);
    return state().includes("save-state--success") ? "success" : "error";
}

const ROW_PAGES = [
    { file: "src/ui/pages/world-1/owl/owl.js", label: "Feather Generation", index: 254 },
    { file: "src/ui/pages/world-2/kangaroo/kangaroo.js", label: "Fisheroo Reset Level", index: 274 },
    { file: "src/ui/pages/world-7/clam-work/clam-work.js", label: "Clam Comrades", index: 456 },
];

for (const { file, label, index } of ROW_PAGES) {
    const page = file.split("/").at(-1);
    const loaded = (root) => rowLoaded(root, label);

    test(`${page}: a save lands at OptionsListAccount[${index}] and shows success`, async () => {
        const root = await openPage(file, loaded);
        const writes = requests.length;
        assert.equal(await setRow(root, label, 42), "success");
        assert.equal(ola[index], 42);
        assert.deepEqual(
            requests.slice(writes).filter((entry) => entry.includes("write")),
            ["POST /api/game/gga/write"]
        );
    });

    test(`${page}: a save the game doesn't keep shows as failed`, async () => {
        const root = await openPage(file, loaded);
        const restore = refuseWrites(ola, index);
        try {
            assert.equal(await setRow(root, label, 7), "error");
            assert.notEqual(ola[index], 7);
        } finally {
            restore();
        }
    });
}

// The game raises the value on every tick (issue #78), and ticks only between game calls: its code is
// single-threaded, so nothing runs inside one call.
const tickBetweenCalls = (list, index, step) => {
    const evaluate = game.runtime.evaluate;
    game.runtime.evaluate = async (options) => {
        const result = await evaluate(options);
        list[index] += step;
        return result;
    };
    return () => (game.runtime.evaluate = evaluate);
};

test("owl.js: a save of a value the game keeps raising shows success", async () => {
    const root = await openPage("src/ui/pages/world-1/owl/owl.js", (r) => rowLoaded(r, "Filler Bar"));
    const stop = tickBetweenCalls(ola, 263, 1e7);
    try {
        assert.equal(await setRow(root, "Filler Bar", 1.69e12), "success");
        assert.ok(ola[263] >= 1.69e12, "the save landed and the game kept counting from it");
    } finally {
        stop();
    }
});

test("owl.js: a value the game keeps raising still shows failed when the game refuses the write", async () => {
    const root = await openPage("src/ui/pages/world-1/owl/owl.js", (r) => rowLoaded(r, "Filler Bar"));
    ola[263] = 5;
    const restore = refuseWrites(ola, 263);
    try {
        assert.equal(await setRow(root, "Filler Bar", 1.69e12), "error");
        assert.equal(ola[263], 5);
    } finally {
        restore();
    }
});

// Pets: the token list in OptionsListAccount[606] and the missing token sources.
const petCard = (root, id) => byClass(root, "companion-card-wrap").find((card) => text(card).includes(`ID ${id}`));
const petsLoaded = (root) => Boolean(petCard(root, 2));
const alertText = (root) => text(elements(root).find((node) => node.attributes.role === "alert") ?? "");
const clickToken = (root, id) => byClass(petCard(root, id), "companion-token")[0].listeners.click();

test("pets.js: removing a pet token saves the list without it", async () => {
    ola[606] = "2,5";
    const root = await openPage("src/ui/pages/world-1/pets/pets.js", petsLoaded);
    const since = requests.length;
    await clickToken(root, 2);
    await until(() => ola[606] === "5" && requests.slice(since).includes("POST /api/config/save"), "the token save");
    assert.equal(alertText(root), "");
});

test("pets.js: a token list the game doesn't keep shows the save failed", async () => {
    ola[606] = "2,5";
    const root = await openPage("src/ui/pages/world-1/pets/pets.js", petsLoaded);
    const restore = refuseWrites(ola, 606);
    try {
        const saves = requests.filter((entry) => entry === "POST /api/config/save").length;
        await clickToken(root, 2);
        await until(() => alertText(root), "the failure banner");
        assert.equal(alertText(root), "Could not save pet token picks");
        assert.equal(ola[606], "2,5");
        // The pet tiers aren't applied after a failed token save.
        assert.equal(requests.filter((entry) => entry === "POST /api/config/save").length, saves);
    } finally {
        restore();
    }
});

// Two token sources the account lacks, as the game's Stuff2 code lists them.
const grantFixture = () => {
    ola[605] = 0;
    ola[615] = 0;
    const stuff2 = (name) => (name === "PetBonusTokensOwned" ? Number(ola[605] >= 1) + Number(ola[615] >= 1) : 0);
    stuff2.toString = () =>
        'function(t){return"PetBonusTokensOwned"==t?n.asNumber(a("OptionsListAccount")[605])+n.asNumber(a("OptionsListAccount")[615]):"Other"==t?0:0}';
    getGameContext()["scripts.ActorEvents_579"] = { _customBlock_Stuff2: stuff2 };
};
const grantButton = (root) => elements(root).find((node) => text(node) === "Grant missing token");

test("pets.js: granting the missing tokens writes every source in one batch", async () => {
    grantFixture();
    const root = await openPage("src/ui/pages/world-1/pets/pets.js", petsLoaded);
    assert.equal(grantButton(root).attributes.hidden, false);
    const writes = requests.length;
    const outcome = await grantButton(root).listeners.click();
    assert.equal(outcome.ok, true);
    assert.equal(ola[605], 1);
    assert.equal(ola[615], 1);
    assert.deepEqual(
        requests.slice(writes).filter((entry) => entry.includes("write")),
        ["POST /api/game/gga/write-many"]
    );
    assert.equal(alertText(root), "");
});

test("pets.js: a batch save of a value the game keeps raising shows success", async () => {
    grantFixture();
    const root = await openPage("src/ui/pages/world-1/pets/pets.js", petsLoaded);
    const stop = tickBetweenCalls(ola, 615, 1);
    try {
        const outcome = await grantButton(root).listeners.click();
        assert.equal(outcome.ok, true);
        assert.equal(alertText(root), "");
    } finally {
        stop();
    }
});

test("pets.js: a grant the game doesn't keep shows as failed", async () => {
    grantFixture();
    const root = await openPage("src/ui/pages/world-1/pets/pets.js", petsLoaded);
    const restore = refuseWrites(ola, 615);
    try {
        const outcome = await grantButton(root).listeners.click();
        assert.equal(outcome.ok, false);
        await until(() => alertText(root), "the failure banner");
        assert.equal(alertText(root), "Could not grant the missing pet token");
        assert.equal(ola[615], 0);
    } finally {
        restore();
    }
});

// Fields stay enabled while a save runs, so focus stays where the player put it (and Enter again can answer
// the question a lock asks in the field).
test("prayers.js: the level field stays enabled while its save runs", async (t) => {
    const firstRow = (root) => byClass(root, "prayer-row")[0];
    const root = await openPage(
        "src/ui/pages/world-3/prayers/prayers.js",
        (root) => Boolean(firstRow(root)) && pageRead(root)
    );
    const row = firstRow(root);
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    const disabledDuringSave = [];
    const fetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (...args) => {
        const response = await fetch(...args);
        disabledDuringSave.push(Boolean(input.attributes.disabled));
        return response;
    });
    input.value = "3";
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    const state = () => String(byClass(row, "save-state")[0].attributes.class);
    await until(() => /save-state--(success|error)/.test(state()), "the level to finish saving");
    assert.match(state(), /save-state--success/);
    assert.ok(disabledDuringSave.length > 0);
    assert.deepEqual([...new Set(disabledDuringSave)], [false], "the field was never disabled");
});

// A page save for one character (writeManyVerified's `character`): the game checks who is in play in the same call
// as the writes, so a player who switched characters meanwhile gets nothing written on the new one.
const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
const { fetchChanges } = await importRepo("src/ui/services/api.js");
const OLA = 254;
async function playing(name, run) {
    Object.assign(game.gga, { UserInfo: [name], GetPlayersUsernames: ["Lumi_Main", "Lumi_Alt"] });
    try {
        return await run();
    } finally {
        delete game.gga.UserInfo;
        delete game.gga.GetPlayersUsernames;
    }
}
const logged = async () => (await fetchChanges()).actions.length;

test("a save for the character in play lands and goes in the change log", () =>
    playing("Lumi_Main", async () => {
        const actions = await logged();
        await writeManyVerified([{ path: `OptionsListAccount[${OLA}]`, value: 61 }], { character: "Lumi_Main" });
        assert.equal(ola[OLA], 61);
        assert.equal(await logged(), actions + 1);
    }));

test("a save for another character than the one in play writes nothing and says who is in play", () =>
    playing("Lumi_Alt", async () => {
        const before = ola[OLA];
        const actions = await logged();
        await assert.rejects(
            writeManyVerified([{ path: `OptionsListAccount[${OLA}]`, value: 62 }], { character: "Lumi_Main" }),
            { message: "Lumi_Alt is in play now, not Lumi_Main. Nothing was changed for Lumi_Alt." }
        );
        assert.equal(ola[OLA], before);
        assert.equal(await logged(), actions, "nothing logged");
    }));

test("a switch after the change log read the old values, before the game writes, writes nothing", () =>
    playing("Lumi_Main", async () => {
        const before = ola[OLA];
        const evaluate = game.runtime.evaluate;
        // The player switches just as the write reaches the game: after the save planned and read the old values.
        game.runtime.evaluate = (options) => {
            if (options.expression.startsWith("writeGamePaths(")) game.gga.UserInfo[0] = "Lumi_Alt";
            return evaluate(options);
        };
        try {
            await assert.rejects(
                writeManyVerified([{ path: `OptionsListAccount[${OLA}]`, value: 63 }], { character: "Lumi_Main" }),
                /Lumi_Alt is in play now, not Lumi_Main/
            );
        } finally {
            game.runtime.evaluate = evaluate;
        }
        assert.equal(ola[OLA], before);
    }));

test("a save that names no character lands whoever is in play, with the request it always sent", (t) =>
    playing("Lumi_Alt", async () => {
        const bodies = [];
        const fetch = globalThis.fetch;
        t.mock.method(globalThis, "fetch", (url, options) => {
            if (String(url).endsWith("/write-many")) bodies.push(JSON.parse(options.body));
            return fetch(url, options);
        });
        await writeManyVerified([{ path: `OptionsListAccount[${OLA}]`, value: 64 }]);
        assert.equal(ola[OLA], 64);
        assert.deepEqual(bodies, [{ writes: [{ path: `gga.OptionsListAccount[${OLA}]`, value: 64 }] }]);
    }));

// A write that never reached the game says why, not that the game kept its old value.
const rowReason = (root, label) => text(byClass(findRow(root, label), "save-state")[0]);

test("owl.js: a save the game can't be reached for says why", async () => {
    const root = await openPage("src/ui/pages/world-1/owl/owl.js", (r) => rowLoaded(r, "Feather Generation"));
    const evaluate = game.runtime.evaluate;
    // What chrome-remote-interface answers while the game page reloads.
    game.runtime.evaluate = async () => {
        throw new Error("Cannot find context with specified id");
    };
    try {
        assert.equal(await setRow(root, "Feather Generation", 9), "error");
    } finally {
        game.runtime.evaluate = evaluate;
    }
    assert.match(rowReason(root, "Feather Generation"), /Cannot find context with specified id/);
    assert.doesNotMatch(rowReason(root, "Feather Generation"), /game kept old value/);
});

test("a write to a slot that doesn't exist says so, alone or in a batch", async () => {
    const { writeVerified, writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { saveFailureReason } = await importRepo("src/ui/components/views/account/autoSave.js");
    const single = await writeVerified("NoSuchKey[3]", 5).catch((error) => error);
    assert.match(saveFailureReason(single), /Cannot resolve path segment: NoSuchKey/);
    const batch = await writeManyVerified([
        { path: "OptionsListAccount[254]", value: 3 },
        { path: "NoSuchKey[3][1]", value: 5 },
    ]).catch((error) => error);
    assert.match(saveFailureReason(batch), /Cannot resolve path segment: NoSuchKey/);
    assert.deepEqual(
        batch.results.map((entry) => entry.ok),
        [true, false],
        "the batch's results stay on the error"
    );
});
