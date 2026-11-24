import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { inMap } from "./engine.js";

let purchases = 0,
    harvested = 0,
    digBatches = 0;
let lastPurchase = "None";
export const getGamingSettings = () => ({
    autoHarvest: cheatConfig.automation.gamingAutoHarvest,
    autoDig: cheatConfig.automation.gamingAutoDig,
    autoBuy: cheatConfig.automation.gamingAutoBuy,
    fertilizerValue: cheatConfig.automation.gamingFertilizerValue,
    fertilizerSpeed: cheatConfig.automation.gamingFertilizerSpeed,
    fertilizerCapacity: cheatConfig.automation.gamingFertilizerCapacity,
    mutation: cheatConfig.automation.gamingMutation,
    imports: [0, 1, 2, 3, 4, 5, 7, 8].filter((id) => cheatConfig.automation[`gamingImport${id}`]),
    growthStopSeconds: cheatConfig.automation.gamingGrowthStopSeconds,
    purchaseBatch: cheatConfig.automation.gamingPurchaseBatch,
    nuggetBiasEnabled: cheatConfig.automation.gamingNuggetBiasEnabled,
    nuggetBias: cheatConfig.automation.gamingNuggetBias,
    hideEffects: cheatConfig.automation.gamingHideEffects,
});
const gaming = (name, index = 0) => events(579)._customBlock_GamingStatType(name, index, 0);
const unlocked = (id) => String(gga.Gaming[6]).includes(String(gga.Number2Letter[id]));

function getStation() {
    if (gga.MenuType2 !== 45) return null;
    const station = gga.PixelHelperActor[23]?.behaviors.getBehavior("ActorEvents_577");
    return station?._UIinventory13On[37] === 1 ? station : null;
}

function growthSeconds() {
    return gaming("SproutGrowthTime") / gaming("SproutGrowthCHANCE", -1);
}

// These are the native shovel readiness/count expressions, including rounding.
function availableNuggets() {
    if (!unlocked(1)) return 0;
    const base = Math.floor(Math.pow(Number(gga.GamingSprout[26][1]) / 3600, 0.44));
    return Math.round(
        base *
            (1 +
                (25 * events(579)._customBlock_RandomEvent("FractalIslandBonus", 4, 999) +
                    events(189)._customBlock_GetBribeBonus("37") +
                    events(345)._customBlock_ArcadeBonus(31)) /
                    100) *
            (1 + events(579)._customBlock_Summoning("VotingBonusz", 22, 0) / 100)
    );
}

function trigger(station, text, method) {
    const previous = station._TRIGGEREDtext;
    try {
        station._TRIGGEREDtext = text;
        station[method]();
    } finally {
        station._TRIGGEREDtext = previous;
    }
}

function cheapestUpgrade() {
    const settings = getGamingSettings();
    const choices = [];
    const add = (name, cost, read, write) => {
        cost = Number(cost);
        const level = Number(read());
        if (
            Number.isFinite(cost) &&
            cost >= 0 &&
            cost <= Number(gga.Gaming[0]) &&
            Number.isSafeInteger(level) &&
            level >= 0 &&
            level < Number.MAX_SAFE_INTEGER
        )
            choices.push({ name, cost, level, read, write });
    };
    for (const [index, enabled, name] of [
        [0, settings.fertilizerValue, "Fertilizer: bit value"],
        [1, settings.fertilizerSpeed, "Fertilizer: growth speed"],
        [2, settings.fertilizerCapacity, "Fertilizer: capacity"],
    ]) {
        if (!enabled || (index === 2 && gaming("SproutCapacity") >= 24)) continue;
        if (index === 1 && settings.growthStopSeconds > 0 && growthSeconds() <= settings.growthStopSeconds) continue;
        add(
            name,
            gaming("FertilizerUpgCosts", index),
            () => gga.Gaming[index + 1],
            (value) => {
                gga.Gaming[index + 1] = value;
            }
        );
    }
    if (settings.mutation && Number(gga.Lv0[15]) >= gaming("LVreq", 1))
        add(
            "Mutation chance",
            gaming("MutateUpgCosts"),
            () => gga.Gaming[7],
            (value) => {
                gga.Gaming[7] = value;
            }
        );
    for (const id of settings.imports) {
        if (!unlocked(id) || Number(gga.Lv0[15]) < gaming("LVreq", 2)) continue;
        const row = gga.GamingSprout[25 + id];
        const name = String(cList.RandoListo2[1][id]).replace(/_/g, " ");
        add(
            name,
            gaming("ImportItemCOST", id),
            () => row[0],
            (value) => {
                row[0] = value;
            }
        );
    }
    choices.sort((a, b) => a.cost - b.cost);
    return choices[0];
}

function buyUpgrades() {
    const settings = getGamingSettings();
    const deadline = performance.now() + 8;
    for (let count = 0; count < settings.purchaseBatch && performance.now() < deadline; count++) {
        const next = cheapestUpgrade();
        if (!next) break;
        // Native purchase handlers are mouse-bound; use their exact debit and +1 writes.
        // Recompute the native cost and all eligibility on every iteration, never bulk-price.
        gga.Gaming[0] = Number(gga.Gaming[0]) - next.cost;
        next.write(next.level + 1);
        if (Number(next.read()) !== next.level + 1) throw new Error(`Could not upgrade ${next.name}.`);
        purchases++;
        lastPurchase = next.name;
    }
}

export function startGaming() {
    purchases = harvested = digBatches = 0;
    lastPurchase = "None";
}

export function runGaming() {
    if (!inMap()) return;
    const settings = getGamingSettings();
    if (!Number.isInteger(settings.purchaseBatch) || settings.purchaseBatch < 0 || settings.purchaseBatch > 500)
        throw new Error("Purchases per tick must be 0 to 500.");
    if (settings.autoBuy) buyUpgrades();
    const station = getStation();
    if (!station) return;
    const capacity = gaming("SproutCapacity");
    const rows = gga.GamingSprout.slice(0, capacity);
    if (settings.autoHarvest && rows.length === capacity && rows.every((row) => Number(row[1]) > 0)) {
        for (let index = 0; index < capacity; index++) {
            if (Number(gga.GamingSprout[index][1]) <= 0) continue;
            trigger(station, `z${index}`, "_customEvent_GardenETC");
            harvested++;
        }
    }
    if (settings.autoDig && availableNuggets() > 0) {
        station._GenINFO[43][1] = 0;
        trigger(station, "j1", "_customEvent_W5stuffzz");
        digBatches++;
    }
}

export function gamingStatus() {
    if (!inMap()) return "Waiting for a character";
    const activity = getStation() ? "Running" : "Open Gaming for harvesting and digging";
    return `${activity}; ${harvested} harvested, ${digBatches} digs, ${purchases} upgrades; last: ${lastPurchase}`;
}
