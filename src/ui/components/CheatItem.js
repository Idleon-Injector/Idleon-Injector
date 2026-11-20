import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { Icons } from "../assets/icons.js";
import { Said, plainReason, replay, useSaid } from "./inPlace.js";

const { div, input, button, span } = van.tags;

/**
 * Individual cheat button with optional parameter input and favorite toggle. What a run did is said on the row
 * itself (#77): a ✓ and the cheat's words, why it was refused, or why it failed.
 * @param {object} cheat - Cheat data object with value, message, needsParam, category
 * @returns {Element} Cheat item DOM element
 */
export const CheatItem = (cheat) => {
    const needsValue = cheat.needsParam === true;
    const hasConfig = store.hasConfigEntry(cheat.value);
    const { said, say } = useSaid();
    // A result or a refusal is short and rides on the row's end; a failure gets its own line under the row,
    // so its reason reads in full even at 400 px.

    // Only a cheat that takes a value keeps its draft in a state: the star reads it, so it lights as the value is
    // typed. The rest (most rows) need no state, which saves thousands of listeners.
    const draft = needsValue ? van.state("") : null;
    const inputRef = needsValue
        ? input({
              type: "text",
              class: "cheat-input",
              placeholder: "Val",
              "aria-label": `Value for ${cheat.value}`,
              value: draft,
              oninput: (e) => (draft.val = e.target.value),
          })
        : null;

    const getInputValue = () => (draft ? draft.val.trim() : "");

    // A refusal: the value field (the row's hint) pulses and the row says why.
    const refuse = (text) => {
        replay(inputRef, "refused");
        say("refused", text);
    };

    const handleExecute = async () => {
        let finalAction = cheat.value;
        const val = getInputValue();
        // Turning a cheat off takes no value: a bare click on one that is on turns it off.
        if (needsValue && !val && !store.getActiveCheats().includes(cheat.value)) return refuse("needs a value");
        if (val) finalAction = `${cheat.value} ${val}`;

        const result = await store.executeCheat(finalAction);
        if (result.ok) {
            replay(runButton, "confirmed");
            say("done", result.message);
        } else {
            say("failed", plainReason(result.message));
        }
    };

    const handleConfigClick = (e) => {
        e.stopPropagation();
        store.navigateToCheatConfig(cheat.value);
    };

    const handleFavorite = () => {
        if (needsValue) {
            const val = getInputValue();
            if (!val) return refuse("enter a value to favorite it");
            store.toggleFavorite(`${cheat.value} ${val}`);
        } else {
            store.toggleFavorite(cheat.value);
        }
    };

    const isFavorited = () => {
        if (needsValue) {
            const val = getInputValue();
            if (!val) return false;
            return store.isFavorite(`${cheat.value} ${val}`);
        }
        return store.isFavorite(cheat.value);
    };

    const runButton = button(
        {
            class: () =>
                `cheat-button ${hasConfig ? "has-config" : ""} ${said.val?.kind === "failed" ? "is-failed" : ""}`,
            onclick: handleExecute,
        },
        span(
            { class: "cheat-button-text" },
            cheat.message && cheat.message !== cheat.value ? `${cheat.value} - ${cheat.message}` : cheat.value
        ),
        Said({ said, className: "said--row", kinds: ["done", "refused"] }),
        hasConfig
            ? span(
                  {
                      class: "cheat-config-icon",
                      onclick: handleConfigClick,
                      title: "Open config for this cheat",
                  },
                  Icons.Settings()
              )
            : null
    );

    return div(
        {
            class: () => `cheat-item-container ${said.val?.kind === "refused" ? "is-waiting-value" : ""}`,
            "data-cheat": cheat.value,
        },
        runButton,
        inputRef,
        button(
            {
                class: () => `favorite-btn ${isFavorited() ? "is-favorite" : ""}`,
                "aria-label": `Favorite ${cheat.value}`,
                "aria-pressed": () => String(isFavorited()),
                onclick: (e) => {
                    e.stopPropagation();
                    handleFavorite();
                },
            },
            Icons.Star()
        ),
        Said({ said, className: "said--line said--row-failed", kinds: ["failed"] })
    );
};
