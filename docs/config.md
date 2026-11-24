# Configuration

Keep personal overrides in `config.custom.js`. The defaults in [config.js](../config.js) are generated: a cheat's
settings come from its `defineCheat` row, the injector's own from
[coreSettings.js](../src/modules/config/coreSettings.js). Change them there and run `npm run config:generate`, which
also writes the setting descriptions the Config editor shows. The first-run setup wizard creates the override file.

## Applying and saving

Apply changes the cheat configuration for the current session only. Save writes `config.custom.js`, so later runs
get it, and then tries to send the cheat settings to the running game. If the game refuses them or can't be reached,
the file stays saved, and the game gets the settings when the injector attaches to it again. There is no way to save
a setting for later runs without the current game being sent it too.
Restart after changing injector settings. Settings a cheat changes in the game, like a `nomore` list, show up in
the Config view and are saved with the next save.

If `config.custom.js` has an error, the injector says where, runs with the defaults, and keeps the broken file as
`config.custom.broken-<date and time>.js` when you next save from the WebUI.

Use Startup Cheats for commands you want to run on startup. Check command descriptions before making
an action automatic.

## Configs

Settings lists configs: the shipped Light (quality of life only) and AFK (Light plus idling help), and the player's own
("Save current as new", for example one per account). A config is a set of startup cheats and cheat settings; ports,
paths and the other injector settings belong to the PC and stay the same in every config. Switching is by hand: the
config left keeps its settings as they were, and the running game gets the new one's settings and cheats. Editing while
a shipped config is in use saves the player's copy of it, which Reset puts back. A fresh install and a
`config.custom.js` from before configs start in "My config".

## Safety

The Web UI permits command execution and game-state editing. Keep access local unless you deliberately need
remote access on a trusted network. Remote access has no login; configure the listening address and allowed
origins carefully, then restart.

Account values and cheat settings can affect save data. Read field warnings before editing.
Keep the dangerous `chng` command disabled unless you understand the consequences.

## Source entry points

- [Defaults](../config.js) and [configuration loading](../src/modules/config/configManager.js).
- [Shipped configs](../src/modules/config/shippedConfigs.js).
- [Config view](../src/ui/components/views/Config.js).
- [Account option labels and warnings](../src/ui/config/optionsAccountSchema.json).

See [platform setup](platforms.md) for target selection and the [glossary](glossary.md) for configuration terms.
