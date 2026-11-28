/**
 * The injector's own settings: the core half of config.js (the cheats' settings are in their defineCheat rows).
 *
 * Each setting is `{ default, description }`, or `{ example, description }` for one config.js only shows
 * commented out. After a change run `npm run config:generate`: it rewrites config.js and the WebUI's setting
 * descriptions, and npm run check fails until you do.
 */
module.exports = {
    startupCheats: [],
    cheatConfig: {
        unban: {
            default: true,
            description: "Prevents accounts from being banned. May not work due to multiple ban methods",
        },
        ingameUI: { default: true, description: "Enables the in-game UI overlay" },
        steamachieve: { default: true, description: "Allows unlocking Steam achievements" },
        chng_enabled: {
            default: false,
            description:
                "⚠ DANGER: If true, 'chng' command becomes available. ONLY enable if you know what you are doing!",
        },
        maxval: {
            bones: { default: 1e21, description: "Maximum limit for bones to prevent save corruption" },
            totalbones: { default: 1e22, description: "Maximum limit for total bones across all characters" },
            dust: { default: 1e21, description: "Maximum limit for dust to prevent save corruption" },
            totaldust: { default: 1e22, description: "Maximum limit for total dust across all characters" },
            tach: { default: 1e21, description: "Maximum limit for tachyon to prevent save corruption" },
            totaltach: { default: 1e22, description: "Maximum limit for total tachyon across all characters" },
            creditcap: { default: 10000000, description: "Maximum credit capacity for dungeons" },
            flurbocap: { default: 1000000, description: "Maximum flurbo capacity for dungeons" },
        },
    },
    injectorConfig: {
        logLevel: { default: "info", description: "Log verbosity level: debug, info, warn, or error" },
        injreg: {
            default: "\\w+\\.ApplicationMain\\s*?=",
            description: "Regex pattern used to find the injection point in the game code",
        },
        interceptPattern: { default: "*N.js", description: "Script filename pattern to intercept (N.js)" },
        enableUI: { default: true, description: "Enable/disable the webui" },
        webPort: { default: 8080, description: "Port for the webui" },
        onLinuxTimeout: { default: 60000, description: "Timeout in milliseconds for Linux-specific operations" },
        target: { default: "web", description: "Injection target platform (steam or web)" },
        webUrl: {
            default: "https://www.legendsofidleon.com/ytGl5oc/",
            description: "Idleon web URL when using browser injection",
        },
        browserPath: { default: "", description: "Browser executable path for web injection (auto if empty)" },
        browserUserDataDir: { default: "", description: "Browser user data dir for web injection (optional)" },
        pinnedCheats: {
            default: [],
            description: "Cheats pinned to My cheats on Home. The pin on any cheat row adds and removes them",
        },
        gameExePath: {
            example: "C:/Path/To/LegendsOfIdleon.exe",
            description: "Optional: set this to override EXE search on Windows",
        },
    },
};
