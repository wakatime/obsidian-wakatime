import * as fs from 'fs';
import * as os from 'os';

interface Option {
  windowsHide: boolean;
  env?: any;
}

export class Desktop {
  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }

  public static getHomeDirectory(): string {
    const home = process.env.WAKATIME_HOME;
    if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
    return process.env[this.isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
  }

  public static buildOptions(): any {
    const options: Option = {
      windowsHide: true,
    };
    if (!this.isWindows() && !process.env.WAKATIME_HOME && !process.env.HOME) {
      options['env'] = { ...process.env, WAKATIME_HOME: this.getHomeDirectory() };
    }
    return options;
  }
}
