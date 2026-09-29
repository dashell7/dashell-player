import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const releaseFiles = ['manifest.json', 'main.js', 'styles.css'];
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const releaseDir = join('release', manifest.version);
const zipName = `langplayer-${manifest.version}.zip`;
const zipPath = join(releaseDir, zipName);

for (const file of releaseFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing release file: ${file}`);
  }
}

if (existsSync(zipName)) {
  rmSync(zipName);
}
if (existsSync(releaseDir)) {
  rmSync(releaseDir, { recursive: true, force: true });
}
mkdirSync(releaseDir, { recursive: true });

for (const file of releaseFiles) {
  copyFileSync(file, join(releaseDir, file));
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  });
  return result.status === 0;
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function packageWithPowerShell(command) {
  const literalPaths = `@(${releaseFiles.map((file) => psQuote(join(releaseDir, file))).join(',')})`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Compress-Archive -LiteralPath ${literalPaths} -DestinationPath ${psQuote(zipPath)} -Force`,
  ].join('; ');
  return run(command, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}

let created = false;
if (process.platform === 'win32') {
  created = packageWithPowerShell('pwsh') || packageWithPowerShell('powershell.exe');
} else {
  created = run('zip', ['-X', '-q', zipName, ...releaseFiles], releaseDir);
}

if (!created || !existsSync(zipPath)) {
  throw new Error(`Failed to create ${zipPath}`);
}

console.log(`Created ${releaseDir} with individual assets and ${zipName}: ${releaseFiles.join(', ')}`);
