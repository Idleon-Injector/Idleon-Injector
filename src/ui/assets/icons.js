import van from "../vendor/van-1.6.0.js";

const { svg, path, circle, line, rect, polygon, text: svgText, g, defs, mask } = van.tags("http://www.w3.org/2000/svg");

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
    Logo: (props) =>
        SvgBase(
            [
                defs(
                    mask({ id: "syringe-mask" }, [
                        path({
                            fill: "white",
                            d: "M108.66,15 L169.34,50 Q178,55 178,65 L178,135 Q178,145 169.34,150 L108.66,185 Q100,190 91.34,185 L30.66,150 Q22,145 22,135 L22,65 Q22,55 30.66,50 L91.34,15 Q100,10 108.66,15 Z",
                        }),
                        g({ fill: "none", stroke: "black", "stroke-width": "8", transform: "rotate(-45 100 100)" }, [
                            rect({
                                x: "85",
                                y: "60",
                                width: "30",
                                height: "80",
                                rx: "4",
                                fill: "black",
                                stroke: "none",
                            }),
                            line({ x1: "100", y1: "40", x2: "100", y2: "60" }),
                            line({ x1: "85", y1: "40", x2: "115", y2: "40" }),
                            line({ x1: "100", y1: "140", x2: "100", y2: "170" }),
                        ]),
                    ])
                ),
                rect({
                    x: "0",
                    y: "0",
                    width: "200",
                    height: "200",
                    mask: "url(#syringe-mask)",
                    fill: "currentColor",
                }),
            ],
            { viewBox: "0 0 200 200", stroke: "none", "stroke-width": "0", class: "icon-logo", ...props }
        ),

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
};
