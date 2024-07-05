import { App, PluginSettingTab, Setting } from "obsidian";
import WakaTime from "./main";

export class SettingsTab extends PluginSettingTab {
  plugin: WakaTime;

  constructor(app: App, plugin: WakaTime) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Show time in status bar")
      .setDesc("Show time browsing, meeting, coding and debugging in status bar.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showStatusBar = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
