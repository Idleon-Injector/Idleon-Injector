import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { executeCheatAction, fetchBundleCatalog } from "../../../services/api.js";
import { shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    NO_CHARACTER,
    createStaticRowReconciler,
    readCharacterInPlay,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { Said, clickAgain, useSaid } from "../../../components/inPlace.js";

const { div, span, button } = van.tags;

const BUNDLES_RECEIVED_PATH = "BundlesReceived.h";
const BUY_POLL_INTERVAL_MS = 1000;
const BUY_POLL_ATTEMPTS = 10;
const BUY_ALL_WARNING = "Free up inventory space first, or items may be lost.";

// A pack without the free inventory slots it needs is dropped by the game (`slots`, from the catalog).
const notReceived = (bundle) =>
    new Error(
        bundle.slots
            ? `Not received. Needs ${bundle.slots} free inventory slot${bundle.slots === 1 ? "" : "s"}.`
            : `Timed out confirming ownership of ${bundle.code}.`
    );
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isOwned = (owned) => Number(owned) === 1;
const bundlePath = (code) => `${BUNDLES_RECEIVED_PATH}.${code}`;
const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const BundleRow = ({ bundle, state, buyAllStatus, onBuy, onUnbuy }) =>
    AccountRow({
        status: () => (state.status.val === "success" ? "success" : state.status.val === "error" ? "error" : null),
        rowClass: "bundle-row",
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, bundle.name),
            span({ class: "account-row__sub-label bundle-row__code" }, bundle.code),
            () =>
                state.pending.val
                    ? span({ class: "bundle-row__pending" }, "WAITING FOR LIVE OWNERSHIP CONFIRMATION")
                    : null,
            // Why the row's last Buy or Unbuy failed, until its next one.
            Said({ said: state.said.said, className: "said--line bundle-row__said", kinds: ["failed"] })
        ),
        badge: () => {
            if (state.pending.val) return "Buy queued";
            return isOwned(state.owned.val) ? "Owned" : "Not owned";
        },
        controlsClass: "bundle-row__controls",
        controls: button(
            {
                type: "button",
                class: () =>
                    isOwned(state.owned.val)
                        ? "btn-danger btn-sm bundle-row__action"
                        : "btn-quiet btn-sm bundle-row__action",
                disabled: () => buyAllStatus.val === "loading" || state.pending.val || state.status.val === "loading",
                onclick: () => {
                    if (buyAllStatus.val === "loading" || state.pending.val || state.status.val === "loading") return;
                    return isOwned(state.owned.val) ? onUnbuy(bundle, state) : onBuy(bundle, state);
                },
            },
            () => {
                if (state.pending.val) return "Buy queued";
                if (state.status.val === "loading") return isOwned(state.owned.val) ? "Unbuying" : "Buying";
                return isOwned(state.owned.val) ? "Unbuy" : "Buy";
            }
        ),
    });

const BundlesTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Bundles" });
    const catalogState = van.state([]);
    const bundleStates = new Map();
    const purchaseBlockMessage = van.state(null);
    // Buy all asks in place (#25): the first press reads "Click again" and says the inventory warning beside it.
    const buyAllSaid = useSaid();
    const { status: buyAllStatus, run: runBuyAll } = useWriteStatus();
    const listNode = div({ class: "account-item-stack bundles-list" });
    const reconcileRows = createStaticRowReconciler(listNode);
    let catalogCache = [];

    const getBundleState = (code, owned = 0) => {
        if (!bundleStates.has(code)) {
            const { status, run } = useWriteStatus();
            bundleStates.set(code, {
                owned: van.state(isOwned(owned) ? 1 : 0),
                pending: van.state(false),
                status,
                run,
                said: useSaid(),
            });
        }
        return bundleStates.get(code);
    };

    const isBuyable = (bundle) => {
        const state = getBundleState(bundle.code, bundle.owned);
        return !isOwned(state.owned.val) && !state.pending.val;
    };
    // Buy all and the counts cover the bundles the top bar's search shows (#28).
    const shownBundles = () => catalogState.val.filter((bundle) => shownBySearch(getBundleState(bundle.code).row));
    const getBuyableBundles = () => shownBundles().filter(isBuyable);

    const buyableCount = van.derive(() => getBuyableBundles().length);

    // A bundle's items go to the character in play; at character select they would land on placeholders.
    const ensurePlayerSelected = async () => {
        try {
            await readCharacterInPlay();
            purchaseBlockMessage.val = null;
            return true;
        } catch (caughtError) {
            if (caughtError.message !== NO_CHARACTER)
                console.error("[bundles] Active character check failed:", caughtError);
            purchaseBlockMessage.val =
                caughtError.message === NO_CHARACTER ? NO_CHARACTER : "Could not tell who is in play. Try again.";
            return false;
        }
    };

    const askThenBuyAll = async (e) => {
        const buyButton = e.currentTarget;
        if (buyAllStatus.val === "loading" || buyableCount.val === 0) return undefined;
        if (!(await ensurePlayerSelected())) return undefined;
        const bundles = getBuyableBundles();
        const question = `buy ${bundles.length} bundle${bundles.length === 1 ? "" : "s"}. ${BUY_ALL_WARNING}`;
        if (!clickAgain(buyButton, question, { targets: bundles.map((bundle) => bundle.code) })) {
            buyAllSaid.say("refused", BUY_ALL_WARNING);
            return undefined;
        }
        buyAllSaid.clear();
        // The bundles the second press confirmed, though the search changes while it runs.
        const outcome = await buyAllBundles(bundles);
        if (outcome?.error) buyAllSaid.say("failed", saveFailureReason(outcome.error));
        return outcome;
    };

    // Counted over the bundles the search shows, like Buy all.
    const totals = van.derive(() => {
        const bundles = shownBundles();
        const owned = bundles.filter((bundle) => isOwned(getBundleState(bundle.code).owned.val)).length;
        const queued = bundles.filter((bundle) => getBundleState(bundle.code).pending.val).length;
        return { total: bundles.length, owned, queued };
    });

    const applyCatalog = (catalog) => {
        catalogCache = [...catalog].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
        catalogState.val = catalogCache;

        for (const bundle of catalogCache) {
            const state = getBundleState(bundle.code, bundle.owned);
            state.owned.val = bundle.owned;
            if (bundle.owned === 1) state.pending.val = false;
        }

        reconcileRows(catalogCache.map((bundle) => `${bundle.code}:${bundle.name}`).join("|"), () =>
            catalogCache.map((bundle) => {
                const state = getBundleState(bundle.code, bundle.owned);
                state.row = BundleRow({ bundle, state, buyAllStatus, onBuy: buyBundle, onUnbuy: unbuyBundle });
                return state.row;
            })
        );
    };

    // An older read answering after a newer one would put back what the game held before it, and so would a read
    // that started before an Unbuy landed: that one reads again.
    let catalogReads = 0;
    let catalogShown = 0;
    let unbuysLanded = 0;
    const refreshCatalog = async () => {
        // ponytail: at most three reads; Unbuys landing nonstop would show the third read.
        for (let tries = 1; ; tries++) {
            const read = ++catalogReads;
            const landed = unbuysLanded;
            const catalog = await fetchBundleCatalog();
            if (landed !== unbuysLanded && tries < 3) continue;
            if (read > catalogShown) {
                catalogShown = read;
                applyCatalog(catalog);
            }
            return catalogCache;
        }
    };

    const pollForOwnership = async (code, state) => {
        for (let attempt = 0; attempt < BUY_POLL_ATTEMPTS; attempt += 1) {
            await delay(BUY_POLL_INTERVAL_MS);
            await refreshCatalog();
            if (isOwned(state.owned.val)) return true;
        }
        return false;
    };

    const pollForOwnershipBatch = async (entries) => {
        const pendingEntries = new Map(entries.map((entry) => [entry.bundle.code, entry]));

        for (let attempt = 0; attempt < BUY_POLL_ATTEMPTS && pendingEntries.size; attempt += 1) {
            await delay(BUY_POLL_INTERVAL_MS);
            await refreshCatalog();

            for (const [code, entry] of pendingEntries) {
                if (!isOwned(entry.state.owned.val)) continue;
                entry.confirmation.resolve();
                pendingEntries.delete(code);
            }
        }

        return pendingEntries;
    };

    // After a failed Buy or Unbuy the game may hold either state, so the rows read it again (once for a Buy all). A
    // failure while that read runs reads once more after it, since the running read may predate its write.
    let failureRead = null;
    let readAgain = false;
    const readAfterFailure = () => {
        if (failureRead) return void (readAgain = true);
        failureRead = refreshCatalog()
            .catch(() => {}) // ponytail: the rows stay as they were; Refresh reads them again
            .finally(() => {
                failureRead = null;
                if (readAgain) {
                    readAgain = false;
                    readAfterFailure();
                }
            });
    };
    const failed = (state, what, caughtError) => {
        console.error(`[bundles] ${what}:`, caughtError);
        state.said.say("failed", saveFailureReason(caughtError));
        readAfterFailure();
    };

    async function buyBundle(bundle, state) {
        if (buyAllStatus.val === "loading" || isOwned(state.owned.val) || state.pending.val) return;
        state.said.clear();
        return state.run(
            async () => {
                if (!(await ensurePlayerSelected())) throw new Error(purchaseBlockMessage.val ?? NO_CHARACTER);

                state.pending.val = true;
                try {
                    await executeCheatAction(`buy ${bundle.code}`);
                    const confirmed = await pollForOwnership(bundle.code, state);
                    if (!confirmed) throw notReceived(bundle);
                } finally {
                    state.pending.val = false;
                }
            },
            { onError: (caughtError) => failed(state, `Buy failed for ${bundle.code}`, caughtError) }
        );
    }

    async function buyAllBundles(confirmed) {
        if (buyAllStatus.val === "loading") return;
        return runBuyAll(async () => {
            if (!(await ensurePlayerSelected())) {
                throw new Error(purchaseBlockMessage.val ?? NO_CHARACTER);
            }

            // One bought or queued meanwhile (its own Buy) is left out.
            const bundles = confirmed.filter(isBuyable);
            if (!bundles.length) return;

            let queueTail = Promise.resolve();
            const queueSequentially = (task) => {
                const request = queueTail.then(task, task);
                queueTail = request.catch(() => undefined);
                return request;
            };
            const entries = bundles.map((bundle) => {
                const state = getBundleState(bundle.code, bundle.owned);
                const entry = {
                    bundle,
                    state,
                    confirmation: createDeferred(),
                    queued: false,
                    request: null,
                    result: null,
                };

                state.said.clear();
                entry.result = state.run(
                    async () => {
                        try {
                            entry.request = queueSequentially(async () => {
                                state.pending.val = true;
                                await executeCheatAction(`buy ${bundle.code}`);
                                entry.queued = true;
                            });
                            await entry.request;
                            await entry.confirmation.promise;
                        } finally {
                            state.pending.val = false;
                        }
                    },
                    { onError: (caughtError) => failed(state, `Buy failed for ${bundle.code}`, caughtError) }
                );
                return entry;
            });

            await Promise.allSettled(entries.map((entry) => entry.request));
            const queued = entries.filter((entry) => entry.queued);

            if (queued.length) {
                try {
                    const pending = await pollForOwnershipBatch(queued);
                    for (const entry of pending.values()) {
                        entry.confirmation.reject(notReceived(entry.bundle));
                    }
                } catch (caughtError) {
                    console.error("[bundles] Ownership poll failed after Buy All:", caughtError);
                    // One a newer read showed owned is bought; every other waits for nothing more.
                    for (const entry of queued) {
                        if (isOwned(entry.state.owned.val)) entry.confirmation.resolve();
                        else entry.confirmation.reject(caughtError);
                    }
                }
            }

            const results = await Promise.all(entries.map((entry) => entry.result));
            if (results.some(({ ok }) => !ok)) throw new Error("One or more bundle purchases could not be completed.");
        });
    }

    async function unbuyBundle(bundle, state) {
        if (buyAllStatus.val === "loading" || !isOwned(state.owned.val) || state.pending.val) return;
        state.said.clear();
        return state.run(
            async () => {
                // Unbuy is deliberately the only direct ownership write, and it can
                // only write 0. writeVerified reads the flag back before this updates.
                await writeVerified(bundlePath(bundle.code), 0);
                unbuysLanded++;
                state.owned.val = 0;
                state.pending.val = false;
            },
            { onError: (caughtError) => failed(state, `Unbuy failed for ${bundle.code}`, caughtError) }
        );
    }

    const load = () => runLoad(refreshCatalog);
    load();

    const playerSelectionWarning = div(
        { hidden: () => !purchaseBlockMessage.val },
        WarningBanner(() => purchaseBlockMessage.val)
    );

    const body = div(
        { class: "scrollable-panel content-stack bundles-scroll" },
        AccountSection({
            title: "BUNDLE CATALOG",
            note: () => {
                const value = totals.val;
                const queueLabel = value.queued ? `, ${value.queued} QUEUED` : "";
                return `${value.total} BUNDLES, ${value.owned} OWNED, ${value.total - value.owned} NOT OWNED${queueLabel}`;
            },
            body: () =>
                catalogState.val.length
                    ? listNode
                    : EmptyState({
                          title: "NO BUNDLES",
                          subtitle: "No bundle codes were returned by the running game.",
                      }),
        })
    );

    return PersistentAccountListPage({
        title: "BUNDLES",
        description:
            "Buy bundles and see which ones your account has received. Unbuy lets you mark a bundle as not received again, but does not remove its items from the Slab.",
        actions: [
            Said({ said: buyAllSaid.said, className: "said--buy-all" }),
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm bundles-buy-all-button",
                    disabled: () => loading.val || buyAllStatus.val === "loading" || buyableCount.val === 0,
                    onclick: askThenBuyAll,
                },
                () => {
                    if (buyAllStatus.val === "loading") return "Buying all…";
                    if (buyAllStatus.val === "error") return "Buy all failed";
                    return `Buy all (${buyableCount.val})`;
                }
            ),
            RefreshButton({
                onRefresh: load,
                disabled: () => loading.val || buyAllStatus.val === "loading",
            }),
        ],
        topNotices: [WarningBanner("Bundles do not provide gems or pets."), playerSelectionWarning],
        state: { loading, error },
        loadingText: "READING BUNDLES",
        errorTitle: "BUNDLE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "account.bundles",
    world: "account",
    system: "Bundles",
    description: "Which bundles the account has received, and buying or unbuying them.",
    component: BundlesTab,
});
