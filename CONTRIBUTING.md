# Contributing

Questions go to Discord: [https://discord.gg/ySH2Rfk7SN](https://discord.gg/ySH2Rfk7SN)

This guide is for Idleon Injector 3.0. A contribution is a mod: a file that uses what the core provides. The core
itself is the maintainer's.

## The four kinds of mod

Copy the example for your kind. Each folder is scanned by the build, so adding your file is all it takes; you never
edit a shared list.

| Kind           | What it is                                 | Folder                    | Copy this                                                                            |
| -------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| **Hook**       | Changes what a game function does          | `src/cheats/hooks/`       | [`hooks/_example.js`](src/cheats/hooks/_example.js) (`defineHook`)                   |
| **Cheat**      | A command or toggle the player turns on    | `src/cheats/cheats/`      | [`cheats/_example.js`](src/cheats/cheats/_example.js) (`defineCheat`)                |
| **Page**       | A menu page that shows and edits game data | `src/ui/pages/<world>/`   | [`world-1/anvil/anvil.js`](src/ui/pages/world-1/anvil/anvil.js) (`definePage`)       |
| **Automation** | Work that repeats while its cheat is on    | `src/cheats/automations/` | [`automations/_example.js`](src/cheats/automations/_example.js) (`defineAutomation`) |

**The core** is everything the mods are built on: the registries in `src/cheats/core/`, the server, config, updater and
game injection in `src/modules/`, `config.js`, `scripts/`, the workflows and `package.json`. Only the maintainer
changes it. If you find a core bug, open an issue, ideally with proof.

## When to ask first

- **No need to ask:** a page for game content that already exists, a bug fix with a test that failed before the fix,
  and wording.
- **Ask first:** a new cheat or a new game hook. Open a feature request naming the game function, and wait for a yes
  before you start. Link that issue in your PR.

## One kind per PR

A PR is either a page or game-side code (a cheat with the hooks and automations it needs). Put a page and a cheat in
separate PRs, and leave core changes to the maintainer. There is no line limit.

## The pull request

The template asks three things:

1. What the player sees.
2. Tested in game: yes or no, and the game version.
3. A screenshot.

PRs are squash-merged, so your branch name and the commit messages inside the PR don't matter. The PR title does: it
becomes the commit on `master`, and a check fails until it looks like `type(scope): description`:

```
fix(ui): restore sidebar content after switching tabs
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`. The scope is lowercase. The description starts
lowercase and has no period at the end.

## The check

Run it before you open the PR (it also runs on every PR, and a red check blocks merging):

```bash
npm run format
npm run check
```

It checks formatting, builds the cheats bundle, runs ESLint (including Chromium 87 support), the CSS and schema checks,
and every test. The tests include the 3.0 rules, which refuse the old ways of doing things and name the new way.

The AI review (CodeRabbit) runs only when someone comments `@coderabbitai review` on the PR. It gives advice; it never
approves. The merge is the maintainer's call.

## Using AI coding tools

You're welcome to use them, under the same rules as everyone else:

- Point your tool at [AGENTS.md](AGENTS.md). It teaches the mod kit and these rules. (Claude Code reads it through
  `CLAUDE.md`.)
- Test in game yourself, and say so in the PR with the game version and a screenshot.
- Older guides, forks, the archived MrJoiny/Idleon-Injector repo, and whatever AI tools learned from 2.x describe code
  that no longer exists. Trust only this repo's docs on `master`.
