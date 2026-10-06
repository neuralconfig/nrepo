import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { resolveIdea } from '../ids.js';
import { formatIdeaRow } from '../format.js';
import type { IdeaSource } from '@neuralrepo/shared';

export async function branchCommand(
  id: string,
  opts: { title?: string; body?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const { id: sourceId, label: sourceIdLabel } = await resolveIdea(config, id);

  const spinner = opts.json ? null : ora('Branching idea...').start();

  // Fetch the source idea
  const source = await api.getIdea(config, sourceId);

  // Create the fork with parent_id linking back
  const forked = await api.createIdea(config, {
    title: opts.title ?? source.title,
    body: opts.body ?? source.body ?? undefined,
    tags: source.tags,
    source: 'cli' as IdeaSource,
    status: 'captured',
    parent_id: sourceId,
  });

  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(forked, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` Branched from ${sourceIdLabel} as #${forked.number}`);
  console.log(formatIdeaRow(forked));

  if (forked.processing) {
    console.log(chalk.dim('\n  Processing: embeddings, dedup, and auto-tagging queued'));
  }

  console.log(chalk.dim(`\n  Compare with: nrepo diff ${sourceIdLabel} #${forked.number}`));
}
