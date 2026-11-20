import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Icons } from "../../assets/icons.js";
import { NumberInput, setNumberInputValue } from "../NumberInput.js";
import { FunctionInput } from "../FunctionInput.js";
import { withTooltip } from "../Tooltip.js";
import { isFunction } from "../../utils/functionParser.js";
import { configDescriptions } from "../../config/configDescriptions.js";
import { StateSwitch } from "../views/account/components/StateSwitch.js";

const { div, label, input, details, summary, span, button } = van.tags;

/**
 * Resolves a dot-separated path to a value in an object.
 */
const resolvePath = (obj, path) => {
    if (!obj || !path) return undefined;
    return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
};

/**
 * Optimized Deep/Loose Equality Check
 * Prevents expensive JSON.stringify on primitives and handles number/string coercion.
 */
const areValuesEqual = (a, b) => {
    if (a === b) return true;
    if (a === null || b === null) return false;

    // Numeric coercion to match NumberInput behavior
    if (typeof a === "number" || typeof b === "number") {
        return Number(a) === Number(b);
    }

    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;

    // JSON.stringify for deep comparison - stable enough for config objects
    return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Helper function to check if a category or any of its children match the search term
 */
const hasMatchingChildren = (obj, searchTerm) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();

    for (const key of Object.keys(obj)) {
        if (key.toLowerCase().includes(term)) return true;

        const value = obj[key];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            if (hasMatchingChildren(value, searchTerm)) return true;
        }
    }
    return false;
};

export const ConfigNode = ({
    data,
    path = "",
    template = null,
    searchTerm = "",
    forceOpen = false,
    parentMatched = false,
}) => {
    const source = template || data;
    const keys = Object.keys(source);
    const termLower = searchTerm.toLowerCase();

    return keys.map((key) => {
        const value = source[key];
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            const categoryMatches = !termLower || key.toLowerCase().includes(termLower);
            const childrenMatch = hasMatchingChildren(data[key] || {}, searchTerm);

            if (termLower && !parentMatched && !categoryMatches && !childrenMatch) {
                return null;
            }

            const isCategoryModified = van.derive(() => {
                const defaults = store.app.config?.defaultConfig;
                if (!defaults) return false;

                // Resolve nested path to get default value for comparison
                const defaultSub = resolvePath(defaults, currentPath);

                const currentSub = data[key];

                if (defaultSub === undefined) return false;

                return !areValuesEqual(currentSub, defaultSub);
            });

            // Auto-expand when searching or forced
            const shouldAutoExpand = forceOpen || (termLower && (categoryMatches || childrenMatch));

            return details(
                {
                    class: () => `cheat-category ${isCategoryModified.val ? "modified-category" : ""}`,
                    open: shouldAutoExpand || undefined,
                },
                summary(key, Icons.Chevron({ dir: "right", class: "group-chevron" })),
                div(
                    { class: "cheat-category-content" },
                    ConfigNode({
                        data: data[key],
                        path: currentPath,
                        template: template ? template[key] : null,
                        searchTerm,
                        forceOpen,
                        parentMatched: parentMatched || (termLower && categoryMatches),
                    })
                )
            );
        }

        const matchesSearch = parentMatched || !termLower || key.toLowerCase().includes(termLower);
        if (!matchesSearch) {
            return null;
        }

        return ConfigItem({ data, key, fullPath: currentPath, initialValue: value });
    });
};

