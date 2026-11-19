/**
 * Config lookup handler
 *
 * Many cheats hook one game method that answers many keys, each with its own config function. configLookup()
 * builds the base-first defineHook handler for them, instead of an if/else chain per method.
 */

import { cheatState, cheatConfig } from "../core/state.js";

/** The value at a dot path such as "w1.owl", or undefined. */
const resolvePath = (obj, path) => path.split(".").reduce((o, i) => o[i], obj);

/**
 * A base-first handler that answers the method's first argument (the key) from the cheats' config.
 *
 * @param {Array<Mapping>} mappings - The cheats served, in order; the first one that answers wins.
 * @returns {(base: any, ...args: any[]) => any}
 *
 * @typedef {object} Mapping
 * @property {string} state - The path in `cheatState` to check if enabled (e.g. "w1.owl").
 * @property {string} [config] - The path in `cheatConfig` to look up the override. Defaults to `state`.
 * @property {any} [fixedKey] - If provided, `value` is the answer when the key is `fixedKey`.
 * @property {any} [value] - The answer for `fixedKey`.
 *
 * @example
 * defineHook({ id: "w5.gaming", target: () => events(579), method: "_customBlock_GamingStatType" },
 *     configLookup([{ state: "w5.gaming" }]));
 */
export function configLookup(mappings) {
    return (base, ...args) => {
        const key = args[0];

        for (const mapping of mappings) {
            const isEnabled = resolvePath(cheatState, mapping.state);
            if (!isEnabled) continue;

            if (mapping.fixedKey !== undefined && key === mapping.fixedKey) {
                return mapping.value;
            }

            const configPath = mapping.config ?? mapping.state;
            if (configPath) {
                const configGroup = resolvePath(cheatConfig, configPath);
                if (configGroup && configGroup[key]) {
                    return configGroup[key](base, args);
                }
            }
        }

        return base;
    };
}
