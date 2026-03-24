import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaRow } from '../format.js';
import type { IdeaStatus, IdeaSource } from '@neuralrepo/shared';

export async function pushCommand(
  title: string,
  opts: { body?: string; tag?: string[]; status?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const spinner = opts.json ? null : ora('Creating idea...').start();

  const idea = await api.createIdea(config, {
    title,
    body: opts.body,
    tags: opts.tag,
    source: 'cli' as IdeaSource,
    status: opts.status as IdeaStatus | undefined,
  });

  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ' Idea captured');
  console.log(formatIdeaRow(idea));

  if (idea.processing) {
    console.log(chalk.dim('\n  Processing: embeddings, dedup, and auto-tagging queued'));
  }
}

export async function stashCommand(title: string, opts: { json?: boolean }): Promise<void> {
  await pushCommand(title, { json: opts.json });
}
