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
};
