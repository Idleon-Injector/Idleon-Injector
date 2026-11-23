/**
 * W5 - Slab
 *
 * Data sources:
 *   gga.Cards[1]        - the items the Slab has registered
 *   gga.GreenStacks     - the items greenstacked (the game shows them on the Slab: "Added greenstack display to Slab")
 *   cList.SlabItemSort  - every item, in the Slab's order
 *
 * One page, two tabs: the Slab's registrations and the Greenstacks, each its own list with its filter (Missing only,
 * on the line under the title) and its tools. One read of the game fills both.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { ItemRegistrationPart } from "../../../components/views/account/ItemRegistrationTab.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList, toolsPerTab, loadParts } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const TABS = [
    {
        id: "slab",
        label: "Slab",
        historyPath: "Cards[1]",
        keywords: ["Item Registration", "Registered Items", "Register"],
    },
    {
        id: "greenstacks",
        label: "Greenstacks",
        historyPath: "GreenStacks",
        keywords: ["Greenstack", "Greenstacks", "Green stack"],
    },
];

const SlabTab = () => {
    const parts = new Map();
    const busy = () => [...parts.values()].some((part) => part.busy());
    const { loading, error, run } = useAccountLoad({ label: "Slab", busy });
    const pending = () => loading.val || Boolean(error.val);
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS)
        parts.set(
            tab.id,
            ItemRegistrationPart({ label: tab.label, historyPath: tab.historyPath, pending, reload: load })
        );
    const activeId = van.state(TABS[0].id);

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Slab",
        description: "Which items the Slab has registered, and which you've greenstacked.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        // The open tab's filter.
        toolbar: TABS.map((tab) => div({ hidden: () => activeId.val !== tab.id }, parts.get(tab.id).filter)),
        state: { loading, error },
        loadingText: "Reading the Slab",
        errorTitle: "Couldn't read the Slab",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Slab",
                page: "w5.slab",
                activeId,
                busy,
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
                tools: toolsPerTab(Object.fromEntries(TABS.map((tab) => [tab.id, parts.get(tab.id).tools]))),
                toolsLabel: (active) => parts.get(active.val).toolsLabel(),
            })
        ),
    });
};

export default definePage({
    id: "w5.slab",
    world: 5,
    system: "Slab",
    description: "Slab registrations and Greenstacks.",
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SlabTab,
});
