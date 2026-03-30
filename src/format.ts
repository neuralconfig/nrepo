import chalk from 'chalk';
import type { ApiIdea, ApiIdeaLink, ApiIdeaRelation, ApiDuplicateDetection, IdeaStatus } from '@neuralrepo/shared';
import { SOURCE_ICONS, STATUS_COLORS } from '@neuralrepo/shared';

const statusStyle: Record<IdeaStatus, (s: string) => string> = {
  captured: chalk.gray,
  exploring: chalk.cyan,
  building: chalk.yellow,
  shipped: chalk.green,
  shelved: chalk.dim,
};

export function formatIdeaRow(idea: ApiIdea): string {
  const style = statusStyle[idea.status] ?? chalk.white;
  const icon = SOURCE_ICONS[idea.source] ?? '·';
  const tags = idea.tags.length ? chalk.dim(` [${idea.tags.join(', ')}]`) : '';
  const score = idea.score != null ? chalk.dim(` (${(idea.score * 100).toFixed(0)}%)`) : '';
  const num = chalk.dim(`#${idea.number}`);
  const status = style(idea.status.padEnd(10));
  return `${num} ${status} ${icon} ${idea.title}${tags}${score}`;
}

export function formatIdeaDetail(idea: ApiIdea & { links?: ApiIdeaLink[]; relations?: ApiIdeaRelation[] }): string {
  const lines: string[] = [];
  const style = statusStyle[idea.status] ?? chalk.white;
  const icon = SOURCE_ICONS[idea.source] ?? '·';

  lines.push(chalk.bold(`#${idea.number}  ${idea.title}`));
  lines.push('');
  lines.push(`  Status:   ${style(idea.status)}`);
  lines.push(`  Source:   ${icon} ${idea.source}`);
  lines.push(`  Created:  ${formatDate(idea.created_at)}`);
  lines.push(`  Updated:  ${formatDate(idea.updated_at)}`);

  if (idea.tags.length) {
    lines.push(`  Tags:     ${idea.tags.map((t) => chalk.cyan(t)).join(', ')}`);
  }

  if (idea.source_url) {
    lines.push(`  URL:      ${chalk.underline(idea.source_url)}`);
  }

  if (idea.body) {
    lines.push('');
    lines.push(chalk.dim('  ─'.repeat(30)));
    lines.push('');
    for (const line of idea.body.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  if (idea.links?.length) {
    lines.push('');
    lines.push(chalk.bold('  Links'));
    for (const link of idea.links) {
      const label = link.title ?? link.link_type;
      lines.push(`    ${chalk.dim('·')} ${label}: ${chalk.underline(link.url)}`);
    }
  }

  if (idea.relations?.length) {
    lines.push('');
    lines.push(chalk.bold('  Related Ideas'));
    for (const rel of idea.relations) {
      const relScore = rel.score != null ? chalk.dim(` (${(rel.score * 100).toFixed(0)}%)`) : '';
      const title = rel.related_idea_title ?? `#${rel.related_idea_number ?? rel.target_idea_id}`;
      lines.push(`    ${chalk.dim('·')} ${rel.relation_type}: ${title}${relScore}`);
    }
  }

  return lines.join('\n');
}

export function formatDuplicate(dup: ApiDuplicateDetection): string {
  const score = chalk.yellow(`${(dup.similarity_score * 100).toFixed(0)}%`);
  return `  ${chalk.dim(`#${dup.idea_number}`)} ${dup.idea_title} ${chalk.dim('≈')} #${dup.duplicate_number} ${dup.duplicate_title} ${score}`;
}

export function formatDate(iso: string): string {
  // D1 returns UTC datetimes without timezone indicator — ensure parsed as UTC
  const normalized = iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatStatusCounts(ideas: ApiIdea[]): Record<string, number> {
  const counts: Record<string, number> = {
    captured: 0,
    exploring: 0,
    building: 0,
    shipped: 0,
    shelved: 0,
  };
  for (const idea of ideas) {
    counts[idea.status] = (counts[idea.status] ?? 0) + 1;
  }
  return counts;
}
