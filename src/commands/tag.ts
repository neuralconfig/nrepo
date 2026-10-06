import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { resolveIdea, resolveIdeaList, labelFor } from '../ids.js';
import { splitTags } from '../tags.js';

export async function tagCommand(id: string, rawTags: string[], opts: { json?: boolean }): Promise<void> {
  const tags = splitTags(rawTags);
  if (tags.length === 0) {
    console.error('Provide at least one tag');
    process.exit(1);
  }

  const config = await getAuthenticatedConfig();
  const { id: ideaId } = await resolveIdea(config, id);

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

  console.log(chalk.green('✓') + ` #${idea.number} tags: ${idea.tags.join(', ')}`);
}

export async function tagAddCommand(
  tag: string,
  opts: { ids: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const resolved = await resolveIdeaList(config, opts.ids);
  const ids = resolved.map((r) => r.id);
  const tags = splitTags([tag]);
  if (tags.length === 0) {
    console.error('Provide at least one tag');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Adding ${tags.join(", ")} to ${ids.length} ideas...`).start();
  const result = await api.bulkUpdateIdeas(config, { ids, add_tags: tags });
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
  console.log(`${chalk.green(result.updated.toString())} tagged with ${tags.join(", ")}, ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
}

export async function tagRemoveCommand(
  tag: string,
  opts: { ids: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const resolved = await resolveIdeaList(config, opts.ids);
  const ids = resolved.map((r) => r.id);
  const tags = splitTags([tag]);
  if (tags.length === 0) {
    console.error('Provide at least one tag');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Removing ${tags.join(", ")} from ${ids.length} ideas...`).start();
  const result = await api.bulkUpdateIdeas(config, { ids, remove_tags: tags });
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
  console.log(`${chalk.green(result.updated.toString())} untagged ${tags.join(", ")}, ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
}
