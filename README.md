# WakaTime for Obsidian

[WakaTime][wakatime] is an open source Obsidian plugin for metrics, insights, and time tracking automatically generated from your Obsidian usage activity.

## Installation

1. Inside Obsidian, click `Settings` → `Community Plugins` → `Browse`.

2. Search for `wakatime`, click on the WakaTime plugin.

3. Click the `Install` button.

4. Click the `Enable` button.

5. Enter your [api key][api key], then press `enter`.

6. Use Obsidian and your activity will be displayed on your [WakaTime dashboard](https://wakatime.com)

## Usage

Visit [https://wakatime.com](https://wakatime.com) to see your coding activity.

![Project Overview](https://wakatime.com/static/img/ScreenShots/Screen-Shot-2016-03-21.png)

To edit your api key, open the `Command Palette` then type `WakaTime` and select the `WakaTime API Key` command.

## Troubleshooting

The [How to Debug Plugins][how to debug] guide shows how to check when coding activity was last received from your editor using the [Plugins Status Page][plugins status page].

For more general troubleshooting info, see the [wakatime-cli Troubleshooting Section][wakatime-cli help].

## Contributing

- Clone this repo.
- `npm i` or `yarn` to install dependencies
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.


[wakatime]: https://wakatime.com/vs-code
[api key]: https://wakatime.com/api-key
[wakatime-cli help]: https://github.com/wakatime/wakatime-cli/blob/develop/TROUBLESHOOTING.md
[how to debug]: https://wakatime.com/faq#debug-plugins
[plugins status page]: https://wakatime.com/plugin-status
