import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { CONFIG_DIR } from './config.js';

const CHECK_FILE = join(CONFIG_DIR, 'update-check.json');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PACKAGE_NAME = '@neuralconfig/nrepo';

interface UpdateCheck {
  last_checked: string;
  latest_version: string | null;
}

/**
 * Synchronous cache read + print, then fire-and-forget background fetch.
 * Call before program.parse() so the notice appears before command output.
 * Never throws.
 */
export function checkForUpdates(currentVersion: string): void {
  if (process.env['NREPO_NO_UPDATE_CHECK'] === '1') return;

  try {
    const cached = readCachedCheck();

    if (cached?.latest_version && isNewer(cached.latest_version, currentVersion)) {
      printUpdateNotice(currentVersion, cached.latest_version);
    }

    if (!cached || isStale(cached.last_checked)) {
      fetchAndCache(currentVersion);
    }
  } catch {
    // Never fail the CLI over an update check
  }
}

function printUpdateNotice(current: string, latest: string): void {
  console.error(
    chalk.dim(`  nrepo ${latest} available (current: ${current}). Run `) +
    chalk.dim.bold('npm i -g @neuralconfig/nrepo') +
    chalk.dim(' to update.'),
  );
  console.error('');
}

function readCachedCheck(): UpdateCheck | null {
  if (!existsSync(CHECK_FILE)) return null;
  try {
    const raw = readFileSync(CHECK_FILE, 'utf-8');
    return JSON.parse(raw) as UpdateCheck;
  } catch {
    return null;
  }
}

function isStale(lastChecked: string): boolean {
  return Date.now() - new Date(lastChecked).getTime() > WEEK_MS;
}

function isNewer(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Fire-and-forget: fetch latest version from npm, cache result, and
 * auto-update the Claude Code skill file if a new version is available.
 */
function fetchAndCache(currentVersion: string): void {
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(
        `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) return;

      const data = (await res.json()) as { version: string };
      const latest = data.version;

      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
      }

      const check: UpdateCheck = {
        last_checked: new Date().toISOString(),
        latest_version: latest,
      };
      await writeFile(CHECK_FILE, JSON.stringify(check, null, 2) + '\n', 'utf-8');

      // Auto-update skill file when a newer version is detected
      if (isNewer(latest, currentVersion)) {
        await updateSkillFile();
      }
    } catch {
      // Network failure, timeout, etc. — silently ignore
    }
  })();
}

/**
 * Copy the bundled SKILL.md to ~/.claude/skills/neuralrepo/ if Claude Code
 * is installed. This keeps the skill in sync even between npm updates.
 */
async function updateSkillFile(): Promise<void> {
  try {
    const claudeDir = join(homedir(), '.claude');
    if (!existsSync(claudeDir)) return;

    const skillDir = join(claudeDir, 'skills', 'neuralrepo');
    if (!existsSync(skillDir)) {
      await mkdir(skillDir, { recursive: true });
    }

    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'skill', 'SKILL.md');
    if (!existsSync(src)) return;

    const dest = join(skillDir, 'SKILL.md');
    await copyFile(src, dest);
  } catch {
    // Silent — never break the CLI over skill sync
  }
}
