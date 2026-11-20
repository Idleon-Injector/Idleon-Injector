import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const ORGANIC_LABELS_PATH = "Spelunk[50]";

const useOrganicLabels = (loading, entries) => {
    const selected = van.state([]);
    const capacity = van.state(0);
    const ready = van.state(false);
    const lastIndex = van.state(null);
    const writeError = van.state("");
    const { status, run, clearStatus } = useWriteStatus({ errorMs: 0 });
    const disabled = (entry) =>
        loading.val ||
        !ready.val ||
        status.val === "loading" ||
        (!selected.val.includes(entry.organicIndex) && entry.rawName === "NAME_MAGNI");

    const read = async () => {
        const [indices, owned] = await Promise.all([
            gga(ORGANIC_LABELS_PATH),
            readComputed("menagerie", "OrganicLabelOwned", [0, 0]),
        ]);
        if (
            !Array.isArray(indices) ||
            !indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < entries.val.length) ||
            new Set(indices).size !== indices.length ||
            !Number.isSafeInteger(owned) ||
            owned < 0
        ) {
            throw new Error("Unexpected Organic Label data or owned label count.");
        }
        selected.val = indices;
        capacity.val = owned;
    };

    const load = async () => {
        ready.val = false;
        await read();
        clearStatus();
        writeError.val = "";
        ready.val = true;
    };

    const toggle = async (entry) => {
        if (disabled(entry)) return;
        const index = entry.organicIndex;
        const wasSelected = selected.val.includes(index);
        lastIndex.val = index;
        writeError.val = "";
        await run(
            async () => {
                // Read again so edits made in the game since loading are preserved.
                await read();
                if (selected.val.includes(index) !== wasSelected) return { cancelled: true };
                const next = wasSelected
                    ? selected.val.filter((current) => current !== index)
                    : [...selected.val, index];
                await writeVerified(ORGANIC_LABELS_PATH, next);
                selected.val = next;
                try {
                    await readComputed("farming", "ExoticBonusQTY", [-1, 0]);
                } catch (error) {
                    throw new Error(`Label saved, but bonus recalculation failed: ${error.message}`);
                }
            },
            { onError: (error) => (writeError.val = error.message) }
        );
    };

    return { selected, capacity, lastIndex, status, writeError, disabled, load, toggle };
};

const OrganicLabelButton = ({ labels, entry }) => {
    const status = () => (labels.lastIndex.val === entry.organicIndex ? labels.status.val : null);
    return van.tags.span(
        { class: "farming-organic-label" },
        ActionButton({
            label: () => {
                if (status() === "loading") return "SAVING...";
                if (status() === "success") return "SAVED";
                if (status() === "error") return "FAILED";
                return "ORGANIC";
            },
            variant: "switch",
            className: "farming-organic-button",
            status,
            buttonProps: { "aria-pressed": () => labels.selected.val.includes(entry.organicIndex) },
            disabled: () => labels.disabled(entry),
            tooltip: () => {
                const base = labels.selected.val.includes(entry.organicIndex)
                    ? `${entry.name} is organic. Click to remove its label in this editor.`
                    : entry.rawName === "NAME_MAGNI"
                      ? "This placeholder upgrade cannot receive an Organic Label."
                      : `Make ${entry.name} organic: 2× bonus and 1.5× levels per purchase. Game caps still apply.`;
                return status() === "error" ? `${base} ${labels.writeError.val}` : base;
            },
            onClick: () => void labels.toggle(entry),
        }),
        van.tags.span({ class: "account-write-feedback", role: "status" }, () => {
            if (status() === "loading") return `${entry.name}: saving Organic Label.`;
            if (status() === "success") return `${entry.name}: Organic Label saved.`;
            if (status() === "error") return `${entry.name}: ${labels.writeError.val}`;
            return "";
        })
    );
};

const FARM_UPG_PATH = "FarmUpg";
const EXOTIC_OFFSET = 20;

const ExoticUpgradeRow = ({ entry, levelState, labels }) =>
    SimpleNumberRow({
        entry,
        valueState: levelState,
        renderExtraActions: () => OrganicLabelButton({ labels, entry }),
    });

const buildExoticEntries = (rawDefinitions, rawLevels) => {
    const levels = toIndexedArray(rawLevels ?? []);
    return toIndexedArray(rawDefinitions ?? []).map((rawDefinition, index) => {
        const definition = toIndexedArray(rawDefinition ?? []);
        const pathIndex = EXOTIC_OFFSET + index;
        return {
            index: pathIndex,
            pathIndex,
            organicIndex: index,
            path: `${FARM_UPG_PATH}[${pathIndex}]`,
            rawName: String(definition[0] ?? `NAME_MAGNI_${index}`).trim(),
            name: cleanName(definition[0], `NAME MAGNI ${index + 1}`),
            level: toInt(levels[pathIndex], { min: 0 }),
            badge: (currentValue) => `LV ${currentValue ?? 0}`,
            formatted: false,
        };
    });
};

const ExoticTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Farming Exotic Market" });
    const entries = van.state([]);
    const labels = useOrganicLabels(loading, entries);
    const levelStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawLevels, rawDefinitions] = await Promise.all([gga(FARM_UPG_PATH), readCList("MarketExoticInfo")]);
            entries.val = buildExoticEntries(rawDefinitions, rawLevels);
            await labels.load();
            reconcileRows(entries.val.map((entry) => entry.rawName).join("|"), () =>
                entries.val.map((entry) =>
                    ExoticUpgradeRow({
                        entry,
                        labels,
                        levelState: getOrCreateState(levelStates, entry.pathIndex),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(levelStates, entry.pathIndex).val = entry.level;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "EXOTIC MARKET UPGRADES",
            note: () => `${labels.selected.val.length} ORGANIC LABELS APPLIED · ${labels.capacity.val} OWNED IN GAME`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "EXOTIC",
        description:
            "Set Exotic Market levels and toggle Organic Labels for 2× bonuses and 1.5× purchase levels. Labels are permanent in game; this editor can add or remove them without limits.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val || labels.status.val === "loading",
        }),
        state: { loading, error },
        loadingText: "READING EXOTIC MARKET",
        errorTitle: "EXOTIC MARKET READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w6.farming.exotic",
    world: 6,
    system: "Farming",
    tab: "Exotic",
    description: "Exotic Market levels and Organic Labels.",
    keywords: ["Exotic Market", "Organic Labels"],
    component: ExoticTab,
});
