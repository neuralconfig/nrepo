import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, DEFAULT_API_URL } from '../config.js';
import * as api from '../api.js';

/** Sign-in methods `/auth/cli` accepts; `choose` shows a picker. */
export const LOGIN_PROVIDERS = ['choose', 'github', 'google', 'apple', 'magic'] as const;
export type LoginProvider = (typeof LOGIN_PROVIDERS)[number];

export function parseLoginProvider(value: string | undefined): LoginProvider {
  const provider = (value ?? 'choose').toLowerCase();
  if (!(LOGIN_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`Unknown provider "${value}". Use one of: ${LOGIN_PROVIDERS.join(', ')}`);
  }
  return provider as LoginProvider;
}

export function cliAuthUrl(apiUrl: string, callbackUrl: string, provider: LoginProvider): string {
  return `${apiUrl.replace('/api/v1', '')}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&provider=${provider}`;
}

export async function loginCommand(opts: { apiKey?: boolean; provider?: string }): Promise<void> {
  if (opts.apiKey) {
    await loginWithApiKey();
    return;
  }
  let provider: LoginProvider;
  try {
    provider = parseLoginProvider(opts.provider);
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
  await loginWithBrowser(provider);
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

async function loginWithBrowser(provider: LoginProvider): Promise<void> {
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
          res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NeuralRepo — Authenticated</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#19191A;--card:#1E1E1F;--border:#2C2C2E;--text:#EEEEED;--soft:#B8B9BA;--mute:#949496;--repo:#EC7C46;--ok:#5BD39A}
@media (prefers-color-scheme:light){:root{--bg:#FAFAF8;--card:#FFFFFF;--border:#E5E3DC;--text:#1A1D21;--soft:#454A52;--mute:#62666E;--repo:#A84A1C;--ok:#17704A}}
html,body{height:100%}
body{font-family:'IBM Plex Sans',-apple-system,sans-serif;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{width:360px;max-width:100%;padding:40px 32px 36px;background:var(--card);border:1px solid var(--border);border-radius:14px;text-align:center;animation:fadein .3s ease both}
.mark{width:56px;height:56px;margin:0 auto 14px;display:block}
.wm{font-size:22px;font-weight:600;letter-spacing:-.035em;line-height:1;margin-bottom:28px}
.wm span{color:var(--repo)}
.label{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin-bottom:14px}
.check{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:1px solid var(--border);margin-bottom:16px;color:var(--ok)}
.check svg{width:20px;height:20px}
h1{font-size:18px;font-weight:600;margin:0 0 6px}
p{font-size:14px;color:var(--soft)}
@keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.card{animation:none}}
</style></head>
<body>
<div class="card">
  <picture>
    <source srcset="https://neuralrepo.com/mark-light.svg" media="(prefers-color-scheme: light)">
    <img class="mark" src="https://neuralrepo.com/mark.svg" alt="">
  </picture>
  <div class="wm">neural<span>repo</span></div>
  <div class="label">Authenticated</div>
  <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
  <h1>You're in</h1>
  <p>Close this window and return to the terminal.</p>
</div>
</body></html>`);
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
      const authUrl = cliAuthUrl(DEFAULT_API_URL, callbackUrl, provider);
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
