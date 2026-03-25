import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatDuplicate } from '../format.js';

export async function duplicateListCommand(opts: { json?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Loading duplicates...').start();

  const { duplicates } = await api.listDuplicates(config);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ duplicates }, null, 2));
    return;
  }

  const pending = duplicates.filter((d) => d.status === 'pending');

  if (pending.length === 0) {
    console.log(chalk.dim('No pending duplicates.'));
    return;
  }

  console.log(chalk.bold(`${pending.length} pending duplicate${pending.length === 1 ? '' : 's'}\n`));
  for (const dup of pending) {
    console.log(formatDuplicate(dup));
  }
  console.log('');
  console.log(chalk.dim('  Use `nrepo duplicate dismiss <id>` or `nrepo duplicate merge <id>` to resolve.'));
}

export async function duplicateDismissCommand(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const dupId = parseInt(id, 10);

  if (isNaN(dupId)) {
    console.error('Invalid duplicate ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Dismissing duplicate...').start();
  await api.dismissDuplicate(config, dupId);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ success: true, dismissed: dupId }));
    return;
  }

  console.log(chalk.green('✓') + ` Dismissed duplicate #${dupId}`);
}

export async function duplicateMergeCommand(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const dupId = parseInt(id, 10);

  if (isNaN(dupId)) {
    console.error('Invalid duplicate ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Merging duplicate...').start();
  await api.mergeDuplicate(config, dupId);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ success: true, merged: dupId }));
    return;
  }

  console.log(chalk.green('✓') + ` Merged duplicate #${dupId} into primary idea`);
}
