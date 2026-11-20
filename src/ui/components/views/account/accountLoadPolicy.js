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
 * @param {{ label?: string, fallbackMessage?: string }} [opts]
 * @returns {{
 *   loading: import('../../../vendor/van-1.6.0.js').State<boolean>,
 *   error: import('../../../vendor/van-1.6.0.js').State<string|null>,
 *   run: (task: () => Promise<any>) => Promise<any|undefined>,
 * }}
 */
export const useAccountLoad = ({ label = "Account page", fallbackMessage } = {}) => {
    const loading = van.state(true);
    const error = van.state(null);
    // A page mounts while it is open, so this is the page it loads for.
    const place = currentPlace();
    let lastTask = null;

    const run = async (task) => {
        lastTask = task;
        loading.val = true;
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
        } finally {
            loading.val = false;
        }
    };

    // An undo made elsewhere (History, or a bulk Undo all) changed values this page shows: read them again.
    // ponytail: re-runs the page's last load; a load must only read, which is how every page loads today.
    const seen = reloadPlace.rawVal;
    van.derive(() => {
        const target = reloadPlace.val;
        if (!target || target === seen || !lastTask || loading.rawVal) return;
        if (target.view === place.view && target.page === place.page) void run(lastTask);
    });

    return { loading, error, run };
};
