import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { resolveIdea, resolveIdeaList, labelFor } from '../ids.js';
import { IDEA_STATUSES } from '@neuralrepo/shared';
import type { IdeaStatus } from '@neuralrepo/shared';

export async function moveCommand(id: string, status: string, opts: { json?: boolean }): Promise<void> {
  if (!IDEA_STATUSES.includes(status as IdeaStatus)) {
    console.error(`Invalid status "${status}". Must be one of: ${IDEA_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const config = await getAuthenticatedConfig();
  const { id: ideaId } = await resolveIdea(config, id);

  const spinner = opts.json ? null : ora('Updating status...').start();
  const idea = await api.updateIdea(config, ideaId, { status: status as IdeaStatus });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` #${idea.number} → ${status}`);
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
  const resolved = await resolveIdeaList(config, opts.ids);
  const ids = resolved.map((r) => r.id);

  const spinner = opts.json ? null : ora(`Moving ${ids.length} ideas to ${status}...`).start();

  const result = await api.bulkUpdateIdeas(config, { ids, status });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const r of result.results) {
    if (r.status === 'updated') {
      console.log(`  ${chalk.green('✓')} ${labelFor(resolved, r.id)}`);
    } else {
      console.log(`  ${chalk.red('✗')} ${labelFor(resolved, r.id)}  ${r.error}`);
    }
  }
  console.log(`${chalk.green(result.updated.toString())} moved to ${status}, ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
}
