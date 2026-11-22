/**
 * W2 - Post Office Tab
 *
 * Box upgrades:
 *   PostOfficeInfo[3][i][0] -> points spent in upgrade i (the character in play's own)
 *
 * Points, the way the game adds them up while the Post Office is open: Delivery complete + Delivery streak + Bonus
 * points (OLA 347) + Bonus boxes (OLA 131) + the vials' box points (DNSM AlchVials BoxPoints), less what the boxes hold.
 * The page works the points left out itself and shows them beside the title, like the Anvil.
 *
 * One list like the Anvil's: the points, then the boxes. Max all and Reset all in the tray act on the boxes the top
 * bar's search shows; Reset asks first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AmountLeft, RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    NO_CHARACTER,
    cleanName,
    readCharacterInPlay,
    runBulkSet,
    toInt,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const PointsRow = ({ label, valueState, writePath }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => {
            const nextValue = Math.max(0, Math.round(Number(rawValue)));
            return Number.isNaN(nextValue) ? null : nextValue;
        },
        write: async (nextValue) => {
            await writeVerified(writePath, nextValue);
            return nextValue;
        },
        renderInfo: () => span({ class: "account-row__name" }, label),
        adjustInput: (rawValue, delta, currentValue) => {
            const base = Number(rawValue);
            const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
            return Math.max(0, next + delta);
        },
        inputMode: "int",
    });

const BoxRow = ({ box, getCharacter }) =>
    ClampedLevelRow({
        valueState: box.current,
        max: () => box.cap.val,
        integerMode: "round",
        write: async (nextValue) => {
            const path = `PostOfficeInfo[3][${box.index}][0]`;
            // The boxes are the character in play's own: the game writes only while that is still the one read.
            await writeVerified(path, nextValue, { character: getCharacter() });
            return nextValue;
        },
        renderInfo: () => span({ class: "account-row__name" }, () => box.name.val),
    });

const PostOfficeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Post Office" });
    const boxComplete = van.state(0);
    const boxStreak = van.state(0);
    const opt347 = van.state(0);
    const opt131 = van.state(0);
    const boxPoints = van.state(0);
    const boxCount = van.state(0);
    const boxStates = [];
    let boxDefsLoaded = false;
    let boxRowCount = -1;
    // The character the page read: its saves go to it only while it is in play, and none go before a read.
    let character;
    const getCharacter = () => {
        if (character === undefined) throw new Error(NO_CHARACTER);
        return character;
    };

    const ensureBoxStateCount = (count) => {
        while (boxStates.length < count) {
            boxStates.push({
                index: boxStates.length,
                name: van.state(""),
                cap: van.state(0),
                current: van.state(0),
                row: null,
            });
        }
    };

    // Points left follows the rows' values as they save (a row's value is set once its save is read back).
    const spentPoints = () => {
        let spent = 0;
        for (let index = 0; index < boxCount.val; index++) spent += Number(boxStates[index]?.current.val ?? 0);
        return toInt(spent, { min: 0 });
    };
    const pointsLeft = () =>
        toInt(boxComplete.val + boxStreak.val + opt347.val + opt131.val + boxPoints.val, { min: 0 }) - spentPoints();
    const bulk = useWriteStatus();
    const boxesListNode = div({ class: "account-page-pane" });

    const load = async ({ forceDefinitions = false } = {}) =>
        run(async () => {
            const loadedCharacter = await readCharacterInPlay();
            const reads = [
                gga("PostOfficeInfo[3]"),
                gga("CurrenciesOwned"),
                readGgaEntries("OptionsListAccount", ["131", "347"]),
                gga("DNSM.h.AlchVials.h.BoxPoints"),
            ];

            if (!boxDefsLoaded || forceDefinitions) {
                reads.push(readCList("PostOffUpgradeInfo"));
            }

            const [rawUpgrades, rawCurrencies, rawOpts, rawBoxPts, rawBoxDefs = null] = await Promise.all(reads);
            // Still the same character once the reads are in, so an edit saves for the one whose values it shows.
            await readCharacterInPlay(loadedCharacter);
            character = loadedCharacter;

            if (!boxDefsLoaded || forceDefinitions) {
                const boxDefs = toIndexedArray(rawBoxDefs ?? []);
                ensureBoxStateCount(boxDefs.length);
                boxCount.val = boxDefs.length;

                for (let index = 0; index < boxDefs.length; index++) {
                    const defRow = toIndexedArray(boxDefs[index] ?? []);
                    const cap = Math.floor(Number(defRow[15]));
                    const box = boxStates[index];

                    box.name.val = cleanName(defRow[0], `Box ${index + 1}`);
                    box.cap.val = Number.isFinite(cap) ? Math.max(0, cap) : 0;
                }

                boxDefsLoaded = true;
            }

            if (boxRowCount !== boxCount.val) {
                boxesListNode.replaceChildren(
                    ...boxStates.slice(0, boxCount.val).map((box) => (box.row = BoxRow({ box, getCharacter })))
                );
                boxRowCount = boxCount.val;
            }

            const upgrades = toIndexedArray(rawUpgrades ?? []);
            for (let index = 0; index < boxCount.val; index++) {
                const upgRow = toIndexedArray(upgrades[index] ?? []);
                boxStates[index].current.val = Number(upgRow[0] ?? 0);
            }

            const currencies = rawCurrencies?.h ?? rawCurrencies ?? {};
            boxComplete.val = toInt(currencies.DeliveryBoxComplete ?? 0, { min: 0 });
            boxStreak.val = toInt(currencies.DeliveryBoxStreak ?? 0, { min: 0 });
            opt347.val = toInt(rawOpts?.["347"] ?? 0, { min: 0 });
            opt131.val = toInt(rawOpts?.["131"] ?? 0, { min: 0 });
            boxPoints.val = toInt(rawBoxPts ?? 0, { min: 0 });
        });

    // The boxes the tools act on: every one, or the ones the top bar's search shows.
    const shownBoxes = () => boxStates.slice(0, boxCount.val).filter((box) => shownBySearch(box.row));
    const boxWord = (n) => `box${n === 1 ? "" : "es"}`;

    const writeBoxes = (boxes, getNextValue) =>
        bulk.run(() =>
            runBulkSet({
                character: getCharacter(),
                entries: boxes,
                getTargetValue: getNextValue,
                getValueState: (box) => box.current,
                getPath: (box) => `PostOfficeInfo[3][${box.index}][0]`,
            })
        );

    // Max all only raises, so it runs on one press; Reset takes points out of boxes, so it asks first.
    const tools = (_activeId, ask) => {
        const resetAll = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => shownBoxes().every((box) => Number(box.current.val) === 0),
            onClick: (e) => {
                e.preventDefault();
                const boxes = shownBoxes().filter((box) => Number(box.current.val) > 0);
                ask({
                    question: `Reset ${boxes.length} ${boxWord(boxes.length)} to 0?`,
                    confirmLabel: boxes.length === 1 ? "Reset it" : "Reset them",
                    from: resetAll,
                    onConfirm: () => writeBoxes(boxes, () => 0),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () => shownBoxes().every((box) => Number(box.current.val) === box.cap.val),
                onClick: (e) => {
                    e.preventDefault();
                    void writeBoxes(shownBoxes(), (box) => box.cap.val);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Post Office",
        description: "Delivery points and box upgrades. Points count only with the Post Office open.",
        total: AmountLeft({ value: pointsLeft }),
        actions: RefreshButton({
            onRefresh: () => load({ forceDefinitions: true }),
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading the post office",
        errorTitle: "Couldn't read the post office",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({
                        title: "Points",
                        body: [
                            PointsRow({
                                label: "Delivery complete",
                                valueState: boxComplete,
                                writePath: "CurrenciesOwned.h.DeliveryBoxComplete",
                            }),
                            PointsRow({
                                label: "Delivery streak",
                                valueState: boxStreak,
                                writePath: "CurrenciesOwned.h.DeliveryBoxStreak",
                            }),
                            PointsRow({
                                label: "Bonus points",
                                valueState: opt347,
                                writePath: "OptionsListAccount[347]",
                            }),
                            PointsRow({
                                label: "Bonus boxes",
                                valueState: opt131,
                                writePath: "OptionsListAccount[131]",
                            }),
                        ],
                    }),
                    AccountSection({ title: "Boxes", body: boxesListNode }),
                ],
                tools,
                toolsLabel: () => {
                    const n = shownBoxes().length;
                    return isSearching() ? `${n} matching ${boxWord(n)}` : `All ${n} ${boxWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w2.postoffice",
    world: 2,
    system: "Post Office",
    description: "Post Office box upgrades and the delivery points that pay for them.",
    keywords: ["Delivery boxes", "Points"],
    component: PostOfficeTab,
});
