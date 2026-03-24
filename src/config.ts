import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'neuralrepo');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  api_url: string;
  api_key: string;
  user_id?: string;
  auth_method?: 'browser' | 'api-key';
}

const DEFAULT_API_URL = 'https://neuralrepo.com/api/v1';

export async function loadConfig(): Promise<Config | null> {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function clearConfig(): Promise<void> {
  if (existsSync(CONFIG_FILE)) {
    await writeFile(CONFIG_FILE, '{}', 'utf-8');
  }
}

export async function getAuthenticatedConfig(): Promise<Config> {
  const config = await loadConfig();
  if (!config?.api_key) {
    throw new AuthError('Not logged in. Run `nrepo login` to authenticate.');
  }
  return { ...config, api_url: config.api_url || DEFAULT_API_URL };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export { CONFIG_DIR, CONFIG_FILE, DEFAULT_API_URL };