const ConfigItem = ({ data, key, fullPath, initialValue }) => {
    const isArray = Array.isArray(initialValue);
    const isFn = isFunction(initialValue);

    const defaults = store.app.config?.defaultConfig;
    const defaultVal = defaults ? resolvePath(defaults, fullPath) : undefined;

    const getFunctionString = (val) => {
        if (typeof val === "function") return val.toString();
        if (typeof val === "string" && isFunction(val)) return val;
        return String(val ?? "");
    };

    const isModified = van.derive(() => {
        const curr = data[key];
        if (defaultVal === undefined) return false;

        if (isFn || isFunction(curr) || isFunction(defaultVal)) {
            return getFunctionString(curr) !== getFunctionString(defaultVal);
        }

        return !areValuesEqual(curr, defaultVal);
    });

    const description = configDescriptions[fullPath] || "";

    const type = isFn ? "function" : isArray ? "array" : typeof (initialValue ?? defaultVal ?? "string");

    // Prevents cursor jumping by using local state synced via van.derive with focus guards
    const getStringValue = (val) => {
        if (isArray || Array.isArray(val)) return JSON.stringify(val);
        if (typeof val === "function") return val.toString();
        return String(val ?? "");
    };

    const localTextState = van.state(getStringValue(initialValue));
    const isFocused = van.state(false);

    van.derive(() => {
        const storeVal = data[key];
        if (!isFocused.val) {
            const newStr = getStringValue(storeVal);
            if (newStr !== localTextState.val) {
                localTextState.val = newStr;
            }
        }
    });

    const commitValue = (rawVal) => {
        let val = rawVal;
        const targetType = isFn ? "function" : isArray ? "array" : typeof (initialValue ?? defaultVal);

        if (targetType === "number") {
            // Number("") is 0, and a cap of 0 (or of text) zeroes the resource it caps: only a number is kept.
            // Infinity (1e400) is refused too: Apply sends it as null, which the game also reads as 0.
            val = String(rawVal).trim() === "" ? NaN : Number(rawVal);
            if (!Number.isFinite(val)) return false;
        } else if (targetType === "boolean") {
            val = Boolean(rawVal);
        } else if (targetType === "array") {
            try {
                const parsed = JSON.parse(rawVal);
                if (Array.isArray(parsed)) val = parsed;
            } catch {
                // Keep previous value if invalid JSON
            }
        }
        data[key] = val;
    };

    // Each keystroke that reads as a number is kept (Backspace on 10000000 passes 1000, ..., 1), so a field left
    // with text that isn't a number goes back to the setting it held when focused, or that −/+ last set.
    let heldOnFocus;
    const handleFocus = () => {
        isFocused.val = true;
        heldOnFocus = data[key];
    };
    const handleBlur = (e) => {
        isFocused.val = false;
        if (commitValue(e.target.value) === false) {
            data[key] = heldOnFocus;
            setNumberInputValue(localTextState, getStringValue(heldOnFocus));
        }
    };
    const handleInput = (e) => {
        localTextState.val = e.target.value;
        if (type === "number" || type === "array") {
            commitValue(e.target.value);
        }
    };

    const handleNumberDelta = (delta) => {
        const newVal = Number(data[key]) + delta;
        data[key] = heldOnFocus = newVal;
        localTextState.val = String(newVal);
    };

    const getDefaultDisplayString = () => {
        if (isFunction(defaultVal)) {
            return getFunctionString(defaultVal);
        }
        return JSON.stringify(defaultVal);
    };

    const renderInputByType = () => {
        switch (type) {
            case "function":
                return FunctionInput({ data, dataKey: key, initialValue });
            case "boolean":
                return StateSwitch({
                    checked: () => data[key],
                    words: ["Enabled", "Disabled"],
                    name: key,
                    onFlip: (next) => (data[key] = next),
                });
            case "number":
                // Formatted mode keeps what is typed until the field is left, so caps like 1e+21 can be edited.
                return NumberInput({
                    value: localTextState,
                    formatter: String,
                    onfocus: handleFocus,
                    onblur: handleBlur,
                    oninput: handleInput,
                    onDecrement: () => handleNumberDelta(-1),
                    onIncrement: () => handleNumberDelta(1),
                });
            case "array":
                return input({
                    type: "text",
                    name: fullPath,
                    value: localTextState,
                    placeholder: "[]",
                    onfocus: handleFocus,
                    onblur: handleBlur,
                    oninput: handleInput,
                });
            default:
                return input({
                    type: "text",
                    value: localTextState,
                    onfocus: handleFocus,
                    onblur: handleBlur,
                    oninput: (e) => {
                        localTextState.val = e.target.value;
                        commitValue(e.target.value);
                    },
                });
        }
    };

    // A setting is a row (#26): its name, description and default on the left, its control on the right. A function
    // takes the row's full width under its name.
    return div(
        {
            class: () =>
                `config-item ${type === "function" ? "config-item--wide" : ""} ${isModified.val ? "modified-config" : ""}`,
            "data-config-key": fullPath,
        },
        div(
            { class: "config-item-header" },
            label(key),
            description ? span({ class: "config-description" }, description) : null,
            div(
                { class: () => `default-value-hint ${isModified.val ? "" : "hidden"}` },
                () => `Default: ${getDefaultDisplayString()}`
            )
        ),
        div(
            { class: "config-item-control" },
            withTooltip(
                button(
                    {
                        type: "button",
                        class: () => `btn-quiet btn-sm config-reset-btn ${isModified.val ? "" : "hidden"}`,
                        onclick: () => {
                            if (isFn && typeof defaultVal === "function") {
                                data[key] = defaultVal.toString();
                            } else {
                                data[key] = defaultVal;
                            }
                            localTextState.val = getStringValue(defaultVal);
                        },
                    },
                    "Reset"
                ),
                "Reset to default"
            ),
            renderInputByType()
        )
    );
};
