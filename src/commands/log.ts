import chalk from 'chalk';
import ora from 'ora';
import type { ApiIdea } from '@neuralrepo/shared';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaRow } from '../format.js';

export async function logCommand(
  opts: { limit?: string; status?: string; tag?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Loading ideas...').start();
  const explicitLimit = opts.limit ? parseInt(opts.limit, 10) : undefined;
  const pageSize = 100;

  // Auto-paginate: fetch all ideas in pages when no explicit limit
  const allIdeas: ApiIdea[] = [];
  let offset = 0;
  let remaining = explicitLimit ?? Infinity;

  while (remaining > 0) {
    const fetchLimit = Math.min(pageSize, remaining);
    const data = await api.listIdeas(config, {
      limit: fetchLimit,
      offset,
      status: opts.status,
      tag: opts.tag,
    });

    allIdeas.push(...data.ideas);
    offset += data.ideas.length;
    remaining -= data.ideas.length;

    // Stop if server returned fewer than requested (no more data)
    if (data.ideas.length < fetchLimit || !data.has_more) break;
  }

  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(allIdeas, null, 2));
    return;
  }

  if (allIdeas.length === 0) {
    console.log(chalk.dim('No ideas found.'));
    return;
  }

  for (const idea of allIdeas) {
    console.log(formatIdeaRow(idea));
  }
}
