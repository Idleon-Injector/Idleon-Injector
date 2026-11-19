import van from "../vendor/van-1.6.0.js";
import { fetchPageFiles } from "../services/api.js";
import { buildMenuTree, searchEntries } from "./menuModel.js";

/** The menu tree once the pages have loaded; null while loading. */
export const menuTree = van.state(null);
/** Why the pages could not load, or "". */
export const menuError = van.state("");
/** Flat search entries for the menu search. */
export const menuSearchEntries = van.derive(() => (menuTree.val ? searchEntries(menuTree.val) : []));

/**
 * Load every page module the server lists, plus the stylesheets next to them.
 * A page that fails to load is left out and reported; the rest of the menu still works.
 */
export const loadPages = async () => {
    try {
        const { modules, styles } = await fetchPageFiles();
        for (const href of styles) {
            document.head.appendChild(van.tags.link({ rel: "stylesheet", href: `/pages/${href}` }));
        }
        const results = await Promise.allSettled(modules.map((file) => import(`/pages/${file}`)));
        const pages = [];
        const failed = [];
        results.forEach((result, i) => {
            if (result.status === "fulfilled" && result.value.default) pages.push(result.value.default);
            else {
                failed.push(modules[i]);
                console.error(`Page ${modules[i]} failed to load:`, result.reason || "no default export");
            }
        });
        menuTree.val = buildMenuTree(pages);
        menuError.val = failed.length ? `${failed.length} page(s) failed to load: ${failed.join(", ")}` : "";
    } catch (error) {
        menuTree.val = buildMenuTree([]);
        menuError.val = `The menu pages could not load: ${error.message}`;
    }
};
