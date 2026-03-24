import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, DEFAULT_API_URL } from '../config.js';
import * as api from '../api.js';

export async function loginCommand(opts: { apiKey?: boolean }): Promise<void> {
  if (opts.apiKey) {
    await loginWithApiKey();
  } else {
    await loginWithBrowser();
  }
}

async function loginWithApiKey(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = await rl.question(chalk.bold('Enter your API key: '));
  rl.close();

  if (!key.trim()) {
    console.error(chalk.red('No API key provided.'));
    process.exit(1);
  }

  const spinner = ora('Verifying API key...').start();
  const config = { api_url: DEFAULT_API_URL, api_key: key.trim() };

  try {
    const user = await api.getMe(config);
    await saveConfig({ ...config, user_id: user.id, auth_method: 'api-key' });
    spinner.succeed(`Logged in as ${chalk.bold(user.display_name ?? user.email)} (${user.plan})`);
    console.log(chalk.dim('Output defaults to JSON. Use --human for human-readable output.'));
  } catch {
    spinner.fail('Invalid API key. Generate one at https://neuralrepo.com/settings');
    process.exit(1);
  }
}

async function loginWithBrowser(): Promise<void> {
  const port = randomInt(49152, 65535);
  const callbackUrl = `http://localhost:${port}/callback`;

  console.log(chalk.dim('Starting local auth server...'));

  const keyPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 120 seconds'));
    }, 120_000);

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const apiKey = url.searchParams.get('api_key');

        if (apiKey) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; text-align: center; padding: 60px; background: #0b0b0f; color: #fff;">
              <h1>✓ Authenticated</h1>
              <p>You can close this window and return to the terminal.</p>
            </body></html>
          `);
          clearTimeout(timeout);
          server.close();
          resolve(apiKey);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Error: No API key received</h1></body></html>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('No API key received in callback'));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, () => {
      const authUrl = `${DEFAULT_API_URL.replace('/api/v1', '')}/auth/cli?callback=${encodeURIComponent(callbackUrl)}`;
      console.log(`\nOpen this URL to log in:\n\n  ${chalk.underline(authUrl)}\n`);
      console.log(chalk.dim('Waiting for authentication...'));

      // Try to open browser automatically
      const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      import('node:child_process').then(({ exec }) => {
        exec(`${open} "${authUrl}"`, () => {});
      });
    });
  });

  const spinner = ora('Waiting for browser login...').start();
  try {
    const apiKey = await keyPromise;
    const config = { api_url: DEFAULT_API_URL, api_key: apiKey };
    const user = await api.getMe(config);
    await saveConfig({ ...config, user_id: user.id, auth_method: 'browser' });
    spinner.succeed(`Logged in as ${chalk.bold(user.display_name ?? user.email)} (${user.plan})`);
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }
}
