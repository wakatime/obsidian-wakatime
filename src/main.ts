import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';

import { Options } from './options';
import { Logger } from './logger';
import { LogLevel } from './constants';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
};

export default class WakaTime extends Plugin {
  settings: MyPluginSettings;
  options: Options;
  statusBar: HTMLElement;
  logger: Logger;

  async onload() {
    await this.loadSettings();
    this.logger = new Logger(LogLevel.DEBUG);
    this.options = new Options(this.logger);

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    this.statusBar = this.addStatusBarItem();

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-sample-modal-simple',
      name: 'Open sample modal (simple)',
      callback: () => {
        // new SampleModal(this.app).open();
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SampleSettingTab(this.app, this));

  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private updateStatusBarText(text?: string): void {
    if (!this.statusBar) return;
    if (!text) {
      this.statusBar.setText('🕙');
    } else {
      this.statusBar.setText('🕙 ' + text);
    }
  }

  private updateStatusBarTooltip(tooltipText: string): void {
    if (!this.statusBar) return;
    this.statusBar.setAttr("title", tooltipText);
  }

  public promptForApiKey(): void {
  }
}

class ApiKeyModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText('Woah!');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: WakaTime;

  constructor(app: App, plugin: WakaTime) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Settings for my awesome plugin.' });

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc("It's a secret")
      .addText((text) =>
        text
          .setPlaceholder('Enter your secret')
          .setValue(this.plugin.settings.mySetting)
          .onChange(async (value) => {
            console.log('Secret: ' + value);
            this.plugin.settings.mySetting = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
