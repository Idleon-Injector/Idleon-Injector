/**
 * W5 - Gaming › Palette
 *
 * Data sources:
 *   gga.Spelunk[9][n]          - colour n's level
 *   gga.Spelunk[49][n]         - colour n's Black Stars (0, 1 or 2; each doubles its bonus)
 *   cList.GamingPalette[n][3]  - the colour's name; [10] its bonus in the game's words ("#" marks its number too)
 *
 * One list in the game's order, each colour's bonus first, then its level and its Black Stars as a step picker that
 * saves on a pick. The game keeps the palette's bonuses in DNSM.h.PaletteBonz until it is rebuilt, so a star saved
 * here clears it (the game builds it again).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    toInt,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, useAutoSave } from "../../../components/views/account/autoSave.js";

const { div, span } = van.tags;

const LEVELS_PATH = "Spelunk[9]";
const STARS_PATH = "Spelunk[49]";
const STARS = [
    { value: 0, label: "None" },
    { value: 1, label: "★" },
    { value: 2, label: "★★" },
];

// Black Stars: a step picker that saves on a pick, like a sigil's tier.
const StarPicker = ({ index, name, starState }) => {
    const picked = van.state(starState.val);
    const path = `${STARS_PATH}[${index}]`;
    const { status, reason, save, undo } = useAutoSave({
        capture: () => picked.val,
        prepare: (stars = picked.val) => {
            if (stars === starState.val) return { unchanged: true };
            return {
                write: async () => {
                    try {
                        await writeVerified(path, stars);
                    } catch (saveError) {
                        starState.val = toInt(await gga(path).catch(() => starState.val), { min: 0 });
                        if (picked.val === stars) picked.val = starState.val;
                        throw saveError;
                    }
                    starState.val = stars;
                    await deleteGga("DNSM.h.PaletteBonz");
                },
            };
        },
        revert: () => (picked.val = starState.val),
    });
    van.derive(() => (picked.val = starState.val));
    return span(
        { class: "palette-stars" },
        SaveState({ status, reason, undo }),
        StepPicker({
            name: `${name} Black Stars`,
            steps: STARS,
            picked: () => picked.val,
            onPick: (stars) => {
                picked.val = stars;
                void save();
            },
        })
    );
};

const PaletteTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Palette" });
    const getLevelState = createIndexedStateGetter(0);
    const getStarState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawLevels, rawStars, rawDefs] = await Promise.all([
                gga(LEVELS_PATH),
                gga(STARS_PATH),
                readCList("GamingPalette"),
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const stars = toIndexedArray(rawStars ?? []);
            const colours = toIndexedArray(rawDefs ?? []).map((raw, index) => {
                const def = toIndexedArray(raw ?? []);
                return {
                    index,
                    name: cleanName(def[3], `Colour ${index + 1}`),
                    bonus: bonusText(String(def[10] ?? "").replace(/#/g, "{")),
                };
            });
            reconcileRows(colours.map((colour) => colour.name).join("|"), () =>
                colours.map((colour) =>
                    ClampedLevelRow({
                        valueState: getLevelState(colour.index),
                        writePath: `${LEVELS_PATH}[${colour.index}]`,
                        integerMode: "trunc",
                        name: colour.name,
                        renderInfo: () => RowTitles({ bonus: colour.bonus, name: colour.name }),
                        renderExtraActions: () =>
                            StarPicker({
                                index: colour.index,
                                name: colour.name,
                                starState: getStarState(colour.index),
                            }),
                    })
                )
            );
            colours.forEach((colour) => {
                getLevelState(colour.index).val = toInt(levels[colour.index], { min: 0 });
                getStarState(colour.index).val = Math.min(2, toInt(stars[colour.index], { min: 0 }));
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container gaming-palette-tab",
        title: "Palette",
        description: "Each colour's level and Black Stars.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the palette",
        errorTitle: "Couldn't read the palette",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({ className: "field-columns", body: listNode })
        ),
    });
};

export default definePage({
    id: "w5.gaming.palette",
    world: 5,
    system: "Gaming",
    tab: "Palette",
    description: "Palette colour levels and Black Stars.",
    keywords: ["Black Stars", "Colours", "Colors", "Palette Hex"],
    component: PaletteTab,
});
