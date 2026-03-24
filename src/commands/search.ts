import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaRow } from '../format.js';

export async function searchCommand(
  query: string,
  opts: { limit?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Searching...').start();
  const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
  const data = await api.searchIdeas(config, query, limit);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(chalk.dim(`Search: "${query}" (${data.search_type}) — ${data.results.length} results\n`));

  if (data.results.length === 0) {
    console.log(chalk.dim('  No results found.'));
    return;
  }

  for (const idea of data.results) {
    console.log(formatIdeaRow(idea));
  }
}
