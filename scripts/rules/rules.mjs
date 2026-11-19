// The 3.0 rules (#19): read the code and refuse the old ways of doing things. Each refusal says what is wrong and
// what to use instead. Code that predates the rules is listed in exceptions.json; see rules.test.mjs.
// Parses with the acorn that ESLint already installs (no new dependency).
import { parse } from "acorn";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = ["src/cheats/core/", "src/cheats/main.js", "src/modules/", "src/main.js"];
const SKIP = ["src/ui/vendor/"];
const isCore = (file) => CORE.some((prefix) => file.startsWith(prefix));
const isGameSide = (file) => file.startsWith("src/cheats/");
// The game side, the UI, and everything else (the server, src/main.js, package.json) runs in Node.
const runtime = (file) => (file.startsWith("src/cheats/") ? "game" : file.startsWith("src/ui/") ? "ui" : "node");
// The pre-3.0 shared tab lists; each page still listed there is one not yet moved to src/ui/pages/.
const OLD_TAB_LISTS = /^src\/ui\/components\/views\/(Account\.js|account\/W\d+Tab\.js)$/;
// The writers that pages save through; only these may call the raw gga writes.
const WRITERS = ["src/ui/services/api.js", "src/ui/components/views/account/accountShared.js"];

/** The mod a file belongs to, or null: one cheat, hook or automation file (with its folder), or one page folder. */
export function modOf(file) {
    const kind = file.match(/^src\/cheats\/(cheats|hooks|automations)\/([^/]+?)(\.js)?(\/|$)/);
    if (kind) return `src/cheats/${kind[1]}/${kind[2]}`;
    const page = file.match(/^src\/ui\/pages\/([^/]+\/[^/]+)\//);
    return page ? `src/ui/pages/${page[1]}` : null;
}

const SEE = "(see AGENTS.md)";
const MESSAGES = {
    patch: (how) =>
        `patches the game with ${how}. That's the pre-3.0 way; declare a hook with defineHook instead ${SEE}.`,
    eval: (how) =>
        `runs code from a string with ${how}. That's the pre-3.0 way; write the code itself, or give a defineCheat typed parameters ${SEE}.`,
    window: (name) =>
        `touches ${name}. That's the pre-3.0 way; read the game through core/globals.js (gga, behavior, events, ...), and leave adding globals to the core ${SEE}.`,
    route: (path) =>
        `adds the server route ${path}. Routes belong to the core (src/modules/server); ask in an issue first ${SEE}.`,
    dependency: (name) =>
        `imports the package "${name}". Dependencies belong to the core; use what the core provides, or ask in an issue first ${SEE}.`,
    network: (how) =>
        `makes a network call (${how}) from code that runs in the game. Game-side code never talks to the network; the injector's server does that ${SEE}.`,
    timer: (how) =>
        `runs its own timer (${how}). That's the pre-3.0 way; declare the loop with defineAutomation and the core runs it ${SEE}.`,
    write: (how) =>
        `saves with ${how} directly. That's the pre-3.0 way; save through writeVerified (writeManyVerified for many) so a failed write shows ${SEE}.`,
    "mod-import": (target) =>
        `imports another mod (${target}). Mods don't import each other; put shared code in src/cheats/helpers/ or the page building blocks, or read the other feature through cheatState ${SEE}.`,
    "cross-runtime": (target) =>
        `imports ${target} across runtimes. The game side (src/cheats), the server (src/modules) and the UI (src/ui) run in different places; talk through the core's API ${SEE}.`,
    "error-string": () =>
        `returns an "Error:" string. That's the pre-3.0 way; throw an Error and the cheat dispatcher turns it into { ok: false, message } ${SEE}.`,
    "old-page": (name) =>
        `lists the page ${name} in a shared tab list. That's the pre-3.0 way; move it to src/ui/pages/<world>/<page>/ with definePage, and the menu finds it ${SEE}.`,
    "around-comment": () =>
        `declares an around hook without an "// Around:" comment saying why base-first doesn't work. Add one right above the defineHook call, or make the hook base-first ${SEE}.`,
};
export const RULES = Object.keys(MESSAGES);

function walk(node, visit, parent = null) {
    visit(node, parent);
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) for (const item of child) item?.type && walk(item, visit, node);
        else if (child?.type && key !== "loc") walk(child, visit, node);
    }
}

