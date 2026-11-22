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
import { Said } from "../../../components/inPlace.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationRow,
    PickRow,
    automationColumns,
    createAutomationPicks,
    inTurn,
    readAutomations,
    showAutomation,
    usePicksBulk,
    useStillWaiting,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";

const { div } = van.tags;

const CHEAT = "automation shops";
const WORLDS = [1, 2, 3, 4, 5, 6, 7].map((world) => ({ id: world, label: `W${world}` }));
const COLUMNS = automationColumns({ values: ["In stock"] });

const ShopsPage = () => {
    const automation = van.state(null);
    const findShops = async () => (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    // The page's line says when a read or a bulk switch is still waiting for the game: a wait isn't a failure.
    const waiting = useStillWaiting();
    // Queued like everything else, so it reads what the steps before it did.
    // It reads the startup cheats too: an item switched on puts Shops in them, and Enable all asks whether it is.
    const readSwitch = () =>
        inTurn(async () => {
            const [found, config] = await Promise.all([findShops(), fetchConfig()]);
            showAutomation(automation, found);
            atStart.val = (config.startupCheats ?? []).includes(CHEAT);
        }, waiting.onLate);
    // Switching an item on switches Shops on too (now and at start), in the item's own save step, so buying starts
    // at once; that step reads the tab's own switch back.
    const picks = createAutomationPicks("shops", { cheat: CHEAT, entry: automation });
    const ids = van.state([]); // every item on the page, all worlds
    const worldOf = new Map(); // "shop:item" -> its world
    const atStart = van.state(false); // Shops is in the startup cheats, as the last read found
    const stock = new Map(); // "shop:item" -> state of today's stock
    const activeWorld = van.state(1);
    const { loading, error, run } = useAccountLoad({ label: "Shop automation" });

    // A tab per world on one list; each tab shows Shops' own switch first.
    const switchNodes = WORLDS.map(() => div());
    const worldLists = WORLDS.map(() => div());
    const reconcilers = worldLists.map(createStaticRowReconciler);

    // A step: it reads after every save and switch asked for before it.
    const load = () =>
        run(() =>
            inTurn(async () => {
                const [shops, config, found] = await Promise.all([
                    readComputed("automation", "shops"),
                    fetchConfig(),
                    findShops(),
                ]);
                showAutomation(automation, found);
                picks.sync(config.cheatConfig.automation.shops); // edits queued after this read still show
                atStart.val = (config.startupCheats ?? []).includes(CHEAT);
                if (!switchNodes[0].firstChild && automation.val)
                    for (const node of switchNodes)
                        node.append(AutomationRow({ entry: automation, onSwitched: readSwitch, column: COLUMNS.on }));

                WORLDS.forEach(({ id: world }, i) => {
                    const worldShops = shops.filter((shop) => shop.world === world);
                    reconcilers[i](
                        worldShops.map((shop) => `${shop.shop}:${shop.items.map(({ item }) => item)}`).join("|"),
                        () =>
                            worldShops.map((shop) =>
                                AccountSection({
                                    title: cleanName(shop.town),
                                    body: shop.items.map(({ item, name }) => {
                                        const id = `${shop.shop}:${item}`;
                                        const left = getOrCreateState(stock, id);
                                        return PickRow({
                                            picks,
                                            id,
                                            name: cleanName(name),
                                            values: [
                                                { name: "In stock", quiet: true, text: () => formatNumber(left.val) },
                                            ],
                                        });
                                    }),
                                })
                            )
                    );
                });
                for (const shop of shops)
                    for (const { item, stock: left } of shop.items)
                        getOrCreateState(stock, `${shop.shop}:${item}`).val = left;
                for (const shop of shops)
                    for (const { item } of shop.items) worldOf.set(`${shop.shop}:${item}`, shop.world);
                ids.val = shops.flatMap((shop) => shop.items.map(({ item }) => `${shop.shop}:${item}`));
                error.val = null; // this read, the newest to run, worked: an older one's failure goes
            }, waiting.onLate)
        );

    // Enable all and Disable all cover the open world's items, as the tray's line says (Lumi's pick, like every other
    // page's tools); Disable all asks in the tray first.
    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val.filter((id) => worldOf.get(id) === activeWorld.val)]],
        // With every item on it still has work while Shops is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && atStart.val,
        words: () => [`shop item in W${activeWorld.val}`, `shop items in W${activeWorld.val}`],
        waiting,
        loading: () => loading.val,
        // Whatever happened, so Enable all knows whether it still has work.
        afterAll: readSwitch,
    });
    const busy = () => loading.val || bulk.busy();

    load();

    return AutomationPage({
        title: "Shops",
        description: "Buys switched-on items into the chest whenever the shop has them.",
        tabs: WORLDS.map(({ id, label }, i) => ({
            id,
            label,
            columns: COLUMNS,
            bulk,
            body: [AccountSection({ title: "Settings", body: switchNodes[i] }), COLUMNS.head("Item"), worldLists[i]],
        })),
        activeId: activeWorld,
        // Above the list, so it shows during the first load too.
        notices: Said({ said: waiting.over(bulk.said), className: "said--line" }),
        state: { loading, error },
        load,
        busy,
        what: "the shops",
    });
};

export default definePage({
    id: "account.automation.shops",
    world: "account",
    system: "Automation",
    tab: "Shops",
    description: "Town shop items bought into the chest with chest coins, by world, each up to its stop-at.",
    keywords: ["Autobuy", "Auto buy", "Vendor", "Town shop", "Stop at", "Automation"],
    component: ShopsPage,
});
