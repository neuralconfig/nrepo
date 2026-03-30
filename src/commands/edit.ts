import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';

export async function editCommand(
  id: string,
  opts: { title?: string; body?: string; json?: boolean; human?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const updates: Record<string, string> = {};
  if (opts.title) updates.title = opts.title;
  if (opts.body) updates.body = opts.body;

  if (Object.keys(updates).length === 0) {
    console.error(opts.json ? JSON.stringify({ error: 'Nothing to update. Use --title or --body.', code: 'no_input' }) : 'Nothing to update. Use --title or --body.');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Updating idea...').start();
  const updated = await api.updateIdea(config, ideaId, updates);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` Updated #${updated.number}`);
  if (opts.title) console.log(`  Title: ${chalk.bold(updated.title)}`);
  if (opts.body) console.log(`  Body updated (${updated.body?.length ?? 0} chars)`);
}
