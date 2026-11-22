import van from "../../../../vendor/van-1.6.0.js";
import { ActionButton } from "./ActionButton.js";
import { AccountRow } from "./AccountRow.js";
import { useWriteStatus } from "../accountShared.js";

const { div, span } = van.tags;

/**
 * Shared removable stored-item row used by collection-style account tabs. Remove takes the item off the list, so it
 * asks "Click again" first.
 */
export const RemovableStoredRow = ({
    index,
    primaryLabel,
    fallbackLabel,
    secondaryLabel,
    badge,
    rowClass = "",
    nameGroupClass = "",
    onRemove,
    isBusy = () => false,
}) => {
    const { status, run } = useWriteStatus();

    const removeRow = async () => {
        // `onRemove` resolves to { cancelled: true } when there was nothing to remove.
        await run(() => onRemove(index));
    };

    return AccountRow({
        rowClass,
        info: [
            span({ class: "account-row__index" }, `#${index + 1}`),
            div(
                { class: nameGroupClass },
                span({ class: "account-row__name" }, primaryLabel || fallbackLabel),
                secondaryLabel ? span({ class: "account-row__sub-label" }, secondaryLabel) : null
            ),
        ],
        badge,
        controls: ActionButton({
            label: "Remove",
            status,
            variant: "danger",
            disabled: () => isBusy(),
            confirm: `remove ${primaryLabel || fallbackLabel}.`,
            onClick: removeRow,
        }),
    });
};
