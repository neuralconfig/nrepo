import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatDate } from '../format.js';

export async function keysListCommand(opts: { json?: boolean; human?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Loading API keys...').start();

  const { api_keys } = await api.listApiKeys(config);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ api_keys }, null, 2));
    return;
  }

  if (api_keys.length === 0) {
    console.log(chalk.dim('No API keys found. Create one with `nrepo keys create <label>`.'));
    return;
  }

  console.log(chalk.bold(`${api_keys.length} API key${api_keys.length === 1 ? '' : 's'}\n`));
  for (const key of api_keys) {
    const lastUsed = key.last_used_at ? formatDate(key.last_used_at) : chalk.dim('never');
    console.log(`  ${chalk.bold(key.label || chalk.dim('(no label)'))}  ${chalk.dim(key.id)}`);
    console.log(`    Created: ${formatDate(key.created_at)}  Last used: ${lastUsed}\n`);
  }
}

export async function keysCreateCommand(
  label: string,
  opts: { json?: boolean; human?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Creating API key...').start();

  const result = await api.createApiKey(config, label);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ' API key created\n');
  console.log(`  Label:  ${chalk.bold(result.label)}`);
  console.log(`  Key:    ${chalk.bold(result.key)}`);
  console.log(`\n${chalk.yellow('Save this key now — it won\'t be shown again.')}`);
}

export async function keysRevokeCommand(
  keyId: string,
  opts: { json?: boolean; human?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Revoking API key...').start();

  await api.deleteApiKey(config, keyId);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ success: true, revoked: keyId }));
    return;
  }

  console.log(chalk.green('✓') + ` API key ${chalk.dim(keyId)} revoked.`);
}
