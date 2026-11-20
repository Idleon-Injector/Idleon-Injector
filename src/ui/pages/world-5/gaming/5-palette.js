import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const PALETTE_STARS_PATH = "Spelunk[49]";

export const usePaletteStars = (loading) => {
    const values = van.state([]);
    const lastIndex = van.state(null);
    const writeError = van.state("");
    const { status, run, clearStatus } = useWriteStatus({ errorMs: 0 });
    const disabled = () => loading.val || status.val === "loading" || values.val.length !== 37;

    const load = async () => {
        const rawStars = await gga(PALETTE_STARS_PATH);
        const stars = toIndexedArray(rawStars);
        if (stars.length !== 37 || !stars.every((value) => Number.isInteger(value) && value >= 0 && value <= 2)) {
            throw new Error("Expected 37 Black Star counts between 0 and 2 in Spelunk[49].");
        }
        values.val = stars;
        clearStatus();
        writeError.val = "";
    };

    const set = async (index, value) => {
        if (disabled()) return;
        lastIndex.val = index;
        await run(
            async () => {
                if (values.val[index] === value) return { cancelled: true };
                writeError.val = "";
                await writeVerified(`${PALETTE_STARS_PATH}[${index}]`, value);
                values.val = values.val.map((current, i) => (i === index ? value : current));
                // PaletteBonus reuses this cache until it is deleted or rebuilt by the game.
                await deleteGga("DNSM.h.PaletteBonz");
            },
            {
                onError: (error) => {
                    writeError.val = error.message;
                },
            }
        );
    };

    return { values, lastIndex, status, writeError, disabled, load, set };
};

export const PaletteStarButton = ({ stars, entry }) =>
    ActionButton({
        label: () => {
            const count = stars.values.val[entry.index] ?? 0;
            if (stars.lastIndex.val === entry.index && stars.status.val === "loading") return "SAVING...";
            if (stars.lastIndex.val === entry.index && stars.status.val === "success") return "SAVED";
            if (stars.lastIndex.val === entry.index && stars.status.val === "error") return "FAILED";
            return `${count} ★ · ${[1, 2, 4][count]}×`;
        },
        variant: "switch-filled",
        className: "gaming-palette-star-button",
        status: () => (stars.lastIndex.val === entry.index ? stars.status.val : null),
        disabled: stars.disabled,
        tooltip: () => {
            const base = `${entry.name}: Black Stars. Click to cycle 0 → 1 → 2 → 0.`;
            return stars.lastIndex.val === entry.index && stars.status.val === "error"
                ? `${base} Save failed: ${stars.writeError.val}`
                : base;
        },
        onClick: () => void stars.set(entry.index, (stars.values.val[entry.index] + 1) % 3),
    });

const PALETTE_LEVELS_PATH = "Spelunk[9]";

const formatPaletteEffect = (rawEffect) => {
    const effect = String(rawEffect ?? "").trim();
    if (!effect) return "";
    return effect.replace(/}x/gi, "X×").replace(/[{}#]/g, "X").replace(/_/g, " ");
};

const PaletteRow = ({ entry, levelState, stars }) =>
    SimpleNumberRow({
        entry,
        valueState: levelState,
        renderExtraActions: () => PaletteStarButton({ stars, entry }),
    });

const buildPaletteEntries = (rawLevels, rawPalette) => {
    const levels = toIndexedArray(rawLevels ?? []);
    return toIndexedArray(rawPalette ?? []).map((rawDefinition, index) => {
        const definition = toIndexedArray(rawDefinition ?? []);
        const rgb = [
            toInt(definition[0], { min: 0 }),
            toInt(definition[1], { min: 0 }),
            toInt(definition[2], { min: 0 }),
        ];

        return {
            index,
            path: `${PALETTE_LEVELS_PATH}[${index}]`,
            rawName: String(definition[3] ?? `Palette_${index}`).trim(),
            name: cleanName(definition[3], `Palette ${index + 1}`),
            subLabel: formatPaletteEffect(definition[10]),
            rowClass: "account-row--wide-controls gaming-palette-row",
            rgb,
            leading: () =>
                span({
                    class: "gaming-palette-swatch",
                    style: `--palette-color: rgb(${rgb.join(", ")});`,
                    title: rgb.join(", "),
                }),
            formatted: false,
            level: toInt(levels[index], { min: 0 }),
        };
    });
};

const PaletteTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Gaming Palette" });
    const stars = usePaletteStars(loading);
    const entries = van.state([]);
    const levelStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawLevels, rawPalette] = await Promise.all([
                gga(PALETTE_LEVELS_PATH),
                readCList("GamingPalette"),
                stars.load(),
            ]);
            entries.val = buildPaletteEntries(rawLevels, rawPalette);
            reconcileRows(entries.val.map((entry) => entry.rawName).join("|"), () =>
                entries.val.map((entry) =>
                    PaletteRow({
                        entry,
                        levelState: getOrCreateState(levelStates, entry.index),
                        stars,
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(levelStates, entry.index).val = entry.level;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "PALETTE",
            note: () => `${entries.val.length} COLORS · LEVELS & BLACK STARS`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "PALETTE",
        description: "Edit Gaming Palette levels and Black Stars. Names and colors come from GamingPalette.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val || stars.status.val === "loading",
        }),
        state: { loading, error },
        loadingText: "READING GAMING PALETTE",
        errorTitle: "GAMING PALETTE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w5.gaming.palette",
    world: 5,
    system: "Gaming",
    tab: "Palette",
    description: "Gaming Palette levels and Black Stars, as a list.",
    keywords: ["Black Stars"],
    component: PaletteTab,
});
