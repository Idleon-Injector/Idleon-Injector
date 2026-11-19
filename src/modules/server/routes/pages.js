const path = require("path");
const fs = require("fs").promises;

/**
 * Lists the menu's page modules and the stylesheets next to them, as paths relative to the pages folder.
 * Read-only; dotfiles and anything that isn't .js or .css are left out.
 * @param {string} pagesDir
 * @returns {Promise<{modules: string[], styles: string[]}>}
 */
async function listPageFiles(pagesDir) {
    const modules = [];
    const styles = [];
    const walk = async (dir, prefix) => {
        for (const name of await fs.readdir(dir)) {
            if (name.startsWith(".")) continue;
            const full = path.join(dir, name);
            const rel = prefix ? `${prefix}/${name}` : name;
            if ((await fs.stat(full)).isDirectory()) await walk(full, rel);
            else if (name.endsWith(".js")) modules.push(rel);
            else if (name.endsWith(".css")) styles.push(rel);
        }
    };
    await walk(pagesDir, "");
    return { modules: modules.sort(), styles: styles.sort() };
}

function setupPageRoutes(app, pagesDir) {
    app.get("/api/pages", async (req, res) => {
        res.json(await listPageFiles(pagesDir));
    });
}

module.exports = { listPageFiles, setupPageRoutes };
