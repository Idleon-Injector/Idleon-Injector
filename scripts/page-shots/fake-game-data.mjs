/**
 * The fake game's data. `gga` is gameAttributes.h (CustomLists.h is cList); `computed[method][name]` answers
 * events(N)[method](name, ...): a value, or a function of the other arguments; `companions` is the account's
 * owned pets. Fixed values only (no Math.random, no Date), so every run looks the same.
 *
 * The data is invented, shaped after what each page reads. Each world's pages get theirs from data/<world>.mjs;
 * a world file sets whole keys, or single indexes of an array declared here with `{ index: value }`.
 * A page that shows little gets its data there: the report's `misses` lists what pages asked for and didn't get.
 */
import { list } from "./data/helpers.mjs";
import shared from "./data/shared.mjs";
import account from "./data/account.mjs";
import world1 from "./data/world-1.mjs";
import world2 from "./data/world-2.mjs";
import world3 from "./data/world-3.mjs";
import world4 from "./data/world-4.mjs";
import world5 from "./data/world-5.mjs";
import world6 from "./data/world-6.mjs";
import world7 from "./data/world-7.mjs";

const isObject = (value) => value !== null && typeof value === "object";

/** Copy `patch` into `target`: objects merge key by key, an array takes `{ index: value }`, the rest replaces. */
function merge(target, patch) {
    for (const [key, value] of Object.entries(patch)) {
        const current = target[key];
        if (isObject(current) && isObject(value) && !Array.isArray(value)) merge(current, value);
        else target[key] = value;
    }
    return target;
}

const base = () => ({
    gga: {
        ItemDefinitionsGET: { h: {} },
        MonsterDefinitionsGET: { h: {} },
        BundlesReceived: { h: { bun_a: 1 } },
        // Lists of lists that pages of several worlds index into.
        CustomLists: {
            h: {
                NinjaInfo: list(45, () => []),
                Research: list(65, () => []),
                Spelunky: list(45, () => []),
                RANDOlist: list(120, () => []),
                RandoListo2: list(15, () => []),
            },
        },
        CustomMaps: { h: {} },
        DNSM: { h: {} },
        // Shared by several worlds' pages; each world file sets the indexes its pages read.
        OptionsListAccount: list(700, (i) => (i * 13) % 50),
        Spelunk: list(60, () => []),
        Research: list(40, () => []),
        Ninja: list(110, () => []),
        Menagerie: list(10, () => []),
        RoyalG: list(24, () => []),
        Compass: list(5, () => []),
        Number2Letter: "_abcdefghijklmnopqrstuvwxyz".split(""),
    },
    computed: {},
    companions: [],
    bundleMessages: {},
    cheatStates: { godlike: { reach: true, crit: true }, w1: { companion: true } },
});

export const fakeGameData = () =>
    [shared, account, world1, world2, world3, world4, world5, world6, world7].reduce(
        (data, part) => merge(data, part()),
        base()
    );
