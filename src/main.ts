import { apiVersion, App, MarkdownView, Modal, Plugin, Setting, TextComponent } from 'obsidian';
import * as child_process from 'child_process';

import { Options, OptionSetting } from './options';
import { Logger } from './logger';
import { LogLevel } from './constants';
import { Utils } from './utils';
import { Dependencies } from './dependencies';
import { Desktop } from './desktop';

export default class WakaTime extends Plugin {
  options: Options;
  statusBar: HTMLElement;
  showStatusBar: boolean;
  showCodingActivity: boolean;
  logger: Logger;
  dependencies: Dependencies;
  disabled: boolean;
  lastFetchToday = 0;
  fetchTodayInterval = 60000;
  lastFile: string;
  lastHeartbeat = 0;

  async onload() {
    this.logger = new Logger(LogLevel.INFO);
    this.options = new Options(this.logger);

    this.addCommand({
      id: 'wakatime-api-key',
      name: 'WakaTime API Key',
      callback: () => {
        this.promptForApiKey();
      },
    });

    this.options.getSetting('settings', 'debug', false, (debug: OptionSetting) => {
      this.logger.setLevel(debug.value == 'true' ? LogLevel.DEBUG : LogLevel.INFO);
      this.dependencies = new Dependencies(this.options, this.logger);

      this.options.getSetting('settings', 'disabled', false, (disabled: OptionSetting) => {
        this.disabled = disabled.value === 'true';
        if (this.disabled) {
          return;
        }

        this.initializeDependencies();
      });
    });
  }

  onunload() {}

  public initializeDependencies(): void {
    this.logger.debug(`Initializing WakaTime v${this.manifest.version}`);

    this.statusBar = this.addStatusBarItem();

    this.options.getSetting(
      'settings',
      'status_bar_enabled',
      false,
      (statusBarEnabled: OptionSetting) => {
        this.showStatusBar = statusBarEnabled.value !== 'false';
        this.updateStatusBarText('WakaTime Initializing...');

        this.checkApiKey();

        this.setupEventListeners();

        this.options.getSetting(
          'settings',
          'status_bar_coding_activity',
          false,
          (showCodingActivity: OptionSetting) => {
            this.showCodingActivity = showCodingActivity.value !== 'false';

            this.dependencies.checkAndInstallCli(() => {
              this.logger.debug('WakaTime initialized');
              this.updateStatusBarText();
              this.updateStatusBarTooltip('WakaTime: Initialized');
              this.getCodingActivity();
            });
          },
        );
      },
    );
  }

  private checkApiKey(): void {
    this.options.hasApiKey((hasApiKey) => {
      if (!hasApiKey) this.promptForApiKey();
    });
  }

