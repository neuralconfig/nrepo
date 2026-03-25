import { Command } from 'commander';
import chalk from 'chalk';
import { AuthError, loadConfig } from './config.js';
import { ApiError } from './api.js';
import { loginCommand } from './commands/login.js';
import { whoamiCommand } from './commands/whoami.js';
import { pushCommand } from './commands/push.js';
import { searchCommand } from './commands/search.js';
import { logCommand } from './commands/log.js';
import { statusCommand } from './commands/status.js';
import { showCommand } from './commands/show.js';
import { moveCommand, moveBulkCommand } from './commands/move.js';
import { tagCommand, tagAddCommand, tagRemoveCommand } from './commands/tag.js';
import { pullCommand } from './commands/pull.js';
import { diffCommand } from './commands/diff.js';
import { branchCommand } from './commands/branch.js';
import { editCommand } from './commands/edit.js';
import { keysListCommand, keysCreateCommand, keysRevokeCommand } from './commands/key.js';
import { rmCommand } from './commands/rm.js';
import { duplicateListCommand, duplicateDismissCommand, duplicateMergeCommand } from './commands/duplicate.js';
import { linkCommand, unlinkCommand, linksCommand } from './commands/link.js';
import { mergeCommand } from './commands/merge.js';
import { graphCommand } from './commands/graph.js';
import { clearConfig } from './config.js';
import { checkForUpdates } from './update-check.js';

const VERSION = '0.0.4';

const program = new Command();

program
  .name('nrepo')
  .description('NeuralRepo — capture and manage ideas from the terminal')
  .version(VERSION);

// login
program
  .command('login')
  .description('Authenticate with NeuralRepo')
  .option('--api-key', 'Login with an API key instead of browser OAuth')
  .action(wrap(loginCommand));

// logout
program
  .command('logout')
  .description('Clear stored credentials')
  .action(wrap(async () => {
    await clearConfig();
    console.log('Logged out.');
  }));

// whoami
program
  .command('whoami')
  .description('Show current user info')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(whoamiCommand));

// push
program
  .command('push <title>')
  .description('Create a new idea')
  .option('--body <text>', 'Idea body/description')
  .option('--tag <tag>', 'Add tag (repeatable)', collect, [])
  .option('--status <status>', 'Initial status (captured|exploring|building|shipped|shelved)')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(pushCommand));

// search
program
  .command('search <query>')
  .description('Search ideas (semantic + full-text)')
  .option('--limit <n>', 'Max results')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(searchCommand));

// log
program
  .command('log')
  .description('List recent ideas')
  .option('--limit <n>', 'Max results (default: 20)')
  .option('--status <status>', 'Filter by status')
  .option('--tag <tag>', 'Filter by tag')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(logCommand));

// status
program
  .command('status')
  .description('Overview dashboard')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(statusCommand));

// show
program
  .command('show <id>')
  .description('Show full idea detail')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(showCommand));

// edit
program
  .command('edit <id>')
  .description('Update an idea\'s title or body')
  .option('--title <title>', 'New title')
  .option('--body <body>', 'New body')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(editCommand));

// move (single + bulk)
program
  .command('move <id-or-status> [status]')
  .description('Change idea status (single: move <id> <status>, bulk: move <status> --ids 1,2,3)')
  .option('--ids <ids>', 'Comma-separated idea IDs for bulk move')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(async (idOrStatus: string, status: string | undefined, opts: { ids?: string; json?: boolean }) => {
    if (opts.ids) {
      // Bulk mode: first arg is status
      await moveBulkCommand(idOrStatus, { ids: opts.ids, json: opts.json });
    } else if (status) {
      // Single mode: first arg is id, second is status
      await moveCommand(idOrStatus, status, { json: opts.json });
    } else {
      console.error('Usage: nrepo move <id> <status> or nrepo move <status> --ids 1,2,3');
      process.exit(1);
    }
  }));

// tag (single: tag <id> <tags...>, bulk: tag add/remove <tag> --ids)
const tagCmd = program
  .command('tag')
  .description('Manage tags (tag <id> <tags...> or tag add/remove <tag> --ids 1,2,3)');

tagCmd
  .command('add <tag>')
  .description('Add tag to multiple ideas')
  .requiredOption('--ids <ids>', 'Comma-separated idea IDs')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(tagAddCommand));

tagCmd
  .command('remove <tag>')
  .description('Remove tag from multiple ideas')
  .requiredOption('--ids <ids>', 'Comma-separated idea IDs')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(tagRemoveCommand));

// Fallback: tag <id> <tags...> (original single-idea syntax)
tagCmd
  .argument('[id]')
  .argument('[tags...]')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(async (id?: string, tags?: string[], opts?: { json?: boolean }) => {
    if (id && tags && tags.length > 0) {
      await tagCommand(id, tags, { json: opts?.json });
    }
  }));

