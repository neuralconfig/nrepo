import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';

export async function tagCommand(id: string, tags: string[], opts: { json?: boolean }): Promise<void> {
  if (tags.length === 0) {
    console.error('Provide at least one tag');
    process.exit(1);
  }

  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Updating tags...').start();

  // Get existing tags first, then merge
  const existing = await api.getIdea(config, ideaId);
  const merged = [...new Set([...existing.tags, ...tags])];
  const idea = await api.updateIdea(config, ideaId, { tags: merged });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` #${idea.id} tags: ${idea.tags.join(', ')}`);
}

export async function tagAddCommand(
  tag: string,
  opts: { ids: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ids = parseIds(opts.ids);

  if (ids.length === 0) {
    console.error('Provide at least one ID with --ids');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Adding tag "${tag}" to ${ids.length} ideas...`).start();

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const existing = await api.getIdea(config, id);
      const merged = [...new Set([...existing.tags, tag])];
      await api.updateIdea(config, id, { tags: merged });
      return { id, title: existing.title };
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

  console.log(`Tagged ${ids.length} ideas with "${tag}":`);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ${chalk.green('✓')} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk.red('✗')} #${ids[i]}  ${(r.reason as Error).message}`);
    }
  });
}

export async function tagRemoveCommand(
  tag: string,
  opts: { ids: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ids = parseIds(opts.ids);

  if (ids.length === 0) {
    console.error('Provide at least one ID with --ids');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Removing tag "${tag}" from ${ids.length} ideas...`).start();

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const existing = await api.getIdea(config, id);
      const filtered = existing.tags.filter((t) => t !== tag);
      await api.updateIdea(config, id, { tags: filtered });
      return { id, title: existing.title };
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

  console.log(`Removed tag "${tag}" from ${ids.length} ideas:`);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ${chalk.green('✓')} #${ids[i]}  ${r.value.title}`);
    } else {
      console.log(`  ${chalk.red('✗')} #${ids[i]}  ${(r.reason as Error).message}`);
    }
  });
}

function parseIds(idsStr: string): number[] {
  return idsStr
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}
