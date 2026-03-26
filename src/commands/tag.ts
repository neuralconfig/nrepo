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
  const result = await api.bulkUpdateIdeas(config, { ids, add_tags: [tag] });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const r of result.results) {
    if (r.status === 'updated') {
      console.log(`  ${chalk.green('✓')} #${r.id}`);
    } else {
      console.log(`  ${chalk.red('✗')} #${r.id}  ${r.error}`);
    }
  }
  console.log(`${chalk.green(result.updated.toString())} tagged with "${tag}", ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
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
  const result = await api.bulkUpdateIdeas(config, { ids, remove_tags: [tag] });
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const r of result.results) {
    if (r.status === 'updated') {
      console.log(`  ${chalk.green('✓')} #${r.id}`);
    } else {
      console.log(`  ${chalk.red('✗')} #${r.id}  ${r.error}`);
    }
  }
  console.log(`${chalk.green(result.updated.toString())} untagged "${tag}", ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
}

function parseIds(idsStr: string): number[] {
  return idsStr
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}
