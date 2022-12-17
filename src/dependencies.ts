import AdmZip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import * as which from 'which';

import { Options, OptionSetting } from './options';
import { Desktop } from './desktop';
import { Logger } from './logger';

export class Dependencies {
  private options: Options;
  private logger: Logger;
  private resourcesLocation?: string = undefined;
  private cliLocation?: string = undefined;
  private cliLocationGlobal?: string = undefined;
  private cliInstalled = false;
  private githubDownloadPrefix = 'https://github.com/wakatime/wakatime-cli/releases/download';
  private githubReleasesStableUrl =
    'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest';
  private githubReleasesAlphaUrl =
    'https://api.github.com/repos/wakatime/wakatime-cli/releases?per_page=1';
  private latestCliVersion = '';

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
  }

  private getResourcesLocation() {
    if (this.resourcesLocation) return this.resourcesLocation;

    const folder = path.join(Desktop.getHomeDirectory(), '.wakatime');
    try {
      fs.mkdirSync(folder, { recursive: true });
      this.resourcesLocation = folder;
    } catch (e) {
      this.resourcesLocation = "./.wakatime";
    }
    return this.resourcesLocation;
  }

  public getCliLocation(): string {
    if (this.cliLocation) return this.cliLocation;

    this.cliLocation = this.getCliLocationGlobal();
    if (this.cliLocation) return this.cliLocation;

    const ext = Desktop.isWindows() ? '.exe' : '';
    let osname = os.platform() as string;
    if (osname == 'win32') osname = 'windows';
    const arch = this.architecture();
    this.cliLocation = path.join(
      this.getResourcesLocation(),
      `wakatime-cli-${osname}-${arch}${ext}`,
    );

    return this.cliLocation;
  }

  public getCliLocationGlobal(): string | undefined {
    if (this.cliLocationGlobal) return this.cliLocationGlobal;

    const binaryName = `wakatime-cli${Desktop.isWindows() ? '.exe' : ''}`;
    const path = which.sync(binaryName, { nothrow: true });
    if (path) {
      this.cliLocationGlobal = path;
      this.logger.debug(`Using global wakatime-cli location: ${path}`);
    }

    return this.cliLocationGlobal;
  }

  public isCliInstalled(): boolean {
    if (this.cliInstalled) return true;
    this.cliInstalled = fs.existsSync(this.getCliLocation());
    return this.cliInstalled;
  }

  public checkAndInstallCli(callback: () => void): void {
    if (!this.isCliInstalled()) {
      this.installCli(callback);
    } else {
      this.isCliLatest((isLatest) => {
        if (!isLatest) {
          this.installCli(callback);
        } else {
          callback();
        }
      });
    }
  }

  private isCliLatest(callback: (arg0: boolean) => void): void {
    if (this.getCliLocationGlobal()) {
      callback(true);
      return;
    }

    const args = ['--version'];
    const options = Desktop.buildOptions();
    try {
      child_process.execFile(this.getCliLocation(), args, options, (error, _stdout, stderr) => {
        if (!(error != null)) {
          const currentVersion = _stdout.toString().trim() + stderr.toString().trim();
          this.logger.debug(`Current wakatime-cli version is ${currentVersion}`);

          this.logger.debug('Checking for updates to wakatime-cli...');
          this.getLatestCliVersion((latestVersion) => {
            if (currentVersion === latestVersion) {
              this.logger.debug('wakatime-cli is up to date');
              callback(true);
            } else if (latestVersion) {
              this.logger.debug(`Found an updated wakatime-cli ${latestVersion}`);
              callback(false);
            } else {
              this.logger.debug('Unable to find latest wakatime-cli version');
              callback(false);
            }
          });
        } else {
          callback(false);
        }
      });
    } catch (e) {
      callback(false);
    }
  }

  private getLatestCliVersion(callback: (arg0: string) => void): void {
    if (this.latestCliVersion) {
      callback(this.latestCliVersion);
      return;
    }
    this.options.getSetting('settings', 'proxy', false, (proxy: OptionSetting) => {
      this.options.getSetting('settings', 'no_ssl_verify', false, (noSSLVerify: OptionSetting) => {
        this.options.getSetting(
          'internal',
          'cli_version_last_modified',
          true,
          (modified: OptionSetting) => {
            this.options.getSetting('internal', 'cli_version', true, (version: OptionSetting) => {
              this.options.getSetting('settings', 'alpha', false, (alpha: OptionSetting) => {
                const options: request.OptionsWithUrl = {
                  url:
                    alpha.value == 'true'
                      ? this.githubReleasesAlphaUrl
                      : this.githubReleasesStableUrl,
                  json: true,
                  headers: {
                    'User-Agent': 'github.com/wakatime/vscode-wakatime',
                  },
                };
                if (proxy.value) {
                  this.logger.debug(`Using Proxy: ${proxy.value}`);
                  options['proxy'] = proxy.value;
                }
                if (noSSLVerify.value === 'true') options['strictSSL'] = false;
                if (modified.value && version.value && options.headers)
                  options.headers['If-Modified-Since'] = modified.value;
                try {
                  request.get(options, (error, response, json) => {
                    if (
                      !error &&
                      response &&
                      (response.statusCode == 200 || response.statusCode == 304)
                    ) {
                      this.logger.debug(`GitHub API Response ${response.statusCode}`);
                      if (response.statusCode == 304) {
                        this.latestCliVersion = version.value;
                        callback(this.latestCliVersion);
                        return;
                      }
                      this.latestCliVersion =
                        alpha.value == 'true' ? json[0]['tag_name'] : json['tag_name'];
                      this.logger.debug(
                        `Latest wakatime-cli version from GitHub: ${this.latestCliVersion}`,
                      );
                      const lastModified = response.headers['last-modified'] as string;
                      if (lastModified && this.latestCliVersion) {
                        this.options.setSettings(
                          'internal',
                          [
                            { key: 'cli_version', value: this.latestCliVersion },
                            { key: 'cli_version_last_modified', value: lastModified },
                          ],
                          true,
                        );
                      }
                      callback(this.latestCliVersion);
                    } else {
                      if (response) {
                        this.logger.warn(`GitHub API Response ${response.statusCode}: ${error}`);
                      } else {
                        this.logger.warn(`GitHub API Response Error: ${error}`);
                      }
                      callback('');
                    }
                  });
                } catch (e) {
                  this.logger.warnException(e);
                  callback('');
                }
              });
            });
          },
        );
      });
    });
  }

  private installCli(callback: () => void): void {
    this.getLatestCliVersion((version) => {
      if (!version) {
        callback();
        return;
      }
      this.logger.debug(`Downloading wakatime-cli ${version}...`);
      const url = this.cliDownloadUrl(version);
      const zipFile = path.join(
        this.getResourcesLocation(),
        'wakatime-cli' + this.randStr() + '.zip',
      );
      this.downloadFile(
        url,
        zipFile,
        () => {
          this.extractCli(zipFile, callback);
        },
        callback,
      );
    });
  }

  private isSymlink(file: string): boolean {
    try {
      return fs.lstatSync(file).isSymbolicLink();
    // eslint-disable-next-line no-empty
    } catch (_) {}
    return false;
  }

  private extractCli(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-cli into "${this.getResourcesLocation()}"...`);
    this.removeCli(() => {
      this.unzip(zipFile, this.getResourcesLocation(), () => {
        if (!Desktop.isWindows()) {
          const cli = this.getCliLocation();
          try {
            this.logger.debug('Chmod 755 wakatime-cli...');
            fs.chmodSync(cli, 0o755);
          } catch (e) {
            this.logger.warnException(e);
          }
          const ext = Desktop.isWindows() ? '.exe' : '';
          const link = path.join(this.getResourcesLocation(), `wakatime-cli${ext}`);
          if (!this.isSymlink(link)) {
            try {
              this.logger.debug(`Create symlink from wakatime-cli to ${cli}`);
              fs.symlinkSync(cli, link);
            } catch (e) {
              this.logger.warnException(e);
              try {
                fs.copyFileSync(cli, link);
                fs.chmodSync(link, 0o755);
              } catch (e2) {
                this.logger.warnException(e2);
              }
            }
          }
        }
        callback();
      });
      this.logger.debug('Finished extracting wakatime-cli.');
    });
  }

  private removeCli(callback: () => void): void {
    if (fs.existsSync(this.getCliLocation())) {
      fs.unlink(this.getCliLocation(), () => {
        callback();
      });
    } else {
      callback();
    }
  }

  private downloadFile(
    url: string,
    outputFile: string,
    callback: () => void,
    error: () => void,
  ): void {
    this.options.getSetting('settings', 'proxy', false, (proxy: OptionSetting) => {
      this.options.getSetting('settings', 'no_ssl_verify', false, (noSSLVerify: OptionSetting) => {
				const options: request.OptionsWithUrl = { url: url };
        if (proxy.value) {
          this.logger.debug(`Using Proxy: ${proxy.value}`);
          options['proxy'] = proxy.value;
        }
        if (noSSLVerify.value === 'true') options['strictSSL'] = false;
        try {
          const r = request.get(options);
          r.on('error', (e) => {
            this.logger.warn(`Failed to download ${url}`);
            this.logger.warn(e.toString());
            error();
          });
          const out = fs.createWriteStream(outputFile);
          r.pipe(out);
          r.on('end', () => {
            out.on('finish', () => {
              callback();
            });
          });
        } catch (e) {
          this.logger.warnException(e);
          callback();
        }
      });
    });
  }

  private unzip(file: string, outputDir: string, callback: () => void): void {
    if (fs.existsSync(file)) {
      try {
        const zip = new AdmZip(file);
        zip.extractAllTo(outputDir, true);
      } catch (e) {
        this.logger.errorException(e);
      } finally {
        try {
          fs.unlink(file, () => {
            callback();
          });
        } catch (e2) {
          callback();
        }
      }
    }
  }

  private architecture(): string {
    const arch = os.arch();
    if (arch.indexOf('32') > -1) return '386';
    if (arch.indexOf('x64') > -1) return 'amd64';
    return arch;
  }

  private cliDownloadUrl(version: string): string {
    let osname = os.platform() as string;
    if (osname == 'win32') osname = 'windows';
    const arch = this.architecture();

    const validCombinations = [
      'darwin-amd64',
      'darwin-arm64',
      'freebsd-386',
      'freebsd-amd64',
      'freebsd-arm',
      'linux-386',
      'linux-amd64',
      'linux-arm',
      'linux-arm64',
      'netbsd-386',
      'netbsd-amd64',
      'netbsd-arm',
      'openbsd-386',
      'openbsd-amd64',
      'openbsd-arm',
      'openbsd-arm64',
      'windows-386',
      'windows-amd64',
      'windows-arm64',
    ];
    if (!validCombinations.includes(`${osname}-${arch}`))
      this.reportMissingPlatformSupport(osname, arch);

    return `${this.githubDownloadPrefix}/${version}/wakatime-cli-${osname}-${arch}.zip`;
  }

  private reportMissingPlatformSupport(osname: string, architecture: string): void {
    const url = `https://api.wakatime.com/api/v1/cli-missing?osname=${osname}&architecture=${architecture}&plugin=vscode`;
    this.options.getSetting('settings', 'proxy', false, (proxy: OptionSetting) => {
      this.options.getSetting('settings', 'no_ssl_verify', false, (noSSLVerify: OptionSetting) => {
				const options: request.OptionsWithUrl = { url: url };
        if (proxy.value) options['proxy'] = proxy.value;
        if (noSSLVerify.value === 'true') options['strictSSL'] = false;
        try {
          request.get(options);
        // eslint-disable-next-line no-empty
        } catch (e) { }
      });
    });
  }

  private randStr(): string {
    return (Math.random() + 1).toString(36).substring(7);
  }
}
