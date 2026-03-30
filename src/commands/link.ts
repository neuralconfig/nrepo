import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { RELATION_TYPES } from '@neuralrepo/shared';
import type { RelationType } from '@neuralrepo/shared';

const VALID_TYPES: readonly string[] = RELATION_TYPES.filter((t) => t !== 'duplicate');

export async function linkCommand(
  sourceId: string,
  targetId: string,
  opts: { type?: string; note?: string; force?: boolean; json?: boolean; batch?: boolean },
): Promise<void> {
  // Batch mode: nrepo link --batch (reads JSON array from stdin)
  if (opts.batch) {
    return linkBatchCommand(opts);
  }

  const config = await getAuthenticatedConfig();
  const src = parseInt(sourceId, 10);
  const tgt = parseInt(targetId, 10);

  if (isNaN(src) || isNaN(tgt)) {
    console.error('Invalid idea IDs');
    process.exit(1);
  }

  const relationType = opts.type ?? 'related';
  if (!VALID_TYPES.includes(relationType as RelationType)) {
    console.error(`Invalid type "${relationType}". Must be one of: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Creating link...').start();

  try {
    const result = await api.createRelation(config, src, tgt, relationType, opts.note, opts.force);
    spinner?.stop();

    if (opts.json) {
      console.log(JSON.stringify(result.relation, null, 2));
      return;
    }

    console.log(chalk.green('✓') + ` Linked #${src} → #${tgt} (${relationType})`);
    if (opts.note) {
      console.log(chalk.dim(`  Note: ${opts.note}`));
    }
  } catch (err) {
    spinner?.stop();
    if (err instanceof api.ApiError && err.status === 409) {
      if (opts.json) {
        console.error(JSON.stringify({ error: err.message, code: 'cycle_detected' }));
      } else {
        console.error(chalk.red(err.message));
        if (!opts.force && (relationType === 'supersedes' || relationType === 'parent')) {
          console.error(chalk.dim('  Use --force to bypass this check.'));
        }
      }
      process.exit(1);
    }
    throw err;
  }
}

async function linkBatchCommand(
  opts: { force?: boolean; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();

  // Read JSON from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString('utf-8').trim();

  if (!input) {
    console.error('No input received. Pipe a JSON array to stdin.');
    console.error(chalk.dim('  Example: echo \'[{"source_idea_id":1,"target_idea_id":2}]\' | nrepo link --batch'));
    process.exit(1);
  }

  let links: api.BulkLinkInput[];
  try {
    links = JSON.parse(input);
    if (!Array.isArray(links)) throw new Error('Input must be a JSON array');
  } catch (err) {
    console.error(`Invalid JSON: ${(err as Error).message}`);
    process.exit(1);
  }

  if (links.length === 0) {
    console.error('Empty array — nothing to link.');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora(`Creating ${links.length} links...`).start();

  const result = await api.createBulkRelations(config, links, opts.force);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const r of result.results) {
    if (r.status === 'created') {
      console.log(chalk.green('✓') + ` Linked #${r.source_idea_id} → #${r.target_idea_id} (${r.relation_type})`);
    } else {
      console.log(chalk.red('✗') + ` #${r.source_idea_id} → #${r.target_idea_id}: ${r.error}`);
    }
  }

  console.log('');
  console.log(`${chalk.green(result.linked.toString())} created, ${result.errors > 0 ? chalk.red(result.errors.toString()) : '0'} errors`);
}

export async function unlinkCommand(
  sourceId: string,
  targetId: string,
  opts: { json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const src = parseInt(sourceId, 10);
  const tgt = parseInt(targetId, 10);

  if (isNaN(src) || isNaN(tgt)) {
    console.error('Invalid idea IDs');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Removing link...').start();

  // Find the relation between these two ideas
  const relations = await api.getIdeaRelations(config, src);
  const match = relations.outgoing.find((r) => r.idea_id === tgt)
    ?? relations.incoming.find((r) => r.idea_id === tgt);

  if (!match) {
    spinner?.stop();
    if (opts.json) {
      console.error(JSON.stringify({ error: 'No link found between these ideas' }));
    } else {
      console.error(`No link found between #${src} and #${tgt}. Run ${chalk.cyan(`nrepo links ${src}`)} to see existing links.`);
    }
    process.exit(1);
  }

  await api.deleteRelation(config, match.id);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ success: true }));
    return;
  }

  console.log(chalk.green('✓') + ` Unlinked #${src} ↔ #${tgt}`);
}

export async function linksCommand(
  id: string,
  opts: { type?: string; json?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Loading links...').start();
  const [idea, relations] = await Promise.all([
    api.getIdea(config, ideaId),
    api.getIdeaRelations(config, ideaId),
  ]);
  spinner?.stop();

  // Filter by type if specified
  let { outgoing, incoming } = relations;
  if (opts.type) {
    outgoing = outgoing.filter((r) => r.relation_type === opts.type);
    incoming = incoming.filter((r) => r.relation_type === opts.type);
  }

  if (opts.json) {
    console.log(JSON.stringify({ outgoing, incoming }, null, 2));
    return;
  }

  console.log(chalk.bold(`Links for #${idea.number} "${idea.title}":`));

  if (outgoing.length === 0 && incoming.length === 0) {
    console.log(chalk.dim('  No links'));
    return;
  }

  const DISPLAY: Record<string, { out: string; in: string; arrow: string }> = {
    blocks: { out: 'Blocks', in: 'Blocked by', arrow: '→' },
    inspires: { out: 'Inspires', in: 'Inspired by', arrow: '→' },
    supersedes: { out: 'Supersedes', in: 'Superseded by', arrow: '→' },
    parent: { out: 'Parent of', in: 'Child of', arrow: '→' },
    related: { out: 'Related', in: 'Related', arrow: '↔' },
    duplicate: { out: 'Similar', in: 'Similar', arrow: '↔' },
  };

  // Group outgoing by type
  const outByType = new Map<string, typeof outgoing>();
  for (const r of outgoing) {
    const list = outByType.get(r.relation_type) ?? [];
    list.push(r);
    outByType.set(r.relation_type, list);
  }

  // Group incoming by type (skip bidirectional if already shown)
  const inByType = new Map<string, typeof incoming>();
  for (const r of incoming) {
    const list = inByType.get(r.relation_type) ?? [];
    list.push(r);
    inByType.set(r.relation_type, list);
  }

  for (const [type, items] of outByType) {
    const d = DISPLAY[type] ?? { out: type, arrow: '→' };
    console.log('');
    console.log(`  ${chalk.bold(d.out)} ${d.arrow}`);
    for (const r of items) {
      const status = chalk.dim(`[${r.idea_status}]`);
      const note = r.note ? chalk.dim(` — ${r.note}`) : '';
      console.log(`    #${r.idea_number}  ${r.idea_title} ${status}${note}`);
    }
  }

  for (const [type, items] of inByType) {
    // Skip bidirectional types already shown outgoing
    if ((type === 'related' || type === 'duplicate') && outByType.has(type)) continue;
    const d = DISPLAY[type] ?? { in: type, arrow: '←' };
    console.log('');
    console.log(`  ${chalk.bold(d.in)} ←`);
    for (const r of items) {
      const status = chalk.dim(`[${r.idea_status}]`);
      const note = r.note ? chalk.dim(` — ${r.note}`) : '';
      console.log(`    #${r.idea_number}  ${r.idea_title} ${status}${note}`);
    }
  }

  console.log('');
}
