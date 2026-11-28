import van from "../../vendor/van-1.6.0.js";
import * as API from "../../services/api.js";
import { IS_ELECTRON } from "../../state/constants.js";
import { EmptyState } from "../EmptyState.js";
import { Loader } from "../Loader.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";

const { div, iframe, button, p } = van.tags;

/** Advanced › DevTools: the page top, then Chrome's DevTools on the game in a frame under it. */
export const DevTools = () => {
    const url = van.state("");
    const error = van.state("");
    const isEmbedded = window.parent !== window;
    const webUiUrl = `http://localhost:${window.location.port || "8080"}`;

    // Load DevTools URL on mount (skip if embedded to prevent crashes)
    if (!isEmbedded) {
        API.fetchDevToolsUrl()
            .then((devtoolsUrl) => {
                url.val = devtoolsUrl;
            })
            .catch((e) => {
                error.val = e.message;
            });
    }

    // Each press starts clean, and only the latest press says why it failed: an older one answering late stays quiet.
    let presses = 0;
    const press = async (open, failure) => {
        const mine = ++presses;
        error.val = "";
        try {
            await open();
        } catch (e) {
            if (mine === presses) error.val = `${failure}: ${e.message}`;
        }
    };
    const openUrl = (target) =>
        IS_ELECTRON ? API.openExternalUrl(target) : window.open(target, "_blank", "noopener,noreferrer");
    const openDevTools = () => press(async () => openUrl(await API.fetchDevToolsUrl()), "Couldn't open DevTools");
    const openWebUi = () => press(() => openUrl(webUiUrl), "Couldn't open the Web UI");

    // Inside the game DevTools would crash it, so it opens in a window of its own.
    const renderEmbeddedView = () =>
        div(
            { class: "devtools-away" },
            p({ class: "devtools-away__line" }, "DevTools can't open inside the game. Open it in its own window."),
            div(
                { class: "devtools-away__actions" },
                button({ type: "button", class: "btn-main", onclick: openDevTools }, "Open DevTools"),
                button({ type: "button", class: "btn-quiet", onclick: openWebUi }, "Open Web UI")
            ),
            p({ class: "devtools-away__error", role: "alert", hidden: () => !error.val }, () => error.val)
        );

    const renderContent = () => {
        if (isEmbedded) return renderEmbeddedView();
        if (error.val) return EmptyState({ failed: true, title: "Couldn't open DevTools", subtitle: error.val });
        if (!url.val) return div({ class: "account-loader" }, Loader({ text: "Connecting to the game" }));
        return iframe({ id: "devtools-iframe", class: "devtools-frame", title: "DevTools", src: url.val });
    };

    return div(
        { id: "devtools-tab", class: "tab-pane account-tab-layout" },
        div(
            { class: "account-sub-tab-content" },
            div(
                { class: "account-sub-tab-pane active devtools-page" },
                AccountTabHeader({
                    title: "DevTools",
                    description: "Chrome's DevTools on the running game: its console, code and memory.",
                }),
                div({ class: "devtools-body" }, renderContent)
            )
        )
    );
};