  private setupEventListeners(): void {
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      this.onEvent(false);
    });
    this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
      this.onEvent(false);
    });
  }

  private onEvent(isWrite: boolean) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;
    const cursor = view.editor.getCursor();
    // @ts-expect-error
    const file = `${this.app.vault.adapter.basePath}/${activeFile.path}`;
    const time: number = Date.now();
    if (isWrite || this.enoughTimePassed(time) || this.lastFile !== file) {
      this.sendHeartbeat(file, time, cursor.line, cursor.ch, isWrite);
      this.lastFile = file;
      this.lastHeartbeat = time;
    }
  }

  private enoughTimePassed(time: number): boolean {
    return this.lastHeartbeat + 120000 < time;
  }

  private updateStatusBarText(text?: string): void {
    if (!this.statusBar) return;
    if (!text) {
      this.statusBar.setText('🕒');
    } else {
      this.statusBar.setText('🕒 ' + text);
    }
  }

  private updateStatusBarTooltip(tooltipText: string): void {
    if (!this.statusBar) return;
    this.statusBar.setAttr('title', tooltipText);
  }

  public promptForApiKey(): void {
    new ApiKeyModal(this.app, this.options).open();
  }

  private sendHeartbeat(
    file: string,
    time: number,
    lineno: number,
    cursorpos: number,
    isWrite: boolean,
  ): void {
    this.options.getApiKey((apiKey) => {
      if (!apiKey) return;
      this._sendHeartbeat(file, time, lineno, cursorpos, isWrite);
    });
  }

  private _sendHeartbeat(
    file: string,
    time: number,
    lineno: number,
    cursorpos: number,
    isWrite: boolean,
  ): void {
    if (!this.dependencies.isCliInstalled()) return;

    const args: string[] = [];

    args.push('--entity', Utils.quote(file));

    const user_agent = 'obsidian/' + apiVersion + ' obsidian-wakatime/' + this.manifest.version;
    args.push('--plugin', Utils.quote(user_agent));

    args.push('--lineno', String(lineno + 1));
    args.push('--cursorpos', String(cursorpos + 1));

    if (isWrite) args.push('--write');

    if (Desktop.isWindows()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
        '--log-file',
        Utils.quote(this.options.getLogFile()),
      );
    }

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(`Sending heartbeat: ${Utils.formatArguments(binary, args)}`);
    const options = Desktop.buildOptions();
    const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    proc.on('close', (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar) this.getCodingActivity();
        this.logger.debug(`last heartbeat sent ${Utils.formatDate(new Date())}`);
      } else if (code == 102 || code == 112) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.updateStatusBarText();
          this.updateStatusBarTooltip(
            'WakaTime: working offline... coding activity will sync next time we are online',
          );
        }
        this.logger.warn(
          `Working offline (${code}); Check your ${this.options.getLogFile()} file for more details`,
        );
      } else if (code == 103) {
        const error_msg = `Config parsing error (103); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      } else if (code == 104) {
        const error_msg = 'Invalid Api Key (104); Make sure your Api Key is correct!';
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      } else {
        const error_msg = `Unknown Error (${code}); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      }
    });
  }

  private getCodingActivity() {
    if (!this.showStatusBar) {
      return;
    }

    // prevent updating if we haven't coded since last checked
    if (this.lastFetchToday > 0 && this.lastFetchToday > this.lastHeartbeat) return;

    const cutoff = Date.now() - this.fetchTodayInterval;
    if (this.lastFetchToday > cutoff) return;

    this.lastFetchToday = Date.now();

    this.options.getApiKey((apiKey) => {
      if (!apiKey) return;
      this._getCodingActivity();
    });
  }

  private _getCodingActivity() {
    if (!this.dependencies.isCliInstalled()) return;

    const user_agent = 'obsidian/' + apiVersion + ' obsidian-wakatime/' + this.manifest.version;
    const args = ['--today', '--plugin', Utils.quote(user_agent)];

    if (Desktop.isWindows()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
        '--logfile',
        Utils.quote(this.options.getLogFile()),
      );
    }

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(
      `Fetching coding activity for Today from api: ${Utils.formatArguments(binary, args)}`,
    );
    const options = Desktop.buildOptions();
    const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    let output = '';
    if (proc.stdout) {
      proc.stdout.on('data', (data: string | null) => {
        if (data) output += data;
      });
    }
    proc.on('close', (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar) {
          if (output && output.trim()) {
            if (this.showCodingActivity) {
              this.updateStatusBarText(output.trim());
              this.updateStatusBarTooltip('WakaTime: Today’s coding time.');
            } else {
              this.updateStatusBarText();
              this.updateStatusBarTooltip(output.trim());
            }
          } else {
            this.updateStatusBarText();
            this.updateStatusBarTooltip('WakaTime: Calculating time spent today in background...');
          }
        }
      } else if (code == 102 || code == 112) {
        // noop, working offline
      } else {
        const error_msg = `Error fetching today coding activity (${code}); Check your ${this.options.getLogFile()} file for more details`;
        this.logger.debug(error_msg);
      }
    });
  }
}

class ApiKeyModal extends Modal {
  options: Options;
  input: TextComponent;
  private static instance: ApiKeyModal;

  constructor(app: App, options: Options) {
    if (ApiKeyModal.instance) {
      return ApiKeyModal.instance;
    }
    super(app);
    this.options = options;
    ApiKeyModal.instance = this;
  }

  onOpen() {
    const { contentEl } = this;

    this.options.getSetting('settings', 'api_key', false, (setting: OptionSetting) => {
      let defaultVal = setting.value;
      if (Utils.apiKeyInvalid(defaultVal)) defaultVal = '';

      contentEl.createEl('h2', { text: 'Enter your WakaTime API Key' });

      new Setting(contentEl).addText((text) => {
        text.setValue(defaultVal);
        text.inputEl.addClass('api-key-input');
        this.input = text;
      });

      new Setting(contentEl).addButton((btn) =>
        btn
          .setButtonText('Save')
          .setCta()
          .onClick(() => {
            const val = this.input.getValue();
            const invalid = Utils.apiKeyInvalid(val);
            console.log(invalid);
            if (!invalid) {
              this.close();
              this.options.setSetting('settings', 'api_key', val, false);
            }
          }),
      );
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
