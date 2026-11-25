import van from "../vendor/van-1.6.0.js";

const { svg, path, circle, line, rect, polygon, text: svgText } = van.tags("http://www.w3.org/2000/svg");

const SvgBase = (content, props = {}) => {
    const { class: className, ...rest } = props;
    const classes = ["icon-base", className].filter(Boolean).join(" ");

    return svg(
        {
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            width: "1em",
            height: "1em",
            class: classes,
            ...rest,
        },
        content
    );
};

export const Icons = {
    /*
     * The icon set (DESIGN.md): lines and dots, round ends and joins, no frames. Marks you act on are 2.4, outlines
     * 2.0, the warning mark 2.8. Everything else is a word, or nothing.
     */
    Check: (props) =>
        SvgBase(path({ d: "M5.5 12.6 8.7 15.8Q9.7 16.8 10.6 15.7L18.5 7.4", "stroke-width": "2.4" }), {
            "aria-hidden": "true",
            ...props,
        }),

    Undo: (props) =>
        SvgBase(
            [
                path({ d: "M10 16.5H14a4.5 4.5 0 0 0 0-9H7.6", "stroke-width": "2.4" }),
                path({ d: "M3.9 7.5 7.6 5V10Z", fill: "currentColor", "stroke-width": "1.4" }),
            ],
            { "aria-hidden": "true", ...props }
        ),

    Settings: (props) =>
        SvgBase(
            [
                path({ d: "M4.5 8h2.3M12 8h7.5M4.5 16h7.9M17.6 16h1.9" }),
                circle({ cx: "9.4", cy: "8", r: "2.6" }),
                circle({ cx: "15", cy: "16", r: "2.6" }),
            ],
            { "aria-hidden": "true", ...props }
        ),

    Warning: (props) =>
        SvgBase(
            [
                path({ d: "M12 5.5v8.6", "stroke-width": "2.8" }),
                circle({ cx: "12", cy: "18.4", r: "1.75", fill: "currentColor", stroke: "none" }),
            ],
            { "aria-hidden": "true", ...props }
        ),

    Search: (props) =>
        SvgBase(
            [circle({ cx: "10.6", cy: "10.6", r: "5.2" }), path({ d: "M14.6 14.6 17.8 17.8", "stroke-width": "2.4" })],
            { "aria-hidden": "true", ...props }
        ),

    Close: (props) =>
        SvgBase(path({ d: "M8.5 8.5l7 7M15.5 8.5l-7 7", "stroke-width": "2.4" }), { "aria-hidden": "true", ...props }),

    Minus: (props) => SvgBase(path({ d: "M7.5 12h9", "stroke-width": "2.4" }), { "aria-hidden": "true", ...props }),

    Plus: (props) =>
        SvgBase(path({ d: "M12 7.5v9M7.5 12h9", "stroke-width": "2.4" }), { "aria-hidden": "true", ...props }),

    /** Goes to another place (a system's page to its automation page): the plus's weight, a soft head. */
    Arrow: (props) =>
        SvgBase(path({ d: "M7 12h10M13 8l4 4-4 4", "stroke-width": "2.2" }), { "aria-hidden": "true", ...props }),

    /** One soft bend for a group that opens and closes; `dir` turns it ("down", "right", "up", "left"). */
    Chevron: ({ dir = "down", ...props } = {}) =>
        SvgBase(
            path({
                d: "M7.5 10 10.6 13.1Q12 14.5 13.4 13.1L16.5 10",
                "stroke-width": "2.4",
                transform: `rotate(${{ down: 0, left: 90, up: 180, right: -90 }[dir]} 12 12)`,
            }),
            { "aria-hidden": "true", ...props }
        ),

    /** Soft, rounded points. An outline at rest; a favourite fills it (CSS `fill: currentColor` on `.icon-star`). */
    Star: ({ class: className, ...props } = {}) =>
        SvgBase(
            path({
                d: "M12.79 6.31L13.88 8.72Q14.29 9.63 15.29 9.74L17.91 10.04Q19.8 10.25 18.4 11.53L16.45 13.31Q15.71 13.99 15.91 14.97L16.44 17.56Q16.82 19.42 15.17 18.48L12.87 17.18Q12 16.68 11.13 17.18L8.83 18.48Q7.18 19.42 7.56 17.56L8.09 14.97Q8.29 13.99 7.55 13.31L5.6 11.53Q4.2 10.25 6.09 10.04L8.71 9.74Q9.71 9.63 10.12 8.72L11.21 6.31Q12 4.58 12.79 6.31Z",
            }),
            { "aria-hidden": "true", class: ["icon-star", className].filter(Boolean).join(" "), ...props }
        ),

    Copy: (props) =>
        SvgBase(
            [
                rect({ x: "9.5", y: "9.5", width: "9", height: "9", rx: "2.2" }),
                path({ d: "M6 14.5V8a2 2 0 0 1 2-2h6.5" }),
            ],
            { "aria-hidden": "true", ...props }
        ),

    // The brand and the game's own marks (Crown on Rat King, CardTier on Card Search) keep their drawings.
    GitHub: (props) =>
        SvgBase(
            path({
                d: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z",
            }),
            { fill: "currentColor", width: "18", height: "18", stroke: "none", "aria-hidden": "true", ...props }
        ),

    CardTier: (tier, props = {}) => {
        const label = Math.min(6, Math.max(1, Math.round(Number(tier) || 1)));

        return SvgBase(
            [
                polygon({ points: "12 1.75 20.88 6.88 20.88 17.12 12 22.25 3.12 17.12 3.12 6.88" }),
                svgText(
                    {
                        x: "12",
                        y: "12.5",
                        fill: "currentColor",
                        stroke: "none",
                        "text-anchor": "middle",
                        "dominant-baseline": "middle",
                        "font-family": "sans-serif",
                        "font-size": "10",
                        "font-weight": "700",
                    },
                    String(label)
                ),
            ],
            { "stroke-width": "1.75", "aria-hidden": "true", ...props }
        );
    },

    Crown: (props) =>
        SvgBase([path({ d: "m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" }), line({ x1: "5", y1: "20", x2: "19", y2: "20" })], {
            "stroke-width": "2",
            "aria-hidden": "true",
            ...props,
        }),

    /**
     * A system's own line drawing (the sidebar's lists, the page title), or null when it has none yet. Thinner
     * than the controls' icons: these name a place, they aren't pressed.
     */
    System: ({ name, ...props } = {}) => {
        const key = Object.keys(SYSTEM_ICONS).find((k) => k.toLowerCase() === String(name).toLowerCase());
        const parts = key && SYSTEM_ICONS[key];
        if (!parts) return null;
        return SvgBase(
            parts.map((part) =>
                Array.isArray(part)
                    ? circle({ cx: part[0], cy: part[1], r: part[2] })
                    : typeof part === "string"
                      ? path({ d: part })
                      : path({ d: part.d, transform: part.t })
            ),
            { "stroke-width": "1.7", "aria-hidden": "true", ...props }
        );
    },

    /** The mark in a list's icon column for a system that has no drawing yet. */
    Waypoint: (props) =>
        SvgBase(path({ d: "M12 8.5 15.5 12 12 15.5 8.5 12z" }), {
            "stroke-width": "1.7",
            "aria-hidden": "true",
            ...props,
        }),
};

