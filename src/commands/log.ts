import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaRow } from '../format.js';

export async function logCommand(
  opts: { limit?: string; status?: string; tag?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Loading ideas...').start();

  const data = await api.listIdeas(config, {
    limit: opts.limit ? parseInt(opts.limit, 10) : 20,
    status: opts.status,
    tag: opts.tag,
  });

  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(data.ideas, null, 2));
    return;
  }

  if (data.ideas.length === 0) {
    console.log(chalk.dim('No ideas found.'));
    return;
  }

  for (const idea of data.ideas) {
    console.log(formatIdeaRow(idea));
  }
}
