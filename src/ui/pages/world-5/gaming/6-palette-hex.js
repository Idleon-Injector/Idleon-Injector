import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { getNumberInputLiveRaw, NumberInput, setNumberInputValue } from "../../../components/NumberInput.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    resolveNumberInput,
    joinClasses,
    toInt,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass } from "../../../components/views/account/autoSave.js";
import { useNumericEditor } from "../../../components/views/account/useNumericEditor.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { PaletteStarButton, usePaletteStars } from "./5-palette.js";

const { div } = van.tags;

const PALETTE_LEVELS_PATH = "Spelunk[9]";
const PALETTE_ROW_SIZES = [7, 8, 7, 8, 7];

const getTextColor = ([red, green, blue]) => {
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.58 ? "#05080d" : "#f7f8fb";
};

const buildPaletteEntries = (rawLevels, rawPalette) => {
    const levels = toIndexedArray(rawLevels ?? []);
    return toIndexedArray(rawPalette ?? []).map((rawDefinition, index) => {
        const definition = toIndexedArray(rawDefinition ?? []);
        return {
            index,
            name: cleanName(definition[3], `Palette ${index + 1}`),
            rgb: [toInt(definition[0], { min: 0 }), toInt(definition[1], { min: 0 }), toInt(definition[2], { min: 0 })],
            level: toInt(levels[index], { min: 0 }),
        };
    });
};

const sliceRows = (entries) => {
    let offset = 0;
    return PALETTE_ROW_SIZES.map((size) => {
        const row = entries.slice(offset, offset + size);
        offset += size;
        return row;
    });
};

const PaletteHex = ({ entry, levelState, stars }) => {
    const { inputValue, status, reason, undo, handlers, focus, blur } = useNumericEditor({
        valueState: levelState,
        normalize: (raw) => resolveNumberInput(raw, { min: 0, fallback: null, strict: true }),
        write: (nextLevel) => writeVerified(`${PALETTE_LEVELS_PATH}[${entry.index}]`, nextLevel),
        format: (value) => String(value ?? 0),
    });
    const step = (delta) => () => {
        const current = Number(getNumberInputLiveRaw(inputValue) ?? inputValue.val) || 0;
        setNumberInputValue(inputValue, String(Math.max(0, current + delta)));
    };

    return div(
        {
            class: () => joinClasses("gaming-palette-hex", saveStateClass(status.val, undo)),
            role: "group",
            "aria-label": entry.name,
            style: `--hex-bg: rgb(${entry.rgb.join(", ")}); --hex-fg: ${getTextColor(entry.rgb)};`,
            title: `${entry.name} (${entry.rgb.join(", ")})`,
            ...handlers,
        },
        div(
            { class: "gaming-palette-hex__editor" },
            NumberInput({
                value: inputValue,
                onfocus: focus,
                onblur: blur,
                onDecrement: step(-1),
                onIncrement: step(1),
            }),
            div(
                { class: "gaming-palette-hex__actions" },
                SaveState({ status, reason, undo, className: "save-state--inline" }),
                PaletteStarButton({ stars, entry })
            )
        )
    );
};

const PaletteHexTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Gaming Palette Hex" });
    const stars = usePaletteStars(loading);
    const entries = van.state([]);
    const levelStates = new Map();
    const gridNode = div({ class: "gaming-palette-hex-grid" });
    const reconcileGrid = createStaticRowReconciler(gridNode);

    const load = async () =>
        run(async () => {
            const [rawLevels, rawPalette] = await Promise.all([
                gga(PALETTE_LEVELS_PATH),
                readCList("GamingPalette"),
                stars.load(),
            ]);
            entries.val = buildPaletteEntries(rawLevels, rawPalette);
            reconcileGrid(entries.val.map((entry) => `${entry.index}:${entry.name}`).join("|"), () =>
                sliceRows(entries.val).map((row) =>
                    div(
                        { class: "gaming-palette-hex-row" },
                        ...row.map((entry) =>
                            PaletteHex({
                                entry,
                                levelState: getOrCreateState(levelStates, entry.index),
                                stars,
                            })
                        )
                    )
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(levelStates, entry.index).val = entry.level;
            }
        });

    load();

    const body = div({ class: "scrollable-panel gaming-palette-hex-panel" }, gridNode);

    return PersistentAccountListPage({
        title: "Palette Hex",
        description:
            "Edit Gaming Palette levels and Black Stars in the in-game hex layout. Order follows GamingPalette rows.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val || stars.status.val === "loading",
        }),
        state: { loading, error },
        loadingText: "Reading gaming Palette Hex",
        errorTitle: "Gaming Palette Hex read failed",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w5.gaming.palettehex",
    world: 5,
    system: "Gaming",
    tab: "Palette Hex",
    description: "Gaming Palette levels and Black Stars, laid out like the game's hexes.",
    keywords: ["Black Stars"],
    component: PaletteHexTab,
});
