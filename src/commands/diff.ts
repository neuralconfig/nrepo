import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import type { ApiIdea, ApiIdeaRelation } from '@neuralrepo/shared';

export async function diffCommand(
  id1: string,
  id2OrOpts: string | undefined | { json?: boolean; human?: boolean },
  opts?: { json?: boolean; human?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();

  const firstId = parseInt(id1, 10);
  if (isNaN(firstId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  // Commander passes (id1, id2, opts, Command) or (id1, undefined, opts, Command)
  // when [id2] is optional. Resolve accordingly.
  let secondId: number | undefined;
  let resolvedOpts: { json?: boolean; human?: boolean };

  if (typeof id2OrOpts === 'string') {
    secondId = parseInt(id2OrOpts, 10);
    if (isNaN(secondId)) {
      console.error('Invalid second idea ID');
      process.exit(1);
    }
    resolvedOpts = opts ?? {};
  } else if (id2OrOpts && typeof id2OrOpts === 'object') {
    resolvedOpts = id2OrOpts;
  } else {
    resolvedOpts = opts ?? {};
  }

  const jsonOutput = resolvedOpts.json ?? false;

  const spinner = jsonOutput ? null : ora('Loading ideas...').start();

  const ideaA = await api.getIdea(config, firstId);

  // If no second ID, find the best comparison target
  if (secondId == null) {
    secondId = findComparisonTarget(ideaA);
    if (secondId == null) {
      spinner?.stop();
      if (jsonOutput) {
        console.error(JSON.stringify({ error: `No parent or related idea to diff against. Usage: nrepo diff ${firstId} <other-id>`, code: 'no_diff_target' }));
        process.exit(1);
      }
      console.log(chalk.dim('No parent or related idea to diff against.'));
      console.log(chalk.dim(`Usage: nrepo diff ${firstId} <other-id>`));
      return;
    }
  }

  const ideaB = await api.getIdea(config, secondId);
  spinner?.stop();

  if (jsonOutput) {
    console.log(JSON.stringify({ a: ideaA, b: ideaB, diff: computeDiff(ideaA, ideaB) }, null, 2));
    return;
  }

  printDiff(ideaA, ideaB);
}

function findComparisonTarget(idea: ApiIdea & { relations?: ApiIdeaRelation[]; parent_id?: number | null }): number | undefined {
  // Check parent_id field first (set by branch command)
  if (idea.parent_id) return idea.parent_id;

  if (!idea.relations?.length) return undefined;

  // Then prefer parent relation type
  const parent = idea.relations.find((r) => r.relation_type === 'parent');
  if (parent) return parent.target_idea_id;

  // Then duplicate
  const duplicate = idea.relations.find((r) => r.relation_type === 'duplicate');
  if (duplicate) return duplicate.target_idea_id;

  // Then highest-scoring related
  const sorted = [...idea.relations].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return sorted[0]?.target_idea_id;
}

interface FieldDiff {
  field: string;
  a: string;
  b: string;
  changed: boolean;
}

function computeDiff(a: ApiIdea, b: ApiIdea): FieldDiff[] {
  const fields: { field: string; key: keyof ApiIdea }[] = [
    { field: 'Title', key: 'title' },
    { field: 'Body', key: 'body' },
    { field: 'Status', key: 'status' },
    { field: 'Source', key: 'source' },
    { field: 'Tags', key: 'tags' },
  ];

  return fields.map(({ field, key }) => {
    const valA = key === 'tags' ? (a.tags ?? []).join(', ') : String(a[key] ?? '');
    const valB = key === 'tags' ? (b.tags ?? []).join(', ') : String(b[key] ?? '');
    return { field, a: valA, b: valB, changed: valA !== valB };
  });
}

function printDiff(a: ApiIdea, b: ApiIdea): void {
  const diffs = computeDiff(a, b);
  const anyChanged = diffs.some((d) => d.changed);

  console.log(chalk.bold(`diff #${a.id} → #${b.id}`));
  console.log(chalk.dim('─'.repeat(60)));

  if (!anyChanged) {
    console.log(chalk.dim('  No differences found.'));
    return;
  }

  for (const d of diffs) {
    if (!d.changed) continue;

    console.log(chalk.bold(`\n  ${d.field}`));

    if (d.field === 'Body') {
      printBodyDiff(d.a, d.b);
    } else {
      console.log(chalk.red(`  - ${d.a || '(empty)'}`));
      console.log(chalk.green(`  + ${d.b || '(empty)'}`));
    }
  }

  console.log('');
}

function printBodyDiff(bodyA: string, bodyB: string): void {
  const linesA = (bodyA || '').split('\n');
  const linesB = (bodyB || '').split('\n');
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];

    if (lineA === lineB) {
      console.log(chalk.dim(`    ${lineA}`));
    } else {
      if (lineA != null) console.log(chalk.red(`  - ${lineA}`));
      if (lineB != null) console.log(chalk.green(`  + ${lineB}`));
    }
  }
}
