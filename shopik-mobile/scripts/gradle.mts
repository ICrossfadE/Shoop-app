import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use only the fixed Gradle tasks; never interpolate user input into a shell command.
const task = process.argv[2];
if (task !== 'assembleDebug' && task !== 'assembleRelease') throw new Error('Unsupported Gradle task');
const windows = process.platform === 'win32';
const directory = fileURLToPath(new URL('../android', import.meta.url));
const result = windows
  ? spawnSync('cmd.exe', ['/d', '/c', '.\\gradlew.bat', task], { cwd: directory, stdio: 'inherit' })
  : spawnSync('./gradlew', [task], { cwd: directory, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
