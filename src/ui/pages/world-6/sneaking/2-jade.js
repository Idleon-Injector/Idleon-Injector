import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    oneAtATime,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const JADE_BOUGHT_PATH = "Ninja[102][9]";

const toggleLetter = (encoded, letter, enabled) => {
    const current = String(encoded ?? "");
    if (enabled) return current.includes(letter) ? current : `${current}${letter}`;
    return current.replaceAll(letter, "");
};

// Every upgrade lives in one string, so flips save one at a time, each from the string the game holds now.
const inTurn = oneAtATime();

const JadeUpgradeRow = ({ entry, boughtState, encodedState }) => {
    const { status, run } = useWriteStatus();

    const writeToggle = (enabled) =>
        inTurn(() =>
            run(async () => {
                const nextEncoded = toggleLetter(String((await gga(JADE_BOUGHT_PATH)) ?? ""), entry.letter, enabled);
                await writeVerified(JADE_BOUGHT_PATH, nextEncoded);
                encodedState.val = nextEncoded;
                boughtState.val = enabled;
            })
        );

    return AccountRow({
        info: [
            span({ class: "account-row__index" }, `#${entry.index}`),
            div({ class: "account-row__name-group" }, span({ class: "account-row__name" }, entry.name)),
        ],
        rowClass: () => (boughtState.val ? "sneaking-toggle-row sneaking-toggle-row--enabled" : "sneaking-toggle-row"),
        status,
        controls: StateSwitch({
            checked: () => Boolean(boughtState.val),
            words: ["Bought", "Locked"],
            name: entry.name,
            title: "Jade Emporium upgrade",
            onFlip: writeToggle,
        }),
    });
};

const buildJadeEntries = (rawDefinitions, rawLetters, rawOrder, encoded) => {
    const definitions = toIndexedArray(rawDefinitions ?? []);
    const letters = toIndexedArray(rawLetters ?? []);
    return toIndexedArray(rawOrder ?? [])
        .map((rawIndex) => {
            const index = Number(rawIndex);
            const rawDefinition = definitions[index];
            const definition = toIndexedArray(rawDefinition ?? []);
            const rawName = String(definition[0] ?? "").trim();
            const letter = letters[index];
            if (!Number.isInteger(index) || !rawName || !letter) return null;

            return {
                index,
                rawName,
                name: cleanName(rawName, `Jade Upgrade ${index + 1}`),
                letter,
                bought: String(encoded ?? "").includes(letter),
            };
        })
        .filter(Boolean);
};

const JadeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Jade Emporium" });
    const entries = van.state([]);
    const boughtStates = new Map();
    const encodedState = van.state("");
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawEncoded, rawDefinitions, rawOrder, rawLetters] = await Promise.all([
                gga(JADE_BOUGHT_PATH),
                readCList("JadeUpg"),
                readCList("NinjaInfo[24]"),
                gga("Number2Letter"),
            ]);

            encodedState.val = String(rawEncoded ?? "");
            entries.val = buildJadeEntries(rawDefinitions, rawLetters, rawOrder, encodedState.val);
            reconcileRows(entries.val.map((entry) => `${entry.rawName}:${entry.letter}`).join("|"), () =>
                entries.val.map((entry) =>
                    JadeUpgradeRow({
                        entry,
                        boughtState: getOrCreateState(boughtStates, entry.index, false),
                        encodedState,
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(boughtStates, entry.index, false).val = entry.bought;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "JADE EMPORIUM",
            note: () =>
                `${entries.val.filter((entry) => getOrCreateState(boughtStates, entry.index, false).val).length} / ${
                    entries.val.length
                } BOUGHT`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "JADE",
        description: "Toggle Jade Emporium upgrades stored in Ninja[102][9] using Number2Letter encoding.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "READING JADE EMPORIUM",
        errorTitle: "JADE EMPORIUM READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w6.sneaking.jade",
    world: 6,
    system: "Sneaking",
    tab: "Jade",
    description: "Which Jade Emporium upgrades are bought.",
    keywords: ["Jade Emporium"],
    component: JadeTab,
});
