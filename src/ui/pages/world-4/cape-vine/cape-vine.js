/**
 * W4 - Cape Vine
 *
 * Reverse-engineered from:
 *   gga.Spelunk[54] - cape ids on the vine, in vine order
 *   gga.Cards[1] - slab history item ids
 *   gga.OptionsListAccount[669] - Golden Vine milestones bought
 *   gga.BundlesReceived.h.ban_o - Cathie pack, adds 3 Golden Vines
 *   gga.ItemDefinitionsGET.h - item definitions map
 *
 * Golden Vines owned = 1 + OLA[669] + 3 * ban_o; the first that many vine slots are golden.
 * Eligible capes match the game's vine scan: typeGen === "aCape", lvReqToCraft !== 69420,
 * never "EquipmentCape1" (Lava Wings, the dev cape, which flags non-dev saves).
 *
 * One list like Hat Rack (Lumi's agreed design): the Golden Vines field, then every cape with an On vine switch, in
 * the game's item order so a flip never moves a row. Add all sits in the tray. Adding never touches the Slab; taking a
 * cape off also takes it off the Slab, or the game puts it back when Cathie's menu opens.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    oneAtATime,
    resolveNumberInput,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div, span } = van.tags;

const VINE_PATH = "Spelunk[54]";
const SLAB_HISTORY_PATH = "Cards[1]";
const MILESTONES_PATH = "OptionsListAccount[669]";
const PACK_PATH = "BundlesReceived.h.ban_o";
const ITEM_DEFS_PATH = "ItemDefinitionsGET.h";
const DEV_CAPE_ID = "EquipmentCape1";

const readIdList = async (path, label) => {
    const raw = await gga(path);
    if (!raw || typeof raw !== "object") throw new Error(`Couldn't read the ${label}. Enter the game and refresh.`);
    return toIndexedArray(raw)
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0);
};

const readVine = () => readIdList(VINE_PATH, "cape vine");

const readMilestones = async () => {
    const raw = await gga(MILESTONES_PATH);
    // Untouched account options read as 0, null, undefined, or "".
    const value = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`Unexpected Golden Vine milestone value: ${raw}`);
    return value;
};

// "EquipmentCape12" sorts after "EquipmentCape2": the game's own item order.
const itemNumber = (itemId) => Number(/\d+$/.exec(itemId)?.[0] ?? 0);

const CapeVineTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cape Vine" });
    const vineIds = van.state([]);
    const capes = van.state([]);
    const packVines = van.state(0);
    const goldenOwned = van.state(1);
    const bulk = useWriteStatus();
    // Changes run one at a time, each from the vine the game holds when its turn comes.
    const inTurn = oneAtATime();
    const listNode = div();
    const rowOf = new Map();

    const minGolden = () => 1 + packVines.val;
    const maxGolden = () => capes.val.length;
    const vineIndex = van.derive(() => new Map(vineIds.val.map((itemId, index) => [itemId, index]).reverse()));
    const onVine = (itemId) => vineIndex.val.has(itemId);

    // After any change the page shows the vine the game holds.
    // Each change starts from the vine the game holds, and the page shows the vine after it: what the write put there
    // at once, then what a read finds. A read that fails after a write that landed says so at the switch.
    const change = (task) =>
        inTurn(async () => {
            let outcome;
            let failed = null;
            try {
                outcome = await task(await readVine());
            } catch (caught) {
                failed = caught;
            }
            try {
                vineIds.val = await readVine();
            } catch {
                if (!failed) throw new Error("Saved, but couldn't read the vine again. Refresh.");
            }
            if (failed) throw failed;
            return outcome ?? { ok: true };
        });

    const addCapes = (itemIds) =>
        change(async (vine) => {
            const toAdd = itemIds.filter((itemId) => !vine.includes(itemId));
            if (!toAdd.length) return { cancelled: true };
            if (toAdd.some((itemId) => !rowOf.has(itemId)))
                throw new Error("Refusing to add a cape that isn't eligible.");
            // The whole list in one write, so its change log holds the old list for Undo.
            const nextVine = [...vine, ...toAdd];
            await writeVerified(VINE_PATH, nextVine);
            vineIds.val = nextVine;
        });

    // The Slab first: the game puts a cape from the Slab back on the vine when Cathie's menu opens. If the vine write
    // then fails, the cape still shows on the vine and flipping it off again finishes the job.
    const removeCape = (itemId) =>
        change(async (vine) => {
            const slab = await readIdList(SLAB_HISTORY_PATH, "Slab");
            const nextSlab = slab.filter((entry) => entry !== itemId);
            if (nextSlab.length !== slab.length) await writeVerified(SLAB_HISTORY_PATH, nextSlab);
            const nextVine = vine.filter((entry) => entry !== itemId);
            if (nextVine.length === vine.length) return;
            await writeVerified(VINE_PATH, nextVine);
            vineIds.val = nextVine;
        });

    const CapeRow = (cape) =>
        AccountRow({
            rowClass: "cape-vine-row",
            rowProps: { "data-item": cape.itemId },
            info: span({ class: "account-row__name" }, cape.name),
            badge: () => (vineIndex.val.get(cape.itemId) < goldenOwned.val ? "Golden" : ""),
            controls: StateSwitch({
                checked: () => onVine(cape.itemId),
                words: ["On vine", ""],
                name: `${cape.name} on vine`,
                ownStatus: true,
                onFlip: (on) => (on ? addCapes([cape.itemId]) : removeCape(cape.itemId)),
            }),
        });

    const load = async () =>
        run(async () => {
            const defs = await gga(ITEM_DEFS_PATH);
            if (!defs || typeof defs !== "object") throw new Error("Couldn't read the capes. Refresh.");
            const eligible = Object.entries(defs)
                .map(([itemId, raw]) => ({ itemId, def: unwrapH(raw) }))
                .filter(
                    ({ itemId, def }) =>
                        itemId !== DEV_CAPE_ID && def?.typeGen === "aCape" && Number(def?.lvReqToCraft) !== 69420
                )
                .map(({ itemId, def }) => ({
                    itemId,
                    name: cleanName(def.displayName || itemId, "", { stripMarker: true }),
                }))
                .sort((a, b) => itemNumber(a.itemId) - itemNumber(b.itemId));

            const [vine, milestones, pack] = await Promise.all([readVine(), readMilestones(), gga(PACK_PATH)]);

            // Rows are kept by cape: a cape the game adds gets a new row, and the others stay put.
            let at = listNode.firstChild;
            for (const cape of eligible) {
                if (!rowOf.has(cape.itemId)) rowOf.set(cape.itemId, CapeRow(cape));
                const row = rowOf.get(cape.itemId);
                if (row === at) at = at.nextSibling;
                else listNode.insertBefore(row, at);
            }
            capes.val = eligible;
            packVines.val = Number(pack) === 1 ? 3 : 0;
            goldenOwned.val = 1 + milestones + packVines.val;
            vineIds.val = vine;
        });

    const goldenRow = EditableNumberRow({
        valueState: goldenOwned,
        normalize: (raw) => resolveNumberInput(raw, { min: minGolden(), max: maxGolden(), strict: true }),
        write: async (next) => {
            await writeVerified(MILESTONES_PATH, next - minGolden());
            return next;
        },
        renderInfo: () => span({ class: "account-row__name" }, "Golden Vines"),
        cap: () => maxGolden() || null,
        adjustInput: (raw, delta, current) =>
            Math.max(minGolden(), Math.min(maxGolden(), resolveNumberInput(raw, { fallback: current }) + delta)),
        disabled: () => loading.val || Boolean(error.val),
        inputProps: { "aria-label": "Golden Vines" },
    });

    // The capes the tray acts on: every one, or the ones the top bar's search shows.
    const shown = () => capes.val.filter((cape) => shownBySearch(rowOf.get(cape.itemId)));
    const offVine = () => shown().filter((cape) => !onVine(cape.itemId));
    const capeWord = (n) => `cape${n === 1 ? "" : "s"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Cape Vine",
        description:
            "Capes on Cathie's vine. Taking one off also takes it off your Slab, so the game doesn't put it back.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the cape vine",
        errorTitle: "Couldn't read the cape vine",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({ title: "Vine", body: goldenRow }),
                    AccountSection({ title: "Capes", body: listNode }),
                ],
                // Adding only puts capes on, so it runs on one press.
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Add all",
                            status: bulk.status,
                            disabled: () => loading.val || Boolean(error.val) || !offVine().length,
                            onClick: (e) => {
                                e.preventDefault();
                                const ids = offVine().map((cape) => cape.itemId);
                                return bulk.run(() => addCapes(ids));
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    const on = shown().filter((cape) => onVine(cape.itemId)).length;
                    return `${isSearching() ? `${n} matching ${capeWord(n)}` : `All ${n} ${capeWord(n)}`} · ${on} on the vine`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w4.capevine",
    world: 4,
    system: "Cape Vine",
    description: "Add or remove capes on the Cape Vine.",
    keywords: ["Cathie", "Golden Vine", "Capes"],
    component: CapeVineTab,
});
