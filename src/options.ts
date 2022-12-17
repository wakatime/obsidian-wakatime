import * as path from 'path';
import * as fs from 'fs';

import * as child_process from 'child_process';
import { Utils } from './utils';
import { Logger } from './logger';
import { Desktop } from './desktop';

export interface OptionSetting {
  key: string;
  value: string;
  error?: Error;
}

type FoundOption = {
  [key: string]: boolean;
};

export class Options {
  private configFile: string;
  private internalConfigFile: string;
  private logFile: string;
  private logger: Logger;
  private cache: any = {};

  constructor(logger: Logger) {
    const wakaHome = Desktop.getHomeDirectory();
    this.configFile = path.join(wakaHome, '.wakatime.cfg');
    this.internalConfigFile = path.join(wakaHome, '.wakatime-internal.cfg');
    this.logFile = path.join(wakaHome, '.wakatime.log');
    this.logger = logger;
  }

  public async getSettingAsync(section: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.getSetting(section, key, false, (setting) => {
        setting.error ? reject(setting.error) : resolve(setting.value);
      });
    });
  }

  public getSetting(
    section: string,
    key: string,
    internal: boolean,
    callback: (_: OptionSetting) => void,
  ): void {
    fs.readFile(
      this.getConfigFile(internal),
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        if (err) {
          callback({
            error: new Error(`could not read ${this.getConfigFile(internal)}`),
            key: key,
            value: '',
          });
        } else {
          let currentSection = '';
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
              currentSection = line
                .trim()
                .substring(1, line.trim().length - 1)
                .toLowerCase();
            } else if (currentSection === section) {
              const parts = line.split('=');
              const currentKey = parts[0].trim();
              if (currentKey === key && parts.length > 1) {
                callback({ key: key, value: this.removeNulls(parts[1].trim()) });
                return;
              }
            }
          }
          callback({ key: key, value: '' });
        }
      },
    );
  }

  public setSetting(section: string, key: string, val: string, internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      const contents: string[] = [];
      let currentSection = '';

      let found = false;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
          if (currentSection === section && !found) {
            contents.push(this.removeNulls(key + ' = ' + val));
            found = true;
          }
          currentSection = line
            .trim()
            .substring(1, line.trim().length - 1)
            .toLowerCase();
          contents.push(this.removeNulls(line));
        } else if (currentSection === section) {
          const parts = line.split('=');
          const currentKey = parts[0].trim();
          if (currentKey === key) {
            if (!found) {
              contents.push(this.removeNulls(key + ' = ' + val));
              found = true;
            }
          } else {
            contents.push(this.removeNulls(line));
          }
        } else {
          contents.push(this.removeNulls(line));
        }
      }

      if (!found) {
        if (currentSection !== section) {
          contents.push('[' + section + ']');
        }
        contents.push(this.removeNulls(key + ' = ' + val));
      }

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public setSettings(section: string, settings: OptionSetting[], internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      const contents: string[] = [];
      let currentSection = '';

      const found: FoundOption = {};
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
          if (currentSection === section) {
            settings.forEach((setting) => {
              if (!found[setting.key]) {
                contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                found[setting.key] = true;
              }
            });
          }
          currentSection = line
            .trim()
            .substring(1, line.trim().length - 1)
            .toLowerCase();
          contents.push(this.removeNulls(line));
        } else if (currentSection === section) {
          const parts = line.split('=');
          const currentKey = parts[0].trim();
          let keepLineUnchanged = true;
          settings.forEach((setting) => {
            if (currentKey === setting.key) {
              keepLineUnchanged = false;
              if (!found[setting.key]) {
                contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                found[setting.key] = true;
              }
            }
          });
          if (keepLineUnchanged) {
            contents.push(this.removeNulls(line));
          }
        } else {
          contents.push(this.removeNulls(line));
        }
      }

      settings.forEach((setting) => {
        if (!found[setting.key]) {
          if (currentSection !== section) {
            contents.push('[' + section + ']');
            currentSection = section;
          }
          contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
          found[setting.key] = true;
        }
      });

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public getConfigFile(internal: boolean): string {
    return internal ? this.internalConfigFile : this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public async getApiKeyAsync(): Promise<string> {
    if (!Utils.apiKeyInvalid(this.cache.api_key)) {
      return this.cache.api_key;
    }

    try {
      const apiKeyFromVault = await this.getApiKeyFromVaultCmd();
      if (!Utils.apiKeyInvalid(apiKeyFromVault)) {
        this.cache.api_key = apiKeyFromVault;
        return this.cache.api_key;
      }
      // eslint-disable-next-line no-empty
    } catch (err) {}

    try {
      const apiKey = await this.getSettingAsync('settings', 'api_key');
      if (!Utils.apiKeyInvalid(apiKey)) this.cache.api_key = apiKey;
      return apiKey;
    } catch (err) {
      this.logger.debug(`Exception while reading API Key from config file: ${err}`);
      return '';
    }
  }

  public async getApiKeyFromVaultCmd(): Promise<string> {
    try {
      const apiKeyCmd = await this.getSettingAsync('settings', 'api_key_vault_cmd');
      if (!apiKeyCmd) return '';

      const options = Desktop.buildOptions();
      const proc = child_process.spawn(apiKeyCmd, options);

      let stdout = '';
      for await (const chunk of proc.stdout) {
        stdout += chunk;
      }
      let stderr = '';
      for await (const chunk of proc.stderr) {
        stderr += chunk;
      }
      const exitCode = await new Promise((resolve) => {
        proc.on('close', resolve);
      });

      if (exitCode) this.logger.warn(`api key vault command error (${exitCode}): ${stderr}`);
      else if (stderr && stderr.trim()) this.logger.warn(stderr.trim());

      const apiKey = stdout.toString().trim();
      return apiKey;
    } catch (err) {
      this.logger.debug(`Exception while reading API Key Vault Cmd from config file: ${err}`);
      return '';
    }
  }

  public getApiKey(callback: (apiKey: string | null) => void): void {
    this.getApiKeyAsync()
      .then((apiKey) => {
        if (!Utils.apiKeyInvalid(apiKey)) {
          callback(apiKey);
        } else {
          callback(null);
        }
      })
      .catch((err) => {
        this.logger.warn(`Unable to get api key: ${err}`);
        callback(null);
      });
  }

  public hasApiKey(callback: (valid: boolean) => void): void {
    this.getApiKeyAsync()
      .then((apiKey) => callback(!Utils.apiKeyInvalid(apiKey)))
      .catch((err) => {
        this.logger.warn(`Unable to check for api key: ${err}`);
        callback(false);
      });
  }

  private startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  private endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }

  private removeNulls(s: string): string {
    return s.replace(/\0/g, '');
  }
}