// pull
program
  .command('pull <id>')
  .description('Export idea + context as local files')
  .option('--to <dir>', 'Output directory (default: current)')
  .option('--json', 'Output as JSON (prints idea data instead of writing files)')
  .option('--human', 'Force human-readable output')
  .action(wrap(pullCommand));

// diff
program
  .command('diff <id> [id2]')
  .description('Compare two ideas side-by-side (or diff against parent/related)')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(diffCommand));

// branch
program
  .command('branch <id>')
  .description('Fork an idea into a new variant')
  .option('--title <title>', 'Override title for the branch')
  .option('--body <body>', 'Override body for the branch')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(branchCommand));

// link
program
  .command('link <source-id> <target-id>')
  .description('Create a link between two ideas')
  .option('--type <type>', 'Link type (related|blocks|inspires|supersedes|parent)', 'related')
  .option('--note <note>', 'Add a note to the link')
  .option('--force', 'Bypass cycle detection for soft-block types')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(linkCommand));

// unlink
program
  .command('unlink <source-id> <target-id>')
  .description('Remove a link between two ideas')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(unlinkCommand));

// links
program
  .command('links <id>')
  .description('Show all links for an idea')
  .option('--type <type>', 'Filter by link type')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(linksCommand));

// merge
program
  .command('merge <keep-id> <absorb-id>')
  .description('Merge two ideas (absorb the second into the first)')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(mergeCommand));

// graph
program
  .command('graph <id>')
  .description('Explore the connection graph from an idea')
  .option('--depth <n>', 'Max hops (default: 1, max: 5)')
  .option('--type <types>', 'Comma-separated edge types to follow')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(graphCommand));

// rm
program
  .command('rm <id>')
  .description('Archive (soft-delete) an idea')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(rmCommand));

// duplicate (subcommands: list, dismiss, merge)
const dup = program
  .command('duplicate')
  .description('Manage duplicate detections');

dup
  .command('list')
  .description('List pending duplicate detections')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(duplicateListCommand));

dup
  .command('dismiss <id>')
  .description('Dismiss a duplicate detection')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(duplicateDismissCommand));

dup
  .command('merge <id>')
  .description('Merge duplicate into primary idea')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(duplicateMergeCommand));

// key (subcommands: list, create, revoke)
const keys = program
  .command('key')
  .description('Manage API keys');

keys
  .command('list')
  .description('List all API keys')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(keysListCommand));

keys
  .command('create <label>')
  .description('Create a new API key')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(keysCreateCommand));

keys
  .command('revoke <key-id>')
  .description('Revoke an API key')
  .option('--json', 'Output as JSON')
  .option('--human', 'Force human-readable output')
  .action(wrap(keysRevokeCommand));

// Non-blocking update check (reads cache, prints notice, fetches in background)
checkForUpdates(VERSION);

program.parse();

// ============================================================
// Helpers
// ============================================================

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function wrap<T extends (...args: never[]) => Promise<void>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    // Resolve output format: --human > --json > auth_method default.
    // Commander passes (positional..., opts, Command) — opts is second-to-last.
    let jsonMode = false;

    if (args.length >= 2) {
      const opts = args[args.length - 2];
      if (opts && typeof opts === 'object' && !((opts as object) instanceof Command)) {
        const o = opts as Record<string, unknown>;
        if (o.human) {
          // Explicit --human wins — force human-readable output.
          o.json = false;
        } else if (!o.json) {
          // Neither flag set — check auth method for the default.
          const config = await loadConfig();
          if (config?.auth_method === 'api-key') {
            o.json = true;
          }
        }
        jsonMode = !!o.json;
      }
    }

    try {
      await fn(...args);
    } catch (err) {
      if (jsonMode) {
        const error = errorToJson(err);
        console.error(JSON.stringify(error));
        process.exit(1);
      }
      if (err instanceof AuthError) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
      if (err instanceof ApiError) {
        if (err.status === 401) {
          console.error(chalk.red('Authentication expired. Run `nrepo login` to re-authenticate.'));
        } else if (err.status === 403) {
          console.error(chalk.yellow('This feature requires a Pro plan. Upgrade at https://neuralrepo.com/settings'));
        } else {
          console.error(chalk.red(`API error (${err.status}): ${err.message}`));
        }
        process.exit(1);
      }
      if (err instanceof Error && err.message.startsWith('Network error')) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
      throw err;
    }
  }) as T;
}

function errorToJson(err: unknown): { error: string; code: string; status?: number } {
  if (err instanceof AuthError) {
    return { error: err.message, code: 'auth_required' };
  }
  if (err instanceof ApiError) {
    return { error: err.message, code: `http_${err.status}`, status: err.status };
  }
  if (err instanceof Error && err.message.startsWith('Network error')) {
    return { error: err.message, code: 'network_error' };
  }
  return { error: String(err), code: 'unknown' };
}
