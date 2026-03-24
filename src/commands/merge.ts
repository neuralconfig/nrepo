import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaDetail } from '../format.js';

export async function mergeCommand(
  keepId: string,
  absorbId: string,
  opts: { json?: boolean; force?: boolean },
): Promise<void> {
  const config = await getAuthenticatedConfig();
  const keep = parseInt(keepId, 10);
  const absorb = parseInt(absorbId, 10);

  if (isNaN(keep) || isNaN(absorb)) {
    console.error('Invalid idea IDs');
    process.exit(1);
  }

  if (keep === absorb) {
    console.error('Cannot merge an idea with itself');
    process.exit(1);
  }

  // Fetch both ideas for confirmation display
  const spinner = opts.json ? null : ora('Loading ideas...').start();
  const [keepIdea, absorbIdea] = await Promise.all([
    api.getIdea(config, keep),
    api.getIdea(config, absorb),
  ]);
  spinner?.stop();

  if (!opts.json && !opts.force) {
    console.log(chalk.bold('Merge preview:'));
    console.log(`  Keep:    #${keep} "${keepIdea.title}" [${keepIdea.status}]`);
    console.log(`  Absorb:  #${absorb} "${absorbIdea.title}" [${absorbIdea.status}]`);
    console.log('');
    console.log(chalk.dim('  The absorbed idea will be shelved and archived.'));
    console.log(chalk.dim('  Bodies will be concatenated, tags merged.'));
    console.log('');
  }

  const mergeSpinner = opts.json ? null : ora('Merging ideas...').start();
  const result = await api.mergeIdeas(config, keep, absorb);
  mergeSpinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.green('✓') + ` Merged #${absorb} into #${keep}`);
  console.log(`  Title: "${result.title}"`);
  console.log(`  Tags: ${result.tags?.length ? result.tags.join(', ') : 'none'}`);
  console.log(`  #${absorb} "${absorbIdea.title}" → shelved (superseded by #${keep})`);
}
