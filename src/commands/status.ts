import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatStatusCounts, formatIdeaRow, formatDuplicate } from '../format.js';
import type { IdeaStatus } from '@neuralrepo/shared';

const statusStyle: Record<IdeaStatus, (s: string) => string> = {
  captured: chalk.gray,
  exploring: chalk.cyan,
  building: chalk.yellow,
  shipped: chalk.green,
  shelved: chalk.dim,
};

export async function statusCommand(opts: { json?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Loading dashboard...').start();

  const [ideasData, dupsData, user] = await Promise.all([
    api.listIdeas(config, { limit: 100 }),
    api.listDuplicates(config),
    api.getMe(config),
  ]);

  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({
      user: { email: user.email, plan: user.plan },
      counts: formatStatusCounts(ideasData.ideas),
      total: ideasData.ideas.length,
      pending_duplicates: dupsData.duplicates.length,
    }, null, 2));
    return;
  }

  console.log(chalk.bold('NeuralRepo Dashboard'));
  console.log(chalk.dim(`${user.display_name ?? user.email} · ${user.plan}\n`));

  const counts = formatStatusCounts(ideasData.ideas);
  console.log(chalk.bold('Status breakdown'));
  for (const [status, count] of Object.entries(counts)) {
    const style = statusStyle[status as IdeaStatus] ?? chalk.white;
    const bar = '█'.repeat(Math.min(count, 40));
    console.log(`  ${style(status.padEnd(10))} ${style(bar)} ${count}`);
  }
  console.log(`  ${'total'.padEnd(10)} ${chalk.bold(String(ideasData.ideas.length))}\n`);

  // Recent captures
  const recent = ideasData.ideas
    .filter((i) => i.status === 'captured')
    .slice(0, 5);
  if (recent.length > 0) {
    console.log(chalk.bold('Recent captures'));
    for (const idea of recent) {
      console.log(`  ${formatIdeaRow(idea)}`);
    }
    console.log('');
  }

  // Pending duplicates
  const pendingDups = dupsData.duplicates.filter((d) => d.status === 'pending');
  if (pendingDups.length > 0) {
    console.log(chalk.bold(`Pending duplicates (${pendingDups.length})`));
    for (const dup of pendingDups.slice(0, 5)) {
      console.log(formatDuplicate(dup));
    }
  }
}
