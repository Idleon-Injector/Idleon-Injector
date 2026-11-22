/**
 * W5 - Gaming › Rat King
 *
 * Data sources:
 *   gga.Gaming[14]               - King Tokens
 *   gga.GamingSprout[33][1..3]   - the King Rat's three upgrades
 *   gga.Research[11]             - the reclaimed crowns: ids like "0_" (plant 1's base form) or "3c" (plant 4's third
 *                                  mutation), plant digit then Number2Letter form, kept in that order
 *
 * The King Rat of Olde: its tokens and upgrades, then the crowns, one plant a line. A plant's name opens its ten
 * crowns in place, each with a switch; its own switch reclaims or clears all ten. Every change starts from the crowns
 * the game holds, so one reclaimed in the game since the page read it stays.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    oneAtATime,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { button, div, span } = van.tags;

const CROWNS_PATH = "Research[11]";
const FORMS = "_abcdefghi".split("");
const PLANTS = 10;
const ALL_CROWNS = Array.from({ length: PLANTS }, (_, plant) => FORMS.map((form) => `${plant}${form}`)).flat();
const UPGRADES = [
    { index: 1, name: "King Tokens per hour" },
    { index: 2, name: "Palette Luck" },
    { index: 3, name: "Crown Chance" },
];

const formName = (form) => (form === "_" ? "Base form" : `Mutation ${FORMS.indexOf(form)}`);

const RatKingTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Rat King", busy: () => bulk.status.val === "loading" });
    const tokensState = van.state(0);
    const upgradeStates = UPGRADES.map(() => van.state(0));
    const crowns = van.state(new Set());
    const openPlant = van.state(-1);
    const inTurn = oneAtATime();
    const readPending = () => loading.val || Boolean(error.val);

    const readCrowns = async () => {
        const raw = toIndexedArray((await gga(CROWNS_PATH)) ?? []);
        return new Set(raw.filter((id) => ALL_CROWNS.includes(id)));
    };
    // Changes the crowns the game holds now, and saves them in the game's order.
    const change = (edit) =>
        inTurn(async () => {
            const next = await readCrowns();
            edit(next);
            const sorted = ALL_CROWNS.filter((id) => next.has(id));
            await writeVerified(CROWNS_PATH, sorted);
            crowns.val = new Set(sorted);
        });

    const plantCrowns = (plant) => FORMS.map((form) => `${plant}${form}`);
    const countOf = (plant) => plantCrowns(plant).filter((id) => crowns.val.has(id)).length;

    const PlantRow = (plant) => {
        const name = `Plant ${plant + 1}`;
        const isOpen = () => openPlant.val === plant;
        const crownRows = FORMS.map((form) => {
            const id = `${plant}${form}`;
            return AccountToggleRow({
                info: span({ class: "account-row__name" }, formName(form)),
                words: ["Reclaimed", ""],
                name: `${name} ${formName(form)} crown`,
                checked: () => crowns.val.has(id),
                write: (on) => change((next) => (on ? next.add(id) : next.delete(id))),
            });
        });
        const row = AccountRow({
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openPlant.val = isOpen() ? -1 : plant),
                },
                span({ class: "account-row__name" }, name)
            ),
            controls: [
                span({ class: "rat-king-count" }, () => `${countOf(plant)} / ${FORMS.length}`),
                // The quick path: on reclaims all ten crowns, off clears them.
                StateSwitch({
                    checked: () => countOf(plant) === FORMS.length,
                    words: ["All", ""],
                    name: `${name} all crowns`,
                    disabled: readPending,
                    onFlip: (on) =>
                        change((next) => plantCrowns(plant).forEach((id) => (on ? next.add(id) : next.delete(id)))),
                }),
            ],
        });
        row.append(div({ class: "row-detail", hidden: () => !isOpen() }, ...crownRows));
        return row;
    };

    const plantRows = Array.from({ length: PLANTS }, (_, plant) => PlantRow(plant));
    const tokensRow = SimpleNumberRow({
        entry: { name: "King Tokens", path: "Gaming[14]", float: true },
        valueState: tokensState,
    });
    const upgradeRows = UPGRADES.map((upgrade, i) =>
        ClampedLevelRow({
            valueState: upgradeStates[i],
            writePath: `GamingSprout[33][${upgrade.index}]`,
            integerMode: "trunc",
            name: upgrade.name,
        })
    );

    const load = async () =>
        run(async () => {
            const [gaming, sprout, held] = await Promise.all([
                gga("Gaming[14]"),
                gga("GamingSprout[33]"),
                readCrowns(),
            ]);
            tokensState.val = toNum(gaming, 0);
            const levels = toIndexedArray(sprout ?? []);
            UPGRADES.forEach((upgrade, i) => (upgradeStates[i].val = toInt(levels[upgrade.index], { min: 0 })));
            crowns.val = held;
        });

    const setAll = async (claim) => {
        const result = await bulk.run(() =>
            change((next) => ALL_CROWNS.forEach((id) => (claim ? next.add(id) : next.delete(id))))
        );
        if (!result.ok && !result.cancelled) await load();
    };

    const tools = (_activeId, ask) => {
        const clearAll = ActionButton({
            label: "Clear all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !crowns.val.size,
            onClick: (e) => {
                e.preventDefault();
                const n = crowns.val.size;
                ask({
                    question: `Clear ${n} reclaimed crown${n === 1 ? "" : "s"}?`,
                    confirmLabel: n === 1 ? "Clear it" : "Clear them",
                    from: clearAll,
                    onConfirm: () => setAll(false),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Reclaim all",
                status: bulk.status,
                disabled: () => readPending() || crowns.val.size === ALL_CROWNS.length,
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(true);
                },
            }),
            clearAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Rat King",
        description: "The King Rat of Olde's tokens, upgrades and reclaimed crowns.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the Rat King",
        errorTitle: "Couldn't read the Rat King",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                tools,
                toolsLabel: () => `${crowns.val.size} of ${ALL_CROWNS.length} crowns reclaimed`,
                body: [
                    AccountSection({ title: "King Rat", body: [tokensRow, ...upgradeRows] }),
                    AccountSection({ title: "Crowns", body: plantRows }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.gaming.ratking",
    world: 5,
    system: "Gaming",
    tab: "Rat King",
    description: "King Tokens, the King Rat's upgrades and its reclaimed crowns.",
    keywords: ["King Rat of Olde", "Crowns", "Reclaimed crowns", "King Tokens"],
    component: RatKingTab,
});
