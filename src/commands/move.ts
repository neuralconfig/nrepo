import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { IDEA_STATUSES } from '@neuralrepo/shared';
import type { IdeaStatus } from '@neuralrepo/shared';

export async function moveCommand(id: string, status: string, opts: { json?: boolean }): Promise<void> {
  if (!IDEA_STATUSES.includes(status as IdeaStatus)) {
    console.error(`Invalid status "${status}". Must be one of: ${IDEA_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Updating status...').start();
  const idea = await api.updateIdea(config, ideaId, { status: status as IdeaStatus });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` #${idea.id} → ${status}`);
}

export async function moveBulkCommand(
  status: string,
  opts: { ids: string; json?: boolean },
): Promise<void> {
  if (!IDEA_STATUSES.includes(status as IdeaStatus)) {
    console.error(`Invalid status "${status}". Must be one of: ${IDEA_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const config = await getAuthenticatedConfig();
  const ids = opts.ids
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (ids.length === 0) {
    console.error('Provide at least one ID with --ids');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Moving ${ids.length} ideas to ${status}...`).start();

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const idea = await api.updateIdea(config, id, { status: status as IdeaStatus });
      return { id, title: idea.title };
    })
  );

  spinner?.stop();

  if (opts.json) {
    const output = results.map((r, i) => ({
      id: ids[i],
      success: r.status === 'fulfilled',
      error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`Moved ${ids.length} ideas to ${status}:`);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ${chalk.green('✓')} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk.red('✗')} #${ids[i]}  ${(r.reason as Error).message}`);
    }
  });
}
