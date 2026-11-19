const os = require("os");
const fs = require("fs");
const { getRuntimePath } = require("./modules/utils/runtimePaths");
const {
    loadConfiguration,
    getInjectorConfig,
    getStartupCheats,
    getCheatConfig,
    getDefaultConfig,
    getCdpPort,
    getWebPort,
} = require("./modules/config/configManager");
const { runSetupWizard } = require("./modules/config/setupWizard");
const { attachToTarget } = require("./modules/game/gameAttachment");

const { setupIntercept, createCheatContext } = require("./modules/game/cheatInjection");
const { createWebServer, startServer } = require("./modules/server/webServer");
const { setupApiRoutes } = require("./modules/server/apiRoutes");
const { startCliInterface } = require("./modules/cli/cliInterface");
const { createUpdater } = require("./modules/updateService");
const { createLogger } = require("./modules/utils/logger");
const { version } = require("../package.json");

const log = createLogger("Main");

/**
 * InjectCheatUI - Main application entry point
 *
 * This application injects cheats into a game by:
 * 1. Attaching to the game process via Chrome DevTools Protocol
 * 2. Intercepting and modifying game resources during load
 * 3. Providing both web UI and CLI interfaces for cheat management
 */

let servicesStarted = false;
let uiServicesStarted = false;

function printHeader() {
    log.info("=============================");
    log.info(`InjectCheatUI v${version}`);
    log.info("=============================");
    log.info("FREE & PUBLIC SOURCE SOFTWARE");
    log.info("GitHub: https://github.com/Idleon-Injector/Idleon-Injector");
    log.info("");

    // In the background, so a slow network never delays attaching to the game.
    createUpdater()
        .check()
        .then((update) => {
            if (update?.updateAvailable) log.warn(`UPDATE AVAILABLE: v${update.latestVersion} - ${update.url}`);
        });
}

function printConfiguration(injectorConfig) {
    const target = (injectorConfig.target || "steam").toLowerCase();

    log.debug(`Injection regex: ${injectorConfig.injreg}`);
    log.debug(`Log level: ${injectorConfig.logLevel}`);
    log.info(`Target platform: ${target}${target === "web" ? ` (${injectorConfig.webUrl})` : ""}`);
    log.info(`Web UI port: ${injectorConfig.webPort || 8080}`);
    log.debug(`OS Platform: ${os.platform()}`);
    if (target === "web" && injectorConfig.browserPath) {
        log.debug(`Browser: ${injectorConfig.browserPath}`);
    }
}

function initializeConfiguration() {
    loadConfiguration();

    const injectorConfig = getInjectorConfig();
    const startupCheats = getStartupCheats();
    const cheatConfig = getCheatConfig();
    const defaultConfig = getDefaultConfig();
    const cdpPort = getCdpPort();
    const webPort = getWebPort();

    return { injectorConfig, startupCheats, cheatConfig, defaultConfig, cdpPort, webPort };
}

/**
 * Run the in-game setup and report how it went.
 * @returns {Promise<boolean|null>} null when the cheats aren't in the page, else whether every hook installed
 */
async function initializeCheatContext(Runtime, context) {
    log.debug("Initializing cheat context");

    const contextExists = await Runtime.evaluate({ expression: `!!${context}` });
    if (!contextExists.result.value) {
        log.error("Cheat context not found - injection may have failed");
        return null;
    }

    const init = await Runtime.evaluate({
        expression: `setup.call(${context})`,
        awaitPromise: true,
        returnByValue: true,
        allowUnsafeEvalBlockedByCSP: true,
    });
    if (init.exceptionDetails) {
        log.error("Cheat setup failed:", init.exceptionDetails.exception?.description || init.exceptionDetails.text);
        return false;
    }
    const { message, error, hookFailures } = init.result.value;
    if (error) {
        log.error("Cheat setup failed:", error);
        return false;
    }
    log.debug("Cheat context initialized:", message);
    if (hookFailures.length === 0) return true;

    const count = hookFailures.length;
    log.warn(
        `${count} game ${count === 1 ? "hook" : "hooks"} failed to install, so the cheats that use ${count === 1 ? "it" : "them"} won't work:`
    );
    for (const failure of hookFailures) log.warn(`  ${failure}`);
    return false;
}

async function startWebServer(app, webPort, wsConfig = null) {
    try {
        await startServer(app, webPort, wsConfig);
    } catch (err) {
        log.error("Failed to start web server:", err);
    }
}

async function handlePageLoad(gameContext, config, app) {
    const { Runtime, context, client } = gameContext;
    log.debug("Page loaded, setting up cheats");

    if (config.injectorConfig.enableUI && !uiServicesStarted) {
        uiServicesStarted = true;

        setupApiRoutes(app, context, client, {
            cheatConfig: config.cheatConfig,
            defaultConfig: config.defaultConfig,
            startupCheats: config.startupCheats,
            injectorConfig: config.injectorConfig,
            cdpPort: config.cdpPort,
        });

        await startWebServer(app, config.webPort, {
            runtime: Runtime,
            context: context,
        });
    }

    const cheatsReady = await initializeCheatContext(Runtime, context);
    if (cheatsReady === null) return;

    if (!servicesStarted) {
        servicesStarted = true;
        if (cheatsReady) log.info("Cheats ready!");

        await startCliInterface(context, client, {
            injectorConfig: config.injectorConfig,
            cdpPort: config.cdpPort,
        });
    }
}

function handleError(error) {
    log.error("Fatal error:", error);

    if (error?.message?.includes("No inspectable targets")) {
        log.info("Hint: Is Steam running? Make sure the game is not already open");
    }

    log.info("Press Enter to exit");
    const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    readline.question("", () => {
        readline.close();
        process.exit(1);
    });
}

async function main() {
    try {
        const customConfigPath = getRuntimePath("config.custom.js");

        if (!fs.existsSync(customConfigPath)) {
            await runSetupWizard(customConfigPath);
        }

        const config = initializeConfiguration();

        printHeader();
        printConfiguration(config.injectorConfig);

        const app = createWebServer({ enableUI: config.injectorConfig.enableUI });

        const target = (config.injectorConfig.target || "steam").toLowerCase();
        if (os.platform() === "darwin" && target !== "web") {
            throw new Error("macOS only supports the 'web' target. Set injectorConfig.target to 'web'");
        }

        const hook = await attachToTarget();

        const client = await setupIntercept(
            hook,
            config.injectorConfig,
            config.startupCheats,
            config.cheatConfig,
            config.cdpPort
        );
        log.debug("Network interceptor ready");

        const { Runtime, Page } = client;
        client.on("disconnect", () => log.warn("The game closed. Restart the injector to use cheats again."));

        log.debug("Registering page load handler");
        Page.loadEventFired(async () => {
            try {
                const context = createCheatContext();
                await handlePageLoad({ Runtime, Page, context, client }, config, app);
            } catch (loadEventError) {
                log.error("Page load handler failed:", loadEventError);
            }
        });
        // add small delay to fix ERR_CERT_VERIFIER_CHANGED
        if (target === "web") {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        log.debug("Reloading page to trigger injection");
        await Page.reload({ ignoreCache: true });
    } catch (error) {
        handleError(error);
    }
}

main();
