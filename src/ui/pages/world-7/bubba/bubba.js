import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formattedStep } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    largeParser,
    resolveNumberInput,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const NO_FREE_LEVELS = new Set([3, 8, 9, 10, 12, 14, 15, 16]);
const PERMANENT = new Set([3, 8, 9]);

const createBubbaSections = (upgrades, traits, gifts, smokeBonuses) => {
    if (
        upgrades.length !== 28 ||
        traits.length !== 6 ||
        gifts.length !== 6 ||
        smokeBonuses.length !== 5 ||
        upgrades.some((entry) => !entry[0] || !Number.isFinite(Number(entry[4])) || Number(entry[4]) < 0)
    ) {
        throw new Error("Unsupported Bubba definitions");
    }

    const field = (group, index, name, options = {}) => ({
        path: `Bubba[${group}][${index}]`,
        group,
        index,
        name,
        min: 0,
        max: Infinity,
        ...options,
    });
    const names = (values) =>
        values.map((name, index) => `${index + 1}: ${String(name).replace(/_/g, " ")}`).join(", ");
    const upgradeFields = (free) =>
        upgrades.map((entry, index) => {
            // The native purchase guard treats the metadata value 999 as unlimited.
            const max = free
                ? NO_FREE_LEVELS.has(index)
                    ? 0
                    : Infinity
                : Number(entry[4]) === 999
                  ? Infinity
                  : Number(entry[4]);
            return field(free ? 2 : 1, index, String(entry[0]).replace(/_/g, " "), {
                max,
                subLabel:
                    [
                        free && max === 0 ? "Does not receive free levels" : null,
                        !free && PERMANENT.has(index)
                            ? "Permanent progression. Setting this value does not reset the run."
                            : null,
                        Number.isFinite(max) && max > 0 ? `Maximum ${max}` : null,
                    ]
                        .filter(Boolean)
                        .join(" ") || null,
            });
        });

    return [
        {
            title: "RESOURCES & PROGRESS",
            fields: [
                field(0, 0, "Meat Slices", { formatted: true, float: true }),
                field(0, 1, "Happiness", { formatted: true, float: true }),
                field(0, 4, "Meat produced this run", { formatted: true, float: true }),
                field(0, 5, "Pats used this hour", { min: -50, subLabel: "Can be -50 after a Megaflesh milestone." }),
            ],
        },
        { title: "PURCHASED UPGRADES", fields: upgradeFields(false) },
        { title: "FREE UPGRADE LEVELS", fields: upgradeFields(true) },
        {
            title: "CHARISMA",
            note: "Unlocked by the Charisma upgrade. Emulsification requires 6 Megaflesh.",
            fields: [
                ...traits.map((name, index) =>
                    field(3, index, String(name).replace(/_/g, " "), { max: 120, subLabel: "Maximum 120" })
                ),
                field(0, 6, "Selected attribute", { max: 6, subLabel: `0: None, ${names(traits)}` }),
                field(0, 15, "Emulsified attribute", { max: 6, subLabel: `0: None, ${names(traits)}` }),
                field(0, 8, "Charisma progress", { formatted: true, float: true }),
            ],
        },
        {
            title: "GIFTS",
            note: "Fun Gifts unlocks gift choices. The second slot requires 3 Megaflesh.",
            fields: [2, 3].map((index) =>
                field(0, index, `Gift ${index - 1}`, { max: 6, subLabel: `0: None, ${names(gifts)}` })
            ),
        },
        {
            title: "DICE",
            note: "Unlocked by Dice Roll. More Dice and More Sides increase the available rolls.",
            fields: Array.from({ length: 8 }, (_, index) =>
                field(4, index, `Die ${index + 1}`, { max: 20, subLabel: "0: Inactive. Maximum roll 20." })
            ),
        },
        {
            title: "SMOKED MEAT",
            note: "Unlocked by Smoker.",
            fields: [
                ...smokeBonuses.map((bonus, index) =>
                    field(5, index, `Smoked Meat ${index + 1}`, { formatted: true, subLabel: `+${bonus}% per meat` })
                ),
                field(0, 14, "Smoker age (seconds)", { formatted: true, float: true }),
            ],
        },
        {
            title: "SPARE COINS",
            note: "Unlocked by Spare Coins.",
            fields: ["Pennies", "Nickels", "Quarters", "Dollars"].map((name, index) =>
                field(0, index + 9, name, { formatted: true })
            ),
        },
    ];
};

const BubbaTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Bubba" });
    const writeError = van.state("");
    const states = new Map();
    const body = div({ class: "account-list" });
    const reconcile = createStaticRowReconciler(body);
    let writes = Promise.resolve();

    const row = (field) => {
        const valueState = getOrCreateState(states, field.path, undefined);
        const normalize = (raw) => {
            const value = resolveNumberInput(raw, {
                formatted: field.formatted,
                float: field.float,
                min: field.min,
                max: field.max,
            });
            return Number.isFinite(value) ? value : null;
        };
        return EditableNumberRow({
            valueState,
            normalize,
            disabled: () => loading.val || Boolean(error.val),
            write: (value) => {
                const task = writes.then(async () => {
                    writeError.val = "";
                    let saved = false;
                    try {
                        if (field.group === 0 && (field.index === 2 || field.index === 3) && value !== 0) {
                            const other = await gga(`Bubba[0][${field.index === 2 ? 3 : 2}]`);
                            if (Number(other) === value) throw new Error("Choose different gifts for the two slots.");
                        }
                        await writeVerified(field.path, value);
                        saved = true;
                        valueState.val = value;
                        if (field.group === 1 || field.group === 2) {
                            // TotalQTYofLVs otherwise keeps returning the old cached upgrade sum.
                            await deleteGga("DNSM.h.Bubba_LVzAll");
                        }
                        return value;
                    } catch (caught) {
                        writeError.val = saved
                            ? `${field.name} was saved, but its cached total could not be refreshed. ${caught.message}`
                            : `${field.name}: ${caught.message}`;
                        throw caught;
                    }
                });
                writes = task.catch(() => {});
                return task;
            },
            renderInfo: () => [
                span({ class: "account-row__name" }, field.name),
                field.subLabel ? span({ class: "account-row__sub-label" }, field.subLabel) : null,
            ],
            inputMode: field.float ? "float" : "int",
            inputProps: {
                "aria-label": field.group === 2 ? `${field.name} free levels` : field.name,
                ...(field.formatted ? { formatter: largeFormatter, parser: largeParser } : {}),
            },
            adjustInput: (raw, delta) => {
                const value = normalize(raw) ?? 0;
                const step = field.formatted ? formattedStep(value) : field.float ? 0.1 : 1;
                return Math.max(field.min, Math.min(field.max, value + delta * step));
            },
            controlsClass: "account-row__controls--xl",
        });
    };

    const load = () =>
        run(async () => {
            await writes;
            const [raw, rawUpgrades, rawTraits, rawGifts, rawSmoke] = await Promise.all([
                gga("Bubba"),
                readCList("BubbaUpg"),
                readCList("Spelunky[36]"),
                readCList("Spelunky[39]"),
                readCList("Spelunky[34]"),
                // Undo puts upgrade levels back and reruns this load: the game's cached sum must go with them.
                deleteGga("DNSM.h.Bubba_LVzAll"),
            ]);
            const data = toIndexedArray(raw).map(toIndexedArray);
            const lengths = [20, 28, 28, 6, 8, 5];
            if (data.length !== lengths.length || data.some((values, index) => values.length !== lengths[index])) {
                throw new Error("Unsupported Bubba save data");
            }
            const sections = createBubbaSections(
                toIndexedArray(rawUpgrades).map(toIndexedArray),
                toIndexedArray(rawTraits),
                toIndexedArray(rawGifts),
                toIndexedArray(rawSmoke)
            );
            for (const field of sections.flatMap((section) => section.fields)) {
                const value = Number(data[field.group][field.index]);
                if (!Number.isFinite(value)) throw new Error(`Invalid saved value for ${field.name}`);
                getOrCreateState(states, field.path).val = value;
            }
            reconcile(JSON.stringify(sections), () =>
                sections.map((section) =>
                    AccountSection({
                        title: section.title,
                        note: section.note,
                        body: section.fields.map(row),
                    })
                )
            );
        });

    load();
    return PersistentAccountListPage({
        title: "BUBBA",
        description: "Set Bubba resources, upgrades, and progress.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        topNotices: div(
            WarningBanner(
                "Setting values does not purchase upgrades or reset the run. Reopen Bubba in game to refresh its display."
            ),
            div({ role: "alert" }, () => writeError.val)
        ),
        state: { loading, error },
        loadingText: "READING BUBBA",
        errorTitle: "BUBBA READ FAILED",
        body,
    });
};

export default definePage({
    id: "w7.bubba",
    world: 7,
    system: "Bubba",
    description: "Bubba resources, upgrades, charisma, gifts, dice and smoked meat.",
    keywords: ["Clicker"],
    component: BubbaTab,
});
