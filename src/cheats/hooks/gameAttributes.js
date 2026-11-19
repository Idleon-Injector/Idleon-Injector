/**
 * Game attribute hooks
 *
 * - Gems (freeze gems)
 * - HP (infinite health)
 * - Values map (free revives)
 * - W5: gaming snail mail, divinity unlinks, rift unlock, blinding lantern
 * - Currencies (teleports, tickets, obol fragments, silver pens)
 * - Cloud save (pause cloud saving)
 * - Monster respawn time
 * - Options list account (unban, event items, minigames, quick ref, etc.)
 * - Alchemy (vial attempts)
 *
 * gameAttributes.h is rebuilt at character select; the core hooks the new one then.
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { cList, events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { applyMaxCap } from "../helpers/values.js";

// Gems - freeze when enabled
defineHook(
    { id: "wide.gems", target: () => gga, property: "GemsOwned" },
    { set: (value, stored) => (cheatState.wide.gems ? stored : value) }
);

// HP - always the max HP when enabled
defineHook(
    { id: "godlike.hp", target: () => gga, property: "PlayerHP" },
    { set: (value) => (cheatState.godlike.hp ? events(12)._customBlock_PlayerHPmax() : value) }
);

// Free revives
defineHook(
    { id: "unlock.revive", target: () => gga.PersonalValuesMap.h, property: "InstaRevives" },
    {
        get: (stored) => (cheatState.unlock.revive ? 10 : stored),
        set: (value, stored) => (cheatState.unlock.revive ? stored : value),
    }
);

// Gaming - snail mail (W5)
defineHook(
    { id: "w5.gaming", target: () => gga.Gaming, property: 13 },
    {
        get(stored) {
            if (cheatState.w5.gaming && cheatConfig.w5.gaming.SnailMail) {
                return cheatConfig.w5.gaming.SnailMail;
            }
            return stored;
        },
    }
);

// Divinity - unlinks (W5)
defineHook(
    { id: "w5.divinity", target: () => gga.Divinity, property: 38 },
    { get: (stored) => (cheatState.w5.divinity && cheatConfig.w5.divinity.unlinks ? 1 : stored) }
);

// Rift - unlock (W5)
defineHook(
    { id: "unlock.rifts", target: () => gga.Rift, property: 1 },
    {
        get(stored) {
            const riftIndex = gga.Rift[0];
            if (cheatState.unlock.rifts && cList.RiftStuff[4][riftIndex] !== 9) {
                return 1e8;
            }
            return stored;
        },
    }
);

// Holes - Blinding Lantern daily use cap (W5). The item refuses once this reaches 12, so reading 0 keeps the gate open.
defineHook(
    { id: "w5.lantern", target: () => gga.Holes[11], property: 84 },
    { get: (stored) => (cheatState.w5.lantern ? 0 : stored) }
);

// Currencies - teleports, tickets, obol fragments, silver pens
defineHook(
    {
        id: "unlock.teleports, unlock.tickets, unlock.obolfrag, unlock.silvpen",
        target: () => gga.CurrenciesOwned,
        property: "h",
        proxy: true,
    },
    {
        get(obj, prop) {
            if (cheatState.unlock.teleports && prop === "WorldTeleports") return obj.WorldTeleports || 1;
            if (cheatState.unlock.tickets && prop === "ColosseumTickets") return obj.ColosseumTickets || 1;
            if (cheatState.unlock.obolfrag && prop === "ObolFragments") return obj.ObolFragments || 9001;
            if (cheatState.unlock.silvpen && prop === "SilverPens") return obj.SilverPens || 1;
            return obj[prop];
        },
        set(obj, prop, value) {
            if (cheatState.unlock.teleports && prop === "WorldTeleports") return true;
            if (cheatState.unlock.tickets && prop === "ColosseumTickets") {
                if (obj.ColosseumTickets < value) obj.ColosseumTickets = value;
                return true;
            }
            if (cheatState.unlock.silvpen && prop === "SilverPens") {
                if (obj.SilverPens < value) obj.SilverPens = value;
                return true;
            }
            if (cheatState.unlock.obolfrag && prop === "ObolFragments") {
                if (obj.ObolFragments < value) obj.ObolFragments = value;
                return true;
            }
            obj[prop] = value;
            return true;
        },
    }
);

// Cloud save cooldown - pause cloud saving
defineHook(
    { id: "cloudz", target: () => gga, property: "CloudSaveCD", proxy: true },
    {
        get(obj, prop) {
            if (typeof prop === "symbol") return Reflect.get(obj, prop);
            if (cheatState.cloudz && Number(prop) === 0) return 235;
            return Reflect.get(obj, prop);
        },
        set(obj, prop, value) {
            if (cheatState.cloudz && Number(prop) === 0) {
                obj[0] = 235;
                return true;
            }
            return Reflect.set(obj, prop, value);
        },
    }
);

// Monster respawn time - intercept the array's element writes
defineHook(
    { id: "godlike.respawn", target: () => gga, property: "MonsterRespawnTime", proxy: true },
    {
        set(target, prop, value) {
            target[prop] = cheatState.godlike.respawn ? cheatConfig.godlike.respawn(value) : value;
            return true;
        },
    }
);

// Options list account - toggles, unlocks, and caps
defineHook(
    {
        id: "unban, wide.eventitems, minigames, unlock.quickref, w4.spiceclaim, w4.arena, w2.boss, wide.eventspins, w6.emperor, w5.skillcaverns, w3.jeweledcogs, maxval",
        target: () => gga,
        property: "OptionsListAccount",
        proxy: true,
    },
    {
        get(obj, prop) {
            // Pass through Symbol properties (needed for iteration/serialization)
            if (typeof prop === "symbol") {
                return obj[prop];
            }

            const index = Number(prop);

            // Toggle cheats - return fixed value when enabled
            if (cheatState.unban && index === 26) return 0;
            if (cheatState.wide.eventitems && index === 29) return 0;
            if (cheatState.minigames && index === 33) return 1;
            if (cheatState.unlock.quickref && index === 34) return 0;
            if (cheatState.w4.spiceclaim && index === 100) return 0;
            if (cheatState.w4.arena && index === 88) return 1;
            if (cheatState.w2.boss && index === 185 && obj[prop] === 10) return 0;

            if (cheatState.wide.eventspins && index === 325) return 10;
            if (cheatState.w6.emperor && index === 370) return -10;
            if (cheatState.w5.skillcaverns && index === 318) return 0;
            if (cheatState.w3.jeweledcogs && index === 414) return 0;

            // Clamp capped values on read to prevent cloud-loaded Infinity/NaN
            if (index === 71 || index === 72) return applyMaxCap(obj[prop], "creditcap", true);
            if (index === 73) return applyMaxCap(obj[prop], "flurbocap", true);
            if (index === 329) return applyMaxCap(obj[prop], "totalbones", true);
            if (index >= 330 && index <= 333) return applyMaxCap(obj[prop], "bones", true);
            if (index >= 357 && index <= 361) return applyMaxCap(obj[prop], "dust", true);
            if (index === 362) return applyMaxCap(obj[prop], "totaldust", true);
            if (index >= 388 && index <= 393) return applyMaxCap(obj[prop], "tach", true);
            if (index === 394) return applyMaxCap(obj[prop], "totaltach", true);

            return obj[prop];
        },
        set(obj, prop, value) {
            const index = Number(prop);

            // Toggle cheats - block writes when enabled
            if (cheatState.unban && index === 26) return true;
            if (cheatState.wide.eventitems && index === 29) return true;
            if (cheatState.minigames && index === 33) return true;
            if (cheatState.unlock.quickref && index === 34) return true;
            if (cheatState.w4.spiceclaim && index === 100) return true;
            if (cheatState.w4.arena && index === 88) return true;
            if (cheatState.wide.eventspins && index === 325) return true;

            if (cheatState.w6.emperor && index === 370) return true;
            if (cheatState.w5.skillcaverns && index === 318) return true;
            if (cheatState.w3.jeweledcogs && index === 414) return true;

            // Credit/flurbo caps
            if (index === 71 || index === 72) {
                obj[prop] = applyMaxCap(value, "creditcap");
                return true;
            }
            if (index === 73) {
                obj[prop] = applyMaxCap(value, "flurbocap");
                return true;
            }

            // Bones caps
            if (index === 329) {
                obj[prop] = applyMaxCap(value, "totalbones", true);
                return true;
            }
            if (index >= 330 && index <= 333) {
                obj[prop] = applyMaxCap(value, "bones", true);
                return true;
            }

            // Dust caps
            if (index >= 357 && index <= 361) {
                obj[prop] = applyMaxCap(value, "dust", true);
                return true;
            }
            if (index === 362) {
                obj[prop] = applyMaxCap(value, "totaldust", true);
                return true;
            }

            // Tach caps
            if (index >= 388 && index <= 393) {
                obj[prop] = applyMaxCap(value, "tach", true);
                return true;
            }
            if (index === 394) {
                obj[prop] = applyMaxCap(value, "totaltach", true);
                return true;
            }

            obj[prop] = value;
            return true;
        },
    }
);

// Alchemy (vial attempts)
defineHook(
    { id: "w2.vialattempt", target: () => gga.CauldronP2W[5], property: 0 },
    {
        get(stored) {
            return cheatState.w2.vialattempt ? this[1] : stored;
        },
        set: (value, stored) => (cheatState.w2.vialattempt ? stored : value),
    }
);
