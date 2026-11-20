import van from "../../../vendor/van-1.6.0.js";
import { currentPlace, reloadPlace } from "../../../services/changeLog.js";

/**
 * Shared account-page load helpers.
 *
 * V1 scope is intentionally narrow:
 * - reads stay inline in each page
 * - any failed read fails the load
 * - this module only standardizes load-state transitions and page-level logging
 */

/**
 * Hook that owns account-page load state and runs a load task with standard
 * loading/error transitions and page-level logging.
 *
 * Loads run one after another, so the newest one answers last and its values stay. `busy()` (reactive) says a page
 * write is running, such as a bulk action: a reload waits for it.
 *
 * @param {{ label?: string, fallbackMessage?: string, busy?: () => boolean }} [opts]
 * @returns {{
 *   loading: import('../../../vendor/van-1.6.0.js').State<boolean>,
 *   error: import('../../../vendor/van-1.6.0.js').State<string|null>,
 *   run: (task: () => Promise<any>) => Promise<any|undefined>,
 *   reload: () => void,
 *   pending: import('../../../vendor/van-1.6.0.js').State<boolean>,
 * }}
 */
export const useAccountLoad = ({ label = "Account page", fallbackMessage, busy = () => false } = {}) => {
    const loading = van.state(true);
    const error = van.state(null);
    // A page mounts while it is open, so this is the page it loads for.
    const place = currentPlace();
    let lastTask = null;
    let queue = Promise.resolve();
    let queued = 0;

    const load = async (task) => {
        error.val = null;
        try {
            return await task();
        } catch (caughtError) {
            console.error(`[account-load] ${label} load failed:`, caughtError);

            const fallback =
                fallbackMessage ||
                `Failed to load ${String(label ?? "account page")
                    .trim()
                    .toLowerCase()} data`;
            if (
                caughtError &&
                typeof caughtError === "object" &&
                typeof caughtError.message === "string" &&
                caughtError.message.trim()
            ) {
                error.val = caughtError.message;
            } else if (typeof caughtError === "string" && caughtError.trim()) {
                error.val = caughtError;
            } else {
                error.val = fallback;
            }
            return undefined;
        }
    };

    // Loads run in turn. ponytail: a load task must not wait for another load of its page, which would wait for it.
    const run = (task) => {
        lastTask = task;
        queued++;
        loading.val = true;
        queue = queue
            .then(() => load(task))
            .finally(() => {
                if (--queued === 0) loading.val = false;
            });
        return queue;
    };

    // An undo made elsewhere (History, or a bulk Undo all) changed values this page shows: read them again. So does
    // `reload()`, which a page asks for after a write that landed in part. A reload waits for the page's writes still
    // running (`busy`), so it reads after they landed, and a load still running, as loads run in turn. `pending` is true
    // until it starts, so the page can hold actions that would use the values it shows.
    // ponytail: re-runs the page's last load; a load must only read, which is how every page loads today.
    let handled = reloadPlace.rawVal;
    const pending = van.state(false);
    van.derive(() => {
        const target = reloadPlace.val;
        if (!target || target === handled) return;
        handled = target;
        if (target.view === place.view && target.page === place.page) pending.val = true;
    });
    // Started from a microtask: a derive that sets a state it reads stops listening to it (VanJS).
    const start = () => {
        if (!pending.rawVal || busy() || !lastTask) return;
        pending.val = false;
        void run(lastTask);
    };
    van.derive(() => {
        if (pending.val && !busy()) queueMicrotask(start);
    });

    return { loading, error, run, reload: () => (pending.val = true), pending };
};
