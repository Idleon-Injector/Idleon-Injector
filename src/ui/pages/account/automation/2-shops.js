/**
 * Account › Automation › Shops: which town shop items the shop automation buys. Switched-on items are bought into
 * the storage chest with chest coins whenever the shop has stock, cheapest first, until the chest holds the stop-at.
 *
 * Reads readComputed("automation", "shops") (every shop by world, with today's stock) and saves
 * cheatConfig.automation.shops, one { id: "shop:item", on, stopAt } per item.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchConfig, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationRow,
    PickRow,
    createAutomationPicks,
    readAutomations,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { renderPersistentPagePanes, renderTabNav } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const CHEAT = "automation shops";
const WORLDS = [1, 2, 3, 4, 5, 6, 7].map((world) => ({ id: world, label: `W${world}` }));

const ShopsPage = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching an item on switches Shops on too (now and at start), so buying starts at once.
    const picks = createAutomationPicks("shops", {
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return;
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
    });
    const ids = van.state([]); // every item on the page, all worlds
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const stock = new Map(); // "shop:item" -> state of today's stock
    const activeWorld = van.state(1);
    const { loading, error, run } = useAccountLoad({ label: "Shop automation" });

    const switchNode = div();
    const panes = renderPersistentPagePanes({ tabs: WORLDS, activeId: activeWorld });
    const reconcilers = panes.map(createStaticRowReconciler);

    const load = () =>
        run(async () => {
            const [shops, config] = await Promise.all([readComputed("automation", "shops"), fetchConfig()]);
            await readSwitch();
            picks.sync(config.cheatConfig.automation.shops);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));

            WORLDS.forEach(({ id: world }, i) => {
                const worldShops = shops.filter((shop) => shop.world === world);
                reconcilers[i](
                    worldShops.map((shop) => `${shop.shop}:${shop.items.map(({ item }) => item)}`).join("|"),
                    () =>
                        worldShops.map((shop) =>
                            AccountSection({
                                title: cleanName(shop.town).toUpperCase(),
                                body: div(
                                    { class: "account-item-stack" },
                                    shop.items.map(({ item, name }) => {
                                        const id = `${shop.shop}:${item}`;
                                        const left = getOrCreateState(stock, id);
                                        return PickRow({
                                            picks,
                                            id,
                                            name: cleanName(name),
                                            badge: () => `Left ${formatNumber(left.val)}`,
                                        });
                                    })
                                ),
                            })
                        )
                );
            });
            for (const shop of shops)
                for (const { item, stock: left } of shop.items)
                    getOrCreateState(stock, `${shop.shop}:${item}`).val = left;
            ids.val = shops.flatMap((shop) => shop.items.map(({ item }) => `${shop.shop}:${item}`));
        });

    // Enable all runs on one click; Disable all asks "Click again" first (#25).
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                await picks.setAll(ids.val, on);
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const switchedOn = () => ids.val.filter((id) => picks.get(id).on.val).length;

    load();

    return PersistentAccountListPage({
        title: "SHOPS",
        description:
            "Switched-on items are bought into the storage chest with chest coins whenever the shop has stock, cheapest first, and switching one on turns Shops on. Buying stops once the chest holds the stop-at amount; leave it empty for no limit. Enable all and Disable all cover every world.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    disabled: () => busy() || switchedOn() === ids.val.length,
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 shop item" : `all ${switchedOn()} shop items`}, in every world.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        subNav: renderTabNav({
            tabs: WORLDS,
            activeId: activeWorld,
            navClass: "account-page-nav",
            buttonClass: "account-page-btn",
        }),
        state: { loading, error },
        loadingText: "READING SHOPS",
        errorTitle: "SHOP READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            ...panes
        ),
    });
};

export default definePage({
    id: "account.automation.shops",
    world: "account",
    system: "Automation",
    tab: "Shops",
    description: "Town shop items bought into the chest with chest coins, by world, each up to its stop-at.",
    keywords: ["Autobuy", "Auto buy", "Vendor", "Town shop", "Stop at"],
    component: ShopsPage,
});
