# Cheats

Use the CLI or Cheats view to find commands and their descriptions. The
[project wiki](https://github.com/Idleon-Injector/Idleon-Injector/wiki) provides a user-facing command list.
See the [glossary](glossary.md) for the distinction between commands, state, configuration, and proxies.

Commands can alter save-sensitive game data. Check the command description and relevant configuration warnings
before running an unfamiliar command.

## Contributor entry points

- [Cheats](../src/cheats/cheats/), each declared as a row with
  [`defineCheat`](../src/cheats/core/registration.js); copy [the example](../src/cheats/cheats/_example.js). A row's
  settings end up in `config.js`: run `npm run config:generate` after changing them.
- [Game globals](../src/cheats/core/globals.js) and [traversal utilities](../src/cheats/utils/traverse.js).
- [Game hooks](../src/cheats/hooks/) declared with [`defineHook`](../src/cheats/core/hooks.js); copy
  [the example](../src/cheats/hooks/_example.js). Older hooks are still in [proxies](../src/cheats/proxies/) with the
  [proxy utilities](../src/cheats/utils/proxy.js).

Exact parameters and helper contracts belong in those files. The
[base-first decision](decisions.md#preserve-original-method-side-effects) explains the method-hook constraint.

Follow the [build workflow](build.md) after changes and the
[contribution guidance](../CONTRIBUTING.md) when submitting a command.