const isReference = (node, parent) =>
    !(
        (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
        ((parent?.type === "Property" || parent?.type === "MethodDefinition") &&
            parent.key === node &&
            !parent.computed)
    );
const rootName = (node) => (node.type === "MemberExpression" ? rootName(node.object) : node.name);
const isCall = (node, object, method) =>
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.name === object &&
    node.callee.property.name === method;
const startsWithError = (node) =>
    (node?.type === "Literal" && typeof node.value === "string" && node.value.startsWith("Error:")) ||
    (node?.type === "TemplateLiteral" && node.quasis[0].value.cooked.startsWith("Error:")) ||
    (node?.type === "BinaryExpression" && node.operator === "+" && startsWithError(node.left));

/**
 * Every rule broken in one file.
 * @param {string} file - repo-relative path with forward slashes
 * @param {string} source
 * @returns {Array<{ rule: string, file: string, line: number, detail: string, message: string }>}
 */
export function check(file, source) {
    if (SKIP.some((prefix) => file.startsWith(prefix))) return [];
    const comments = [];
    const options = { ecmaVersion: "latest", locations: true, allowHashBang: true, onComment: comments };
    let ast;
    try {
        ast = parse(source, { ...options, sourceType: "module" });
    } catch {
        comments.length = 0;
        ast = parse(source, { ...options, sourceType: "script", allowReturnOutsideFunction: true });
    }
    const text = (node) => source.slice(node.start, node.end);
    // The property a value is put into: "growTo" for actor.growTo, "key" for this[key].
    const keyName = (node) =>
        node.type === "MemberExpression" ? (node.computed ? text(node.property) : node.property.name) : text(node);
    const core = isCore(file);
    const gameMod = isGameSide(file) && !core;
    const mod = modOf(file);
    const found = [];
    const add = (rule, node, detail, arg = detail) =>
        found.push({
            rule,
            file,
            line: node.loc.start.line,
            detail,
            message: `${file}:${node.loc.start.line} ${MESSAGES[rule](arg)}`,
        });

    const checkImport = (node, spec) => {
        if (typeof spec !== "string") return;
        if (!spec.startsWith(".")) {
            if (!core) add("dependency", node, spec);
            return;
        }
        const target = posix.join(posix.dirname(file), spec);
        if (runtime(target) !== runtime(file)) add("cross-runtime", node, target);
        else if (mod && modOf(target) && modOf(target) !== mod) add("mod-import", node, modOf(target));
    };

    walk(ast, (node, parent) => {
        switch (node.type) {
            case "ImportDeclaration":
            case "ExportNamedDeclaration":
            case "ExportAllDeclaration":
                if (node.source) checkImport(node, node.source.value);
                break;
            case "ImportExpression":
                checkImport(node, node.source.value);
                break;
            case "NewExpression":
                if (node.callee.name === "Proxy" && gameMod) {
                    const into =
                        parent.type === "AssignmentExpression"
                            ? parent.left
                            : parent.type === "VariableDeclarator"
                              ? parent.id
                              : null;
                    add("patch", node, into ? keyName(into) : text(node.arguments[0]), "new Proxy");
                }
                if (["Function", "AsyncFunction"].includes(node.callee.name)) add("eval", node, "new Function");
                if (["XMLHttpRequest", "WebSocket", "EventSource"].includes(node.callee.name) && isGameSide(file))
                    add("network", node, node.callee.name);
                break;
            case "CallExpression": {
                const callee = node.callee.name;
                if (callee === "require") checkImport(node, node.arguments[0]?.value);
                if (callee === "eval" || callee === "Function")
                    add("eval", node, callee === "eval" ? "eval" : "new Function");
                if (isGameSide(file) && (callee === "fetch" || isCall(node, "navigator", "sendBeacon")))
                    add("network", node, callee === "fetch" ? "fetch" : "navigator.sendBeacon");
                if (gameMod && ["setInterval", "setTimeout", "requestAnimationFrame"].includes(callee))
                    add("timer", node, callee);
                if (
                    gameMod &&
                    ["Object", "Reflect"].some((object) =>
                        ["defineProperty", "defineProperties"].some((method) => isCall(node, object, method))
                    )
                ) {
                    const key = node.arguments[1];
                    add(
                        "patch",
                        node,
                        key?.type === "Literal" ? String(key.value) : text(key ?? node),
                        text(node.callee)
                    );
                }
                if (file.startsWith("src/ui/") && !WRITERS.includes(file)) {
                    if (callee === "gga" && node.arguments.length >= 2) add("write", node, "gga(path, value)");
                    if (callee === "ggaMany") add("write", node, "ggaMany");
                }
                const route = node.arguments[0];
                if (
                    !core &&
                    node.callee.type === "MemberExpression" &&
                    ["get", "post", "put", "patch", "delete"].includes(node.callee.property.name) &&
                    route?.type === "Literal" &&
                    String(route.value).startsWith("/")
                )
                    add("route", node, route.value);
                if (callee === "defineHook" && isGameSide(file)) {
                    const target = node.arguments[0];
                    const around =
                        target?.type === "ObjectExpression" &&
                        target.properties.some((prop) => prop.key?.name === "around" && prop.value.value === true);
                    if (around && !hasAroundComment(comments, node.loc.start.line, target.loc.end.line))
                        add("around-comment", node, "around");
                }
                break;
            }
            case "AssignmentExpression": {
                const left = node.left;
                if (left.type !== "MemberExpression") break;
                // A function put in place of a game method; not a DOM handler (on*), an array slot, or the injector's own state.
                if (
                    gameMod &&
                    ["FunctionExpression", "ArrowFunctionExpression"].includes(node.right.type) &&
                    !(!left.computed && /^on[a-z]+$/.test(left.property.name)) &&
                    !(left.computed && left.property.type === "Literal") &&
                    !["cheatConfig", "cheatState"].includes(rootName(left))
                )
                    add("patch", node, keyName(left), "an assigned function");
                // The UI's own window is fine to read (sizes, confirm), but globals are the core's.
                if (file.startsWith("src/ui/") && !core && ["window", "globalThis"].includes(left.object.name))
                    add("window", node, `${left.object.name}.${keyName(left)}`, `${left.object.name} to add a global`);
                break;
            }
            case "Identifier":
                if (node.name === "_isPatched" && gameMod) add("patch", node, "_isPatched");
                if (["window", "globalThis"].includes(node.name) && gameMod && isReference(node, parent))
                    add("window", node, node.name);
                break;
            case "Property":
                if (OLD_TAB_LISTS.test(file) && node.key.name === "component" && node.value.type === "Identifier")
                    if (!/^W\d+Tab$/.test(node.value.name)) add("old-page", node, node.value.name);
                break;
            case "ReturnStatement":
                if (startsWithError(node.argument)) add("error-string", node, "Error:");
                break;
            case "ArrowFunctionExpression":
                if (node.expression && startsWithError(node.body)) add("error-string", node.body, "Error:");
                break;
        }
    });
    return found;
}

// An "Around:" comment on the lines right above the call (a block of // lines counts as one), or inside its options.
function hasAroundComment(comments, callLine, optionsEnd) {
    const isAround = (comment) => /^\s*\**\s*Around:/.test(comment.value);
    if (
        comments.some(
            (comment) => comment.loc.start.line >= callLine && comment.loc.end.line <= optionsEnd && isAround(comment)
        )
    )
        return true;
    for (let line = callLine - 1; ; line--) {
        const comment = comments.find((entry) => entry.loc.end.line === line);
        if (!comment) return false;
        if (isAround(comment)) return true;
        line = comment.loc.start.line;
    }
}

/** Every rule broken in the repo's src/ (vendored code skipped) and package.json. */
export function checkRepo(root, dependencies) {
    const found = readdirSync(join(root, "src"), { recursive: true })
        .map((file) => `src/${file.replaceAll("\\", "/")}`)
        .filter((file) => file.endsWith(".js"))
        .flatMap((file) => check(file, readFileSync(join(root, file), "utf8")));
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }))
        if (!dependencies.includes(name))
            found.push({
                rule: "dependency",
                file: "package.json",
                line: 0,
                detail: name,
                message: `package.json adds the dependency "${name}". Dependencies belong to the core; ask in an issue first, and the maintainer adds it to scripts/rules/exceptions.json ${SEE}.`,
            });
    return found;
}

/**
 * Hold what the rules found against the exceptions list. An entry matches offences by rule and file (and by
 * detail when it names one) up to its count. Anything unmatched is new and must follow the rules; an entry with
 * fewer matches than its count is stale, so the list only shrinks.
 */
export function compare(found, entries) {
    const used = new Map(entries.map((entry) => [entry, 0]));
    const unexpected = [];
    const sorted = [...entries].sort((a, b) => (b.detail !== undefined) - (a.detail !== undefined));
    for (const offence of found) {
        const entry = sorted.find(
            (candidate) =>
                candidate.rule === offence.rule &&
                candidate.file === offence.file &&
                (candidate.detail === undefined || candidate.detail === offence.detail) &&
                used.get(candidate) < candidate.count
        );
        if (entry) used.set(entry, used.get(entry) + 1);
        else unexpected.push(offence);
    }
    const stale = entries
        .filter((entry) => used.get(entry) < entry.count)
        .map((entry) => ({ ...entry, found: used.get(entry) }));
    return { unexpected, stale };
}

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
