import { definePage } from "../../../menu/menuModel.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import van from "../../../vendor/van-1.6.0.js";
import { readCList } from "../../../services/api.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { createAutomationSetting, SettingRow, useAutomationTab } from "../../../components/views/account/automation.js";

const { div, span } = van.tags;
const TOGGLES = [
    [
        "AutoHarvest",
        "Harvest a full garden",
        "Harvest when every unlocked plot has a plant, without waiting for evolution.",
    ],
    ["AutoDig", "Dig whenever available", "Native dig batches may overlap. Already queued digs finish after stopping."],
    ["AutoBuy", "Continuously buy upgrades", "Spend actual bits on the cheapest affordable selected upgrade."],
    [
        "HideEffects",
        "Hide Gaming effects",
        "Hide harvest text, particles and nugget effects. Rewards and timing stay unchanged.",
    ],
    [
        "NuggetBiasEnabled",
        "Bias nugget rolls",
        "Requires this switch on. Biases dig results toward larger nuggets without raising the game’s maximum roll.",
    ],
    ["FertilizerValue", "Fertilizer: bit value", "Increase base sprout value."],
    [
        "FertilizerSpeed",
        "Fertilizer: growth speed",
        "Keep upgrading unless the growth threshold below has been reached.",
    ],
    ["FertilizerCapacity", "Fertilizer: plant capacity", "Stop buying this upgrade once capacity reaches 24."],
    ["Mutation", "Mutation chance", "Buy the mutation-chance upgrade when unlocked."],
];
const NUMBERS = [
    [
        "GrowthStopSeconds",
        "Growth speed threshold",
        "Seconds",
        3600000,
        "float",
        "Stop buying speed at this effective sprout time; 0 disables the limit.",
    ],
    [
        "PurchaseBatch",
        "Purchases per tick",
        "Purchases",
        500,
        "int",
        "Up to this many purchases every 100ms, within an 8ms work budget. 0 pauses buying.",
    ],
    [
        "NuggetBias",
        "Nugget bias strength",
        "Strength",
        20,
        "int",
        "Only works with Bias nugget rolls on. Choose 1–20: 1 = normal results, 3 = moderate bias, 6 = stronger bias. Higher settings make large nuggets more likely; they do not multiply nugget power or guarantee the maximum. Possible sizes still depend on the game’s bonuses, including Shovel level and Metal Detector.",
    ],
];
const IMPORTS = [0, 1, 2, 3, 4, 5, 7, 8];

const GamingAutomation = () => {
    const settings = new Map();
    const names = new Map(IMPORTS.map((id) => [id, van.state(`Import ${id}`)]));
    const get = (suffix) => {
        if (!settings.has(suffix))
            settings.set(
                suffix,
                createAutomationSetting(`gaming${suffix}`, {
                    afterSave: () => tab.afterSave(),
                })
            );
        return settings.get(suffix);
    };
    const tab = useAutomationTab({
        label: "Gaming automation",
        cheats: ["automation gaming"],
        read: async (held) => {
            for (const [suffix, setting] of settings) setting.sync(held[`gaming${suffix}`]);
            const lists = await readCList("RandoListo2");
            for (const id of IMPORTS) names.get(id).val = String(lists[1][id]).replace(/_/g, " ");
        },
    });
    const toggle = (suffix, name, detail) => {
        const setting = get(suffix);
        const field = setting.get();
        return AccountToggleRow({
            words: ["On", "Off"],
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, name),
                div({ class: "automation-pick__detail" }, detail)
            ),
            name,
            checked: () => Boolean(field.value.val),
            write: (next) => setting.set(null, next, tab.waiting.onLate),
        });
    };
    const numberRows = NUMBERS.map(([suffix, name, title, max, mode, detail]) => {
        const setting = get(suffix);
        const bounded =
            suffix !== "NuggetBias"
                ? setting
                : {
                      ...setting,
                      set: (index, value) => {
                          if (value < 1) return Promise.reject(new Error("Nugget bias must be 1 to 20."));
                          return setting.set(index, value);
                      },
                  };
        return SettingRow({ setting: bounded, name, title, max, mode, detail });
    });
    const content = div(
        { class: "account-list" },
        AccountSection({
            title: "Auto Gaming",
            note: "Open Gaming in the game for harvesting and digging.",
            body: tab.switches,
        }),
        AccountSection({ title: "Actions and effects", body: TOGGLES.slice(0, 5).map((row) => toggle(...row)) }),
        AccountSection({ title: "Upgrade selection", body: TOGGLES.slice(5).map((row) => toggle(...row)) }),
        AccountSection({
            title: "Imports",
            note: "POING is excluded.",
            body: IMPORTS.map((id) =>
                toggle(
                    `Import${id}`,
                    () => names.get(id).val,
                    "Buy levels while this import is unlocked and affordable."
                )
            ),
        }),
        AccountSection({ title: "Limits", body: numberRows })
    );
    tab.load();
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container automation-page",
        title: "Gaming",
        description: "Harvest, dig and buy selected upgrades with bits.",
        actions: RefreshButton({ onRefresh: tab.load, disabled: () => tab.loading.val }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "Reading Gaming automation",
        errorTitle: "Couldn't read Gaming automation",
        initialWrapperClass: "account-list",
        body: content,
    });
};

export default definePage({
    id: "automation.gaming",
    world: "automation",
    system: "Gaming",
    description: "Harvesting, digging and Gaming upgrades.",
    keywords: ["Auto Gaming", "Harvest", "Nuggets", "Animations", "Tools"],
    component: GamingAutomation,
});
