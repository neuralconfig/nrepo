import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';

export async function pullCommand(id: string, opts: { to?: string; json?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Pulling idea context...').start();
  const idea = await api.getIdea(config, ideaId);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  const dir = resolve(opts.to ?? '.');
  await mkdir(dir, { recursive: true });

  // IDEA.md — main idea content
  const ideaMd = [
    `# ${idea.title}`,
    '',
    `**Status:** ${idea.status}`,
    `**Source:** ${idea.source}`,
    `**Created:** ${idea.created_at}`,
    idea.tags.length ? `**Tags:** ${idea.tags.join(', ')}` : '',
    idea.source_url ? `**URL:** ${idea.source_url}` : '',
    '',
    '---',
    '',
    idea.body ?? '_No body_',
  ].filter(Boolean).join('\n');

  await writeFile(join(dir, 'IDEA.md'), ideaMd + '\n', 'utf-8');

  // CONTEXT.md — related ideas
  const relations = idea.relations ?? [];
  if (relations.length > 0) {
    const contextLines = [
      '# Related Ideas',
      '',
      ...relations.map((r) => {
        const score = r.score != null ? ` (${(r.score * 100).toFixed(0)}%)` : '';
        const title = r.related_idea_title ?? `#${r.target_idea_id}`;
        return `- **${r.relation_type}**: ${title}${score}`;
      }),
    ];
    await writeFile(join(dir, 'CONTEXT.md'), contextLines.join('\n') + '\n', 'utf-8');
  }

  // RELATED.md — links
  const links = idea.links ?? [];
  if (links.length > 0) {
    const linkLines = [
      '# Links',
      '',
      ...links.map((l) => `- [${l.title ?? l.link_type}](${l.url})`),
    ];
    await writeFile(join(dir, 'RELATED.md'), linkLines.join('\n') + '\n', 'utf-8');
  }

  // .neuralrepo — sync config
  const syncConfig = {
    idea_id: idea.id,
    api_url: config.api_url,
    pulled_at: new Date().toISOString(),
  };
  await writeFile(join(dir, '.neuralrepo'), JSON.stringify(syncConfig, null, 2) + '\n', 'utf-8');

  console.log(chalk.green('✓') + ` Pulled #${idea.id} to ${dir}/`);
  console.log(chalk.dim(`  IDEA.md${relations.length ? ', CONTEXT.md' : ''}${links.length ? ', RELATED.md' : ''}, .neuralrepo`));
}
