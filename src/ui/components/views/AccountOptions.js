/**
 * Account Options view (Advanced › Account Options): the raw OptionsListAccount editor,
 * in the same pane it had in the pre-3.0 Account view.
 */

import van from "../../vendor/van-1.6.0.js";
import { AccountOptionsTab } from "./account/AccountOptionsTab.js";

const { div } = van.tags;

export const AccountOptions = () =>
    div(
        { id: "account-options-tab", class: "tab-pane account-tab-layout" },
        div({ class: "account-sub-tab-content" }, div({ class: "account-sub-tab-pane active" }, AccountOptionsTab()))
    );
