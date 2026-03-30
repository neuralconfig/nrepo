import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';

export async function rmCommand(
  id: string,
  opts: { json?: boolean; force?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  // Fetch idea for confirmation display
  const spinner = opts.json ? null : ora('Loading idea...').start();
  const idea = await api.getIdea(config, ideaId);
  spinner?.stop();

  if (!opts.json && !opts.force) {
    console.log(chalk.bold('Archive preview:'));
    console.log(`  #${idea.number} "${idea.title}" [${idea.status}]`);
    console.log('');
    console.log(chalk.dim('  The idea will be archived (soft-deleted).'));
    console.log('');
  }

  const archiveSpinner = opts.json ? null : ora('Archiving idea...').start();
  await api.deleteIdea(config, ideaId);
  archiveSpinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify({ success: true, archived: ideaId }));
    return;
  }

  console.log(chalk.green('✓') + ` Archived #${idea.number} "${idea.title}"`);
}
