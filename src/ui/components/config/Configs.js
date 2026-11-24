import van from "../../vendor/van-1.6.0.js";
import { changeConfigs } from "../../services/api.js";
import { Said, clickAgain, replay, useSaid } from "../inPlace.js";

const { div, span, button, input, form } = van.tags;

const cheatCount = (n) => (n === 0 ? "No cheats" : n === 1 ? "1 cheat" : `${n} cheats`);

/**
 * The Configs tab of Settings (#198): the shipped configs and the player's own, one row each. Use switches to a config,
 * Reset puts a changed shipped one back, Delete removes one of the player's own, and the field at the end keeps the
 * settings in use as a new config. `configs` is a state holding the server's list ({ active, list }); `onChanged()`
 * runs after a change, for the page to read the settings again.
 */
export const Configs = ({ configs, onChanged }) => {
    // What the last change said, on the row it was about (a failure stays until the next change).
    const { said, say } = useSaid(5000);
    const saidOn = van.state(null);
    const newName = van.state("");
    const nameSaid = useSaid(5000);

    const run = async (action, name, where, pressed) => {
        try {
            const { configs: next, game } = await changeConfigs(action, name);
            configs.val = next;
            await onChanged();
            if (game?.failed?.length) {
                saidOn.val = where;
                const [first] = game.failed;
                return say(
                    "failed",
                    game.failed.length === 1
                        ? `${first.cheat} didn't start. ${first.reason}`.trim()
                        : `Didn't start: ${game.failed.map((f) => f.cheat).join(", ")}`
                );
            }
            if (game && !game.gameApplied && !game.contextLost) {
                saidOn.val = where;
                return say("failed", "The game kept its old settings. Restart it.");
            }
            saidOn.val = null; // a success clears the last failure, wherever it was
            replay(pressed, "confirmed");
        } catch (error) {
            saidOn.val = where;
            say("failed", error.message);
        }
    };

    const Row = (entry) => {
        const inUse = configs.val.active === entry.name;
        const about = entry.shipped ? `${entry.about} · ${cheatCount(entry.cheats)}` : cheatCount(entry.cheats);
        return div(
            { class: `config-item configs-row${inUse ? " is-active" : ""}`, role: "listitem" },
            div(
                { class: "config-item-header" },
                span({ class: "configs-row__name" }, entry.name),
                span({ class: "config-description" }, about)
            ),
            div(
                { class: "config-item-control" },
                inUse ? span({ class: "configs-row__state is-on" }, "In use") : null,
                entry.changed ? span({ class: "configs-row__state" }, "Changed") : null,
                entry.shipped && entry.changed
                    ? button(
                          {
                              type: "button",
                              class: "btn-danger btn-sm",
                              onclick: (e) => {
                                  const el = e.currentTarget;
                                  if (clickAgain(el, `reset ${entry.name} to how it ships.`))
                                      run("reset", entry.name, entry.name, el);
                              },
                          },
                          "Reset"
                      )
                    : null,
                !entry.shipped && !inUse
                    ? button(
                          {
                              type: "button",
                              class: "btn-danger btn-sm",
                              onclick: (e) => {
                                  const el = e.currentTarget;
                                  if (clickAgain(el, `delete ${entry.name}.`))
                                      run("remove", entry.name, entry.name, el);
                              },
                          },
                          "Delete"
                      )
                    : null,
                inUse
                    ? null
                    : button(
                          {
                              type: "button",
                              class: "btn-quiet btn-sm",
                              onclick: (e) => run("use", entry.name, entry.name, e.currentTarget),
                          },
                          "Use"
                      )
            ),
            // What the last change said about this row, on a line of its own under it.
            saidOn.val === entry.name ? Said({ said, className: "said--line configs-row__said" }) : null
        );
    };

    const saveAs = async (e) => {
        e.preventDefault();
        const saveButton = e.currentTarget.querySelector("button");
        try {
            const typed = newName.val;
            const { configs: next } = await changeConfigs("saveAs", typed);
            configs.val = next;
            if (newName.val === typed) newName.val = ""; // not what was typed while it saved
            nameSaid.clear();
            replay(saveButton, "confirmed");
            await onChanged();
        } catch (error) {
            nameSaid.say("failed", error.message);
        }
    };

    return div(
        { class: "configs" },
        () => div({ class: "configs-list", role: "list" }, (configs.val?.list ?? []).map(Row)),
        form(
            { class: "configs-new", onsubmit: saveAs },
            input({
                type: "text",
                class: "configs-new__name",
                placeholder: "New config name",
                "aria-label": "New config name",
                maxlength: 40,
                value: newName,
                oninput: (e) => (newName.val = e.target.value),
            }),
            button({ type: "submit", class: "btn-quiet" }, "Save current as new"),
            Said({ said: nameSaid.said, className: "said--inline" })
        )
    );
};
