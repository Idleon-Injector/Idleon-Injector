/**
 * Account - Event Shop
 *
 * Which Event Shop items the account owns: OptionsListAccount[311] holds one letter per owned item (Number2Letter),
 * edited without spending event points. One list in the game's order, the bonus first, each with an Owned switch. Own
 * all and Remove all sit in the tray and act on the items the top bar's search shows; Remove all asks in the tray.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    oneAtATime,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;
const OWNERSHIP_PATH = "OptionsListAccount[311]";
// What an item does beyond its line, in short: said under its name.
const ROW_NOTES = {
    7: "Royal Vote Button adds another 13%, for 30% in all.",
    10: "Reenter town to see the 12 new storage slots.",
    11: "Reenter town to see the 16 new storage slots.",
    16: "Gilded Vote Button adds another 17%, for 30% in all.",
};
// The one item whose switch costs something: shown while it's off, before the switch is flipped.
const CARDIFIER = 50;
const CARDIFIER_WARNING = "Owned here, it gives no cardifiers and the real buy (eight six-star ones) is gone.";

const readSnapshot = async () => {
    const [rawCatalog, rawCodes, rawOwnership] = await Promise.all([
        readCList("NinjaInfo[39]"),
        gga("Number2Letter"),
        gga(OWNERSHIP_PATH),
    ]);
    const definitions = toIndexedArray(unwrapH(rawCatalog));
    const codes = toIndexedArray(unwrapH(rawCodes));
    const ownership = typeof rawOwnership === "string" ? rawOwnership : "";
    if (!definitions.length || definitions.length % 2 !== 0 || !codes.length) {
        throw new Error("The game sent no Event Shop items. Refresh.");
    }

    const catalog = [];
    const usedCodes = new Set();
    for (let index = 0; index < definitions.length / 2; index++) {
        const descriptor = definitions[index * 2];
        const cost = definitions[index * 2 + 1];
        const code = codes[index];
        const separator = typeof descriptor === "string" ? descriptor.indexOf("@") : -1;
        const name = separator > 0 ? cleanName(descriptor.slice(0, separator)) : "";
        const effect = separator > 0 ? cleanName(descriptor.slice(separator + 1)) : "";
        if (
            !name ||
            !effect ||
            !["number", "string"].includes(typeof cost) ||
            String(cost).trim() === "" ||
            !Number.isFinite(Number(cost)) ||
            Number(cost) < 0 ||
            typeof code !== "string" ||
            Array.from(code).length !== 1 ||
            usedCodes.has(code)
        ) {
            throw new Error(`The game's Event Shop item ${index + 1} can't be read. Refresh.`);
        }
        usedCodes.add(code);
        catalog.push({ index, code, name, effect, cost: Number(cost) });
    }
    return { catalog, ownership };
};

const EventShopTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Event Shop" });
    const busy = van.state(false);
    const ready = van.state(false);
    const bulk = useWriteStatus();
    const rows = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const applySnapshot = ({ catalog, ownership }) => {
        // An item the game's catalog no longer lists leaves the tray's count too.
        for (const index of rows.keys()) if (!catalog.some((entry) => entry.index === index)) rows.delete(index);
        for (const entry of catalog) {
            if (!rows.has(entry.index)) rows.set(entry.index, { entry: van.state(entry), owned: van.state(false) });
            const row = rows.get(entry.index);
            row.entry.val = entry;
            row.owned.val = ownership.includes(entry.code);
        }
        reconcileRows(catalog.map((entry) => entry.index).join(","), () =>
            catalog.map(({ index }) => {
                const row = rows.get(index);
                row.node = AccountRow({
                    rowClass: "eventshop-row",
                    info: RowTitles({
                        bonus: () => row.entry.val.effect,
                        name: () => `${row.entry.val.name} · ${row.entry.val.cost.toLocaleString("en-US")} points`,
                        note: ROW_NOTES[index],
                        warning: index === CARDIFIER ? () => (row.owned.val ? null : CARDIFIER_WARNING) : undefined,
                    }),
                    controls: StateSwitch({
                        checked: () => row.owned.val,
                        // The word shows only when on: "Not owned" would repeat down the list.
                        words: ["Owned", ""],
                        name: () => row.entry.val.name,
                        disabled: () => !ready.val,
                        ownStatus: true,
                        onFlip: (owned) => setOwnership(owned, [index]),
                    }),
                });
                return row.node;
            })
        );
        ready.val = true;
    };

    const load = async () => {
        if (busy.val) return;
        busy.val = true;
        ready.val = false;
        try {
            await runLoad(async () => applySnapshot(await readSnapshot()));
        } finally {
            busy.val = false;
        }
    };

    // A switch flipped while another write runs waits its turn (and reads the game again then), so it isn't lost.
    const inTurn = oneAtATime();

    // Owns (or removes) the items `indexes` names, from the letters the game holds now. Returns the save's outcome, so a
    // switch can say why it failed.
    const setOwnership = (owned, indexes, write = useWriteStatus()) =>
        inTurn(() =>
            write.run(async () => {
                busy.val = true;
                let attempted = false;
                try {
                    const snapshot = await readSnapshot();
                    applySnapshot(snapshot);
                    const targets = snapshot.catalog.filter(
                        (entry) => indexes.includes(entry.index) && snapshot.ownership.includes(entry.code) !== owned
                    );
                    if (!targets.length) return { cancelled: true };
                    const codes = new Set(targets.map((entry) => entry.code));
                    const next = owned
                        ? snapshot.ownership + targets.map((entry) => entry.code).join("")
                        : Array.from(snapshot.ownership)
                              .filter((code) => !codes.has(code))
                              .join("");
                    attempted = true;
                    await writeVerified(OWNERSHIP_PATH, next);
                    applySnapshot({ catalog: snapshot.catalog, ownership: next });
                } catch (caught) {
                    // A write that failed may have landed: the list shows what the game holds now.
                    if (attempted) await readSnapshot().then(applySnapshot, () => {});
                    throw caught;
                } finally {
                    busy.val = false;
                }
            })
        );

    // The items the tools act on: every one, or the ones the top bar's search shows.
    // `ready` follows each read, so the tray counts again once the rows are made.
    const shown = () => (ready.val, [...rows.values()]).filter((row) => row.node && shownBySearch(row.node));
    const changing = (owned) => shown().filter((row) => row.owned.val !== owned);
    const itemWord = (n) => `item${n === 1 ? "" : "s"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Event Shop",
        description: "Event Shop items, owned without spending points. Turning one off keeps what it gave.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy.val }),
        state: { loading, error },
        loadingText: "Reading the Event Shop",
        errorTitle: "Couldn't read the Event Shop",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                // Owning only adds, so it runs on one press; Remove all takes items away, so it asks first.
                tools: (_, ask) =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Own all",
                            status: bulk.status,
                            disabled: () => !ready.val || !changing(true).length,
                            onClick: (e) => {
                                e.preventDefault();
                                return setOwnership(
                                    true,
                                    changing(true).map((row) => row.entry.val.index),
                                    bulk
                                );
                            },
                        }),
                        ActionButton({
                            label: "Remove all",
                            variant: "danger",
                            status: bulk.status,
                            disabled: () => !ready.val || !changing(false).length,
                            onClick: (e) => {
                                e.preventDefault();
                                const from = e.currentTarget;
                                const asked = () => changing(false).map((row) => row.entry.val.index);
                                const askRemove = () => {
                                    const n = asked().length;
                                    return ask({
                                        question: `Remove ${n} owned ${itemWord(n)}? What they gave stays.`,
                                        confirmLabel: n === 1 ? "Remove it" : "Remove them",
                                        from,
                                        lowers: asked,
                                        again: askRemove,
                                        onConfirm: () => setOwnership(false, asked(), bulk),
                                    });
                                };
                                askRemove();
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    const owned = shown().filter((row) => row.owned.val).length;
                    return `${isSearching() ? `${n} matching ${itemWord(n)}` : `All ${n} ${itemWord(n)}`} · ${owned} owned`;
                },
            })
        ),
    });
};

export default definePage({
    id: "account.eventshop",
    world: "account",
    system: "Event Shop",
    description: "Which Event Shop items are owned.",
    keywords: ["Eventshop", "Event points"],
    component: EventShopTab,
});
