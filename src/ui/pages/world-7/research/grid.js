/**
 * W7 - Research: Grid
 *
 * The game's research board, its squares where the game puts them, each showing its level. A square picked opens its
 * row under the board, in the same panel (the cog board's way, #251): its bonus first, its level up to its max. The
 * same square again or Escape closes it.
 *
 * Data sources:
 *   gga.Research[0][n]             - square n's level
 *   cList.ResGridSquares[n]        - [0] name, [1] max level (-1 for a square not in use), [5] bonus
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { createBoardEditor } from "../../../components/views/account/components/BoardEditor.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { bonusText, cleanName, toInt } from "../../../components/views/account/accountShared.js";

const { div, button, span } = van.tags;

const GRID_WIDTH = 20;
const GRID_HEIGHT = 12;
const GRID_TILE_COUNT = GRID_WIDTH * GRID_HEIGHT;

const isRenderableGridName = (name) => name.trim().toLowerCase() !== "name";
// What a square does: its first line, without the number the game works out from its level and shape.
const squareBonus = (raw) => bonusText(String(raw ?? "").split(/(?<=[.!?])_|_@_/)[0]);
const getTileFillPercent = (level, maxLevel) => {
    if (maxLevel <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(level) / Number(maxLevel)) * 100));
};

// A square: its level where the game puts it, a faint wash rising with it. A square not in use can't be picked.
const GridTile = ({ index, tileState, editor }) =>
    button(
        {
            ...editor.squareProps(index),
            class: () =>
                [
                    "research-grid-tile",
                    tileState.maxLevel.val < 0 && "research-grid-tile--inactive",
                    editor.picked.val === index && "research-grid-tile--selected",
                ]
                    .filter(Boolean)
                    .join(" "),
            disabled: () => tileState.maxLevel.val < 0,
            "aria-label": () => `${tileState.name.val}, level ${tileState.level.val} of ${tileState.maxLevel.val}`,
            style: () => `--research-column: ${tileState.gridColumn.val}; --research-row: ${tileState.gridRow.val};`,
        },
        div({
            class: "research-grid-tile__fill",
            style: () => `--research-fill: ${getTileFillPercent(tileState.level.val, tileState.maxLevel.val)}%;`,
        }),
        span({ class: "research-grid-tile__level" }, () =>
            tileState.maxLevel.val >= 0 ? String(tileState.level.val) : ""
        )
    );

const GridTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Research Grid" });
    const SquareRow = (index) => {
        const tile = gridStates[index];
        return ClampedLevelRow({
            valueState: tile.level,
            writePath: `Research[0][${index}]`,
            max: () => tile.maxLevel.val,
            integerMode: "round",
            // Its bonus first, the name under it; a square without its own words shows its name alone.
            renderInfo: () =>
                tile.description.val && tile.description.val !== tile.name.val
                    ? RowTitles({ bonus: tile.description.val, name: tile.name.val })
                    : span({ class: "account-row__name" }, tile.name.val),
            maxAction: true,
        });
    };

    const gridStates = Array.from({ length: GRID_TILE_COUNT }, () => ({
        name: van.state(""),
        description: van.state(""),
        level: van.state(0),
        maxLevel: van.state(-1),
        gridColumn: van.state(0),
        gridRow: van.state(0),
        renderable: van.state(false),
    }));
    const visibleTileIndexes = van.state([]);
    const visibleColumnCount = van.state(0);
    const visibleRowCount = van.state(0);

    const editor = createBoardEditor({
        id: "research-grid-editor",
        title: (index) => `Square ${index + 1}`,
        row: SquareRow,
    });

    const load = async () =>
        run(async () => {
            const [rawLevels, rawSquares] = await Promise.all([
                gga("Research[0]"),
                gga("CustomLists.h.ResGridSquares").catch(() => gga("CustomLists.ResGridSquares")),
            ]);

            const levels = toIndexedArray(rawLevels);
            const squares = toIndexedArray(rawSquares);
            const usedColumns = new Set();
            const usedRows = new Set();
            const nextVisibleTileIndexes = [];

            for (let index = 0; index < GRID_TILE_COUNT; index++) {
                const tile = gridStates[index];
                const square = toIndexedArray(squares[index]);
                const maxLevel = Math.round(Number(square[1] ?? -1));
                const level = maxLevel >= 0 ? toInt(levels[index], { min: 0 }) : 0;
                const x = index % GRID_WIDTH;
                const y = Math.floor(index / GRID_WIDTH);
                const name = cleanName(square[0], `Grid Tile ${index + 1}`);
                const renderable = Boolean(square[0]) && isRenderableGridName(name);

                tile.name.val = name;
                tile.description.val = squareBonus(square[5]);
                tile.maxLevel.val = Number.isFinite(maxLevel) ? maxLevel : -1;
                tile.level.val = level;
                tile.gridColumn.val = 0;
                tile.gridRow.val = 0;
                tile.renderable.val = renderable;

                if (tile.renderable.val) {
                    usedColumns.add(x);
                    usedRows.add(y);
                    nextVisibleTileIndexes.push(index);
                }
            }

            const columnMap = new Map(
                [...usedColumns].sort((a, b) => a - b).map((column, order) => [column, order + 1])
            );
            const rowMap = new Map([...usedRows].sort((a, b) => a - b).map((row, order) => [row, order + 1]));

            for (const index of nextVisibleTileIndexes) {
                const x = index % GRID_WIDTH;
                const y = Math.floor(index / GRID_WIDTH);
                gridStates[index].gridColumn.val = columnMap.get(x) ?? 0;
                gridStates[index].gridRow.val = rowMap.get(y) ?? 0;
            }

            visibleTileIndexes.val = nextVisibleTileIndexes;
            visibleColumnCount.val = columnMap.size;
            visibleRowCount.val = rowMap.size;

            if (editor.picked.val !== null && gridStates[editor.picked.val].maxLevel.val < 0) editor.close();
        });

    load();

    const board = div({ class: "research-grid-board-wrap" }, () =>
        visibleTileIndexes.val.length === 0
            ? EmptyState({ title: "No squares in use yet" })
            : div(
                  {
                      class: "research-grid-board",
                      style: `--research-columns: ${visibleColumnCount.val}; --research-rows: ${visibleRowCount.val};`,
                  },
                  ...visibleTileIndexes.val.map((index) => GridTile({ index, tileState: gridStates[index], editor }))
              )
    );
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Grid",
        description: "The research board. Pick a square to set its level.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the research grid",
        errorTitle: "Couldn't read the research grid",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, ListPanel({ body: editor.wrap(board) })),
    });
};

export default definePage({
    id: "w7.research.grid",
    world: 7,
    system: "Research",
    tab: "Grid",
    description: "All 240 research squares; pick one to see it and set its level.",
    keywords: ["Research Grid", "Squares"],
    component: GridTab,
});
