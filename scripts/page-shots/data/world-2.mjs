/** World 2: alchemy (bubbles, liquids, pay 2 win, vials, sigils), arcade, post office, killroy, weekly bosses. */
import { fakeName, h, level, list } from "./helpers.mjs";
import { MONSTERS } from "./shared.mjs";

const BUBBLES = 30;
const VIALS = 40;
const SIGILS = 24;
const ARCADE = 40;
const BOXES = 30;
const SKINS = 8;

const cauldronLevelMax = () => 150;

export default () => ({
    gga: {
        // [0-3] bubble levels per cauldron, [4] vial levels, [6] liquid amounts, [8][4+i][2|3][1] liquid upgrades.
        CauldronInfo: [
            ...list(4, (c) => list(BUBBLES, (i) => level(i + c, 200))),
            list(VIALS, (i) => level(i, 13)),
            [],
            [1200, 850, 300, 0],
            [],
            list(8, (c) => list(4, (u) => [0, (c * 5 + u * 3) % 40])),
        ],
        // [0] brewing cauldrons (3 per cauldron), [1] liquids (2 per liquid), [2] vials, [3] player boosts,
        // [4] sigils as [exp, tier] pairs.
        CauldronP2W: [
            list(12, (i) => (i * 11) % 120),
            list(8, (i) => (i * 7) % 80),
            [3, 0, 5],
            [2, 4],
            list(SIGILS, (i) => [i * 100, (i % 6) - 1]).flat(),
        ],
        ArcadeUpg: list(ARCADE, (i) => (i % 9 === 0 ? 101 : level(i, 100))),
        PostOfficeInfo: [[], [], [], list(BOXES, (i) => [level(i, 400), 0, 0])],
        CurrenciesOwned: h({ DeliveryBoxComplete: 640, DeliveryBoxStreak: 120 }),
        DNSM: h({ AlchVials: h({ BoxPoints: 25 }) }),
        KRbest: h(Object.fromEntries(MONSTERS.slice(0, 12).map((id, i) => [id, i * 250]))),
        // "UI_<letter>": skin unlocked; "set<character>": the skin that character wears.
        WeeklyBoss: h({
            ...Object.fromEntries(list(SKINS, (i) => [`UI_${"abcdefgh"[i]}`, i % 3 === 0 ? 0 : 1])),
            set0: "2",
            set1: "0",
        }),
        OptionsListAccount: {
            74: 340,
            75: 55,
            123: 3,
            131: 12,
            188: 14,
            189: 3200,
            324: 8,
            347: 30,
            384: "_0,_3,a1,",
            625: 4,
            626: 19,
            105: 1500,
            115: 0,
            204: 1200,
            205: 950,
            206: 1830,
        },
        CustomLists: {
            h: {
                // Bubbles per cauldron ([0] name, [10] 1 = big bubble), then [4] the vials.
                AlchemyDescription: [
                    ...list(4, (c) =>
                        list(BUBBLES, (i) => [
                            fakeName(i + c * 3),
                            "1",
                            "2",
                            "3",
                            "4",
                            "5",
                            "6",
                            "7",
                            "8",
                            "9",
                            i % 10 === 4 ? "1" : "0",
                        ])
                    ),
                    list(VIALS, (i) => [fakeName(i + 5).toUpperCase(), "1", "2", "3"]),
                ],
                SigilDesc: list(SIGILS, (i) => [fakeName(i + 2), "10", "20", "desc", "1"]),
                ArcadeShopInfo: list(ARCADE, (i) => [i === 7 ? "BLANK" : `+{%_${fakeName(i)}_bonus`, "1", "2"]),
                // [0] name, ..., [15] max points.
                PostOffUpgradeInfo: list(BOXES, (i) => [fakeName(i) + "_Box", ...list(14, () => "0"), String(400)]),
                // [0]: skins as [name, cost, ?, description].
                WeeklySHOP: [
                    list(SKINS, (i) => [
                        `${fakeName(i)}_Skin`,
                        String(10 * (i + 1)),
                        "0",
                        i % 2 ? "filler" : "A_fancy_bar_skin",
                    ]),
                ],
            },
        },
    },
    computed: { _customBlock_cauldronp2wbonuses: { CauldronLvMAX: cauldronLevelMax } },
});