// Drawn on the 24 grid: a string is a path, [cx, cy, r] a circle, { d, t } a turned path.
const ELLIPSE = "M3 12a9 3.6 0 1 0 18 0 9 3.6 0 1 0-18 0z";
const SYSTEM_ICONS = {
    Home: ["M4 10.5 12 4l8 6.5", "M6 9v10.5h4.5V15h3v4.5H18V9"],
    // Every cheat not on a page: a game controller, its cross and two buttons.
    Cheats: [
        "M8 7h8a5 5 0 0 1 4.9 4l.8 4.4a2.35 2.35 0 0 1-4.1 2L15.4 15H8.6l-2.2 2.4a2.35 2.35 0 0 1-4.1-2L3.1 11A5 5 0 0 1 8 7z",
        "M8.4 9.4v3.2M6.8 11h3.2",
        "M14.4 12.1h.01M16.8 9.9h.01",
    ],
    // A copy of the save at each cloud save (History): a clock whose hand runs back.
    "Save copies": ["M4 12a8 8 0 1 0 2.35-5.65L4 8.7", "M4 4.5v4.2h4.2", "M12 8v4.2l2.9 1.8"],
    // Work that repeats (the glossary's automation): two arrows chasing each other round a loop.
    Automation: [
        "M16.5 3.5 19.5 6.5l-3 3",
        "M4.5 11.5v-1a4 4 0 0 1 4-4h11",
        "M7.5 20.5l-3-3 3-3",
        "M19.5 12.5v1a4 4 0 0 1-4 4h-11",
    ],
    Stamps: [
        "M9.5 4.5a2.5 2.5 0 1 1 5 0c0 1.2-.8 1.8-1 2.8V10h-3V7.3c-.2-1-1-1.6-1-2.8z",
        "M5 13a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2H5z",
        "M6 19h12",
    ],
    Anvil: [
        "M3 6h13.5c.5 2.3 2.2 3.6 4.5 4H15a2 2 0 0 0-2 2v2h-2v-2a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z",
        "M8.5 18.5 10 14h4l1.5 4.5",
        "M6.5 18.5h11",
    ],
    Forge: [
        "M12 3.5c.6 2.6 4.5 4.6 4.5 9a4.5 4.5 0 0 1-9 0c0-2 .9-3.4 2-4.4.1 1.5.8 2.6 1.9 2.9-.4-2.6-.2-5.3.6-7.5z",
        "M5 20.5h14",
    ],
    Statues: [[12, 5.25, 2.25], "M9 15v-3.5a3 3 0 0 1 6 0V15", "M7 15h10v5.5H7z"],
    "Star Signs": ["M12 3.5l1.7 5.1 5.3 1.4-5.3 1.4L12 16.5l-1.7-5.1L5 10l5.3-1.4z", "M18.5 16.5v4M16.5 18.5h4"],
    Pets: [
        [6, 10.5, 1.7],
        [9.5, 6.5, 1.7],
        [14.5, 6.5, 1.7],
        [18, 10.5, 1.7],
        "M12 12c-2.8 0-5 3.1-5 5.2 0 1.6 1.3 2.3 2.6 2.3 1 0 1.6-.6 2.4-.6s1.4.6 2.4.6c1.3 0 2.6-.7 2.6-2.3 0-2.1-2.2-5.2-5-5.2z",
    ],
    Bribes: [
        "M5 7c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 8.4 5 7z",
        "M5 7v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7",
        "M5 12v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5",
    ],
    // World 2.
    Alchemy: [
        "M9.5 3.5h5",
        "M10.5 3.5v5.6a6.5 6.5 0 1 0 3 0V3.5",
        "M5.7 14.5h12.6",
        [10.3, 17.3, 1],
        [13.8, 16.6, 0.6],
    ],
    "Arcade Shop": [
        "M7 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 17 5v15.5",
        "M9.5 6.5h5v4h-5z",
        "M7 13.5h10",
        [12, 17, 1.3],
        "M5 20.5h14",
    ],
    "Post Office": [
        "M5 6h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 6z",
        "M4 7l8 6 8-6",
    ],
    Killroy: [
        "M12 3.5c-4 0-7 2.9-7 6.8 0 2.2 1 3.9 2.5 5V18a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-2.7c1.5-1.1 2.5-2.8 2.5-5 0-3.9-3-6.8-7-6.8z",
        [9.3, 10.5, 1.6],
        [14.7, 10.5, 1.6],
        "M10.5 19.5V17M13.5 19.5V17",
    ],
    Islands: [
        "M3 19.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0",
        "M6 16.5c1.6-2.1 3.6-3 6-3s4.4.9 6 3",
        "M12.5 13.5c-.2-3 .3-5.6 1.7-7.7",
        "M14.2 5.8C12.5 4.2 9.8 4 8 5.5M14.2 5.8c1.9-1.2 4.3-.9 5.8.6M14.2 5.8c.4 2 0 3.7-1.2 5",
    ],
    "Weekly Bosses": ["M4.5 4.5 15 15M13 17l4-4M16.5 16.5l3 3", "M19.5 4.5 9 15M7 13l4 4M7.5 16.5l-3 3"],
    // Account: a pointer and its click.
    Clickers: ["M9 8.5v11l2.8-2.6 2 4.4 2-.9-2-4.4h3.9z", "M9 3.5v2M4.5 8.5h2M5.8 4.8l1.4 1.4M12.2 4.8l-1.4 1.4"],
    Construction: ["M4 20.5V10l5-3v13.5", "M9 20.5V4.5l10 4.5v11.5", "M2.5 20.5h19", "M12.5 11h3M12.5 14h3M12.5 17h3"],
    "3D Printer": [
        "M7 8V3.5h10V8",
        "M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2",
        "M7 13.5h10v7H7z",
    ],
    Refinery: [
        "M9.5 3.5h5",
        "M10.5 3.5V9l-5.6 9.4a1.4 1.4 0 0 0 1.2 2.1h11.8a1.4 1.4 0 0 0 1.2-2.1L13.5 9V3.5",
        "M7.5 15h9",
    ],
    "Salt Lick": ["M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z", "M4.5 7.7 12 12l7.5-4.3", "M12 12v8.5"],
    "Atom Collider": [
        [12, 12, 1.6],
        ELLIPSE,
        { d: ELLIPSE, t: "rotate(60 12 12)" },
        { d: ELLIPSE, t: "rotate(-60 12 12)" },
    ],
    "Hat Rack": [
        "M7.5 15V6.5A1.5 1.5 0 0 1 9 5h6a1.5 1.5 0 0 1 1.5 1.5V15",
        "M7.5 11.5h9",
        "M3.5 15h17c0 2.2-1.8 4-4 4h-9c-2.2 0-4-1.8-4-4z",
    ],
    "Armor Smithy": ["M12 3.5 19 6v5.5c0 4.6-3 7.9-7 9-4-1.1-7-4.4-7-9V6z", "M12 3.5v17"],
    Worship: ["M8.5 20.5V8.5h7v12", "M6.5 20.5h11", "M8.5 12.5h7M8.5 16.5h7", "M12 3.5l2.5 2.5-2.5 2.5L9.5 6z"],
    Prayers: [
        "M9.5 10.5h5v10h-5z",
        "M12 3.5c1.2 1.6 1.8 2.7 1.8 3.7a1.8 1.8 0 0 1-3.6 0c0-1 .6-2.1 1.8-3.7z",
        "M7 20.5h10",
    ],
    "Death Note": [
        "M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z",
        "M8.5 3.5v17",
        "M12 8.5h4M12 11.5h4",
    ],
    Library: ["M3 5.5c3-1.2 6.2-.9 9 1 2.8-1.9 6-2.2 9-1v13c-3-1.2-6.2-.9-9 1-2.8-1.9-6-2.2-9-1z", "M12 6.5v13"],
    Equinox: [
        [12, 12, 4],
        "M12 8v8",
        "M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6",
    ],
    Traps: ["M5.5 20.5V10a6.5 6.5 0 0 1 13 0v10.5", "M3.5 20.5h17", "M9.5 20.5V4.5M14.5 20.5V4.5", "M5.5 14h13"],
    // World 4 (Lumi approved the six as drawn, 2026-11-22).
    Cooking: [
        "M5 11.5h14v5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 16.5z",
        "M3.5 11.5h17",
        "M10 4c-.9 1 .9 2.2 0 3.5M14 4c-.9 1 .9 2.2 0 3.5",
    ],
    Breeding: [
        "M12 3.5c3.2 0 6 4.8 6 9.2a6 6 0 0 1-12 0c0-4.4 2.8-9.2 6-9.2z",
        "M6.1 12.8l2.3-1.4 2.4 1.8 2.4-1.8 2.4 1.8 2.3-1.4",
    ],
    // The mainframe: three players joined by lines.
    Laboratory: [[12, 6, 2.2], [6, 17.5, 2.2], [18, 17.5, 2.2], "M10.8 7.9 7.2 15.6M13.2 7.9l3.6 7.7M8.2 17.5h7.6"],
    Rift: ["M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0"],
    Tome: [
        "M6.5 3.5H18.5v14H6.5A1.5 1.5 0 0 0 5 19V5a1.5 1.5 0 0 1 1.5-1.5z",
        "M5 19a1.5 1.5 0 0 0 1.5 1.5h12v-3",
        "M14.5 3.5v6l-1.5-1.2-1.5 1.2v-6",
    ],
    "Cape Vine": [
        "M6 20.5c0-4.5 3-6.5 6-8.5s5-4.5 5-8.5",
        "M11 12.6c-3 .6-5.6-.6-6.5-3.6 3-.6 5.6.6 6.5 3.6z",
        "M15.2 7.8c.4-3 2.4-4.6 5.3-4.5-.4 3-2.4 4.6-5.3 4.5z",
    ],
    // World 5 (Lumi: "Put all five in", 2026-11-22).
    // A sailboat: mast, mainsail, jib, and the hull on the water line.
    Sailing: ["M12 3.5v12", "M12.5 4.5l5.5 9.5h-5.5", "M10.5 7.5 6.5 14h4", "M3.5 16h17l-2.6 4H6.1z"],
    // A god: a halo over a head and shoulders.
    Divinity: ["M8 4.6a4 1.6 0 1 0 8 0 4 1.6 0 1 0-8 0z", [12, 11, 2.8], "M6 20.5a6 6 0 0 1 12 0"],
    // A game controller.
    Gaming: [
        "M7.2 8.5h9.6a4 4 0 0 1 3.9 4.8l-.9 4.2a2.1 2.1 0 0 1-3.6 1l-2.2-2.5h-4l-2.2 2.5a2.1 2.1 0 0 1-3.6-1l-.9-4.2a4 4 0 0 1 3.9-4.8z",
        "M8 11.3v3.4M6.3 13h3.4",
        [15.6, 12.1, 0.55],
        [17.4, 13.9, 0.55],
    ],
    // The Hole: a cave mouth with a ladder going down.
    Hole: [
        "M3.5 20.5h17",
        "M5.5 20.5V13a6.5 6.5 0 0 1 13 0v7.5",
        "M10.2 20.5v-7M13.8 20.5v-7",
        "M10.2 15.2h3.6M10.2 18h3.6",
    ],
    // The Slab: a cut stone tablet with its lines, on a base.
    Slab: ["M6 20.5V6l2.5-2.5h7L18 6v14.5", "M4.5 20.5h15", "M9 9h6M9 12.5h6M9 16h4"],
    // World 6 (Lumi: "put all five in", 2026-11-23).
    // A sprout on a tilled plot: two leaves on a stem, the soil's mound under it.
    Farming: [
        "M4.5 20.5c1.6-1.9 4.1-2.8 7.5-2.8s5.9.9 7.5 2.8",
        "M12 17.7V11",
        "M12 13.2c-3.1.3-5.3-1.2-6-4.3 3.1-.3 5.3 1.2 6 4.3z",
        "M12 11c.3-3.2 2.3-5.1 5.5-5.2-.3 3.2-2.3 5.1-5.5 5.2z",
    ],
    // A ninja's hooded head: the opening for the eyes with the eyes in it, the headband's two tails behind.
    Sneaking: [
        [12, 12.5, 7.5],
        "M8 10.5h8a2 2 0 0 1 0 4H8a2 2 0 0 1 0-4z",
        [10, 12.5, 0.7],
        [14, 12.5, 0.7],
        "M19.2 9.2l2.3-1.6M19.5 11l2.6.2",
    ],
    // A slime familiar, called up: the blob with its two eyes, a trail of sparks over it.
    Summoning: [
        "M4.5 18.3c0-4.7 3.3-8.6 7.5-8.6s7.5 3.9 7.5 8.6a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2z",
        [9.6, 15.2, 0.9],
        [14.4, 15.2, 0.9],
        [8.6, 6.4, 0.6],
        [12, 4.6, 0.6],
        [15.4, 6.4, 0.6],
    ],
    // The beanstalk: a stalk winding straight up, a leaf each way, on the ground.
    Beanstalk: [
        "M8 20.5h8",
        "M12 20.5c-2.2-2.4-2.2-4.6 0-7s2.2-4.6 0-7",
        "M11.2 15.5c-2.4.5-4.4-.4-5.4-2.6 2.4-.5 4.4.4 5.4 2.6z",
        "M12.8 9.5c2.4.5 4.4-.4 5.4-2.6-2.4-.5-4.4.4-5.4 2.6z",
    ],
    // The emperor's crown: three soft points over a band.
    Emperor: ["M5 17 3.8 8.2l4.6 3.6L12 5.5l3.6 6.3 4.6-3.6L19 17z", "M5 20.5h14", [12, 13.6, 0.9]],
    // Classes (Lumi: put all four in, 2026-11-23).
    // The Grimoire: a closed book held shut by a clasp, a small skull on its cover.
    Grimoire: [
        "M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z",
        "M19 10.5h-2v3h2",
        "M9 11.2a3 3 0 0 1 6 0c0 1.1-.5 1.8-1.2 2.2v1.3h-3.6v-1.3C9.5 13 9 12.3 9 11.2z",
        "M11 14.7v1M13 14.7v1",
    ],
    // The Compass: a ring with its needle across it.
    Compass: [[12, 12, 8.5], "M16 8 13.4 13.4 8 16l2.6-5.4z"],
    // The Tesseract: a cube in a cube, the corners joined.
    Tesseract: ["M4.5 4.5h15v15h-15z", "M9 9h6v6H9z", "M4.5 4.5 9 9M19.5 4.5 15 9M4.5 19.5 9 15M19.5 19.5 15 15"],
    // The Royal Armory: a knight's helm with its visor and crest.
    "Royal Armory": ["M6 20.5v-7.5a6 6 0 0 1 12 0v7.5z", "M6 13.5h12", "M9.5 16.5h5", "M12 7V3.5"],
};
