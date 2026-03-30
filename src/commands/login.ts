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
          res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NeuralRepo — Authenticated</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#39ff14;--bg:#080808;--card:#0e0e0e;--border:#1a1a1a;--fg:#e2e0d8;--fg-mid:#666;--fg-dim:#3a3a3a}
html,body{height:100%}
body{font-family:'IBM Plex Mono',monospace;background:var(--bg);color:var(--fg);display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 50%,rgba(57,255,20,.028) 0%,transparent 70%),repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(57,255,20,.018) 39px,rgba(57,255,20,.018) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(57,255,20,.018) 39px,rgba(57,255,20,.018) 40px);pointer-events:none;z-index:0}
body::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 120% 120% at 50% 50%,transparent 40%,rgba(0,0,0,.82) 100%);pointer-events:none;z-index:0}
.card{position:relative;z-index:1;width:360px;padding:48px 40px 40px;background:var(--card);border:1px solid var(--border);border-radius:12px;text-align:center;overflow:hidden;animation:fadein .4s ease both}
.card::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.055),rgba(0,0,0,.055) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:20;border-radius:inherit}
.card::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 40px rgba(57,255,20,.03);pointer-events:none;z-index:0}
.wm{display:inline-flex;flex-direction:column;align-items:center;position:relative;margin-bottom:8px}
.wm .wi{filter:drop-shadow(0 0 6px rgba(57,255,20,.75)) drop-shadow(0 0 16px rgba(57,255,20,.28)) drop-shadow(0 0 32px rgba(57,255,20,.10))}
.wm .wt{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:500;color:var(--green);letter-spacing:-.4px;line-height:1;text-shadow:0 0 3px rgba(57,255,20,.9),0 0 12px rgba(57,255,20,.28),0 0 28px rgba(57,255,20,.10);margin-top:14px}
.wm::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.04),rgba(0,0,0,.04) 1px,transparent 1px,transparent 4px);pointer-events:none;z-index:2;border-radius:2px}
.status{font-size:11px;color:var(--fg-mid);letter-spacing:.5px;margin-bottom:28px;font-family:'IBM Plex Mono',monospace}
.divider{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border)}
.divider span{font-size:9px;color:var(--fg-dim);letter-spacing:2px;text-transform:uppercase}
.check{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:rgba(57,255,20,.06);border:1px solid rgba(57,255,20,.15);margin-bottom:16px}
.check svg{width:20px;height:20px;color:var(--green);filter:drop-shadow(0 0 4px rgba(57,255,20,.5))}
h1{font-family:'IBM Plex Sans',sans-serif;font-size:18px;font-weight:600;margin:0 0 8px;color:#fff}
p{font-size:12px;color:var(--fg-dim);margin:0;font-family:'IBM Plex Mono',monospace;letter-spacing:.2px}
@keyframes fadein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
</style></head>
<body>
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <symbol id="nn" viewBox="0 0 64 64" fill="none">
    <line x1="14" y1="18" x2="32" y2="52" stroke="rgba(57,255,20,0.16)" stroke-width="1"/>
    <line x1="14" y1="46" x2="32" y2="12" stroke="rgba(57,255,20,0.16)" stroke-width="1"/>
    <line x1="32" y1="12" x2="50" y2="42" stroke="rgba(57,255,20,0.16)" stroke-width="1"/>
    <line x1="32" y1="52" x2="50" y2="24" stroke="rgba(57,255,20,0.16)" stroke-width="1"/>
    <line x1="14" y1="18" x2="32" y2="12" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="14" y1="18" x2="32" y2="32" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="14" y1="46" x2="32" y2="32" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="14" y1="46" x2="32" y2="52" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="32" y1="12" x2="50" y2="24" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="32" y1="32" x2="50" y2="24" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="32" y1="32" x2="50" y2="42" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <line x1="32" y1="52" x2="50" y2="42" stroke="rgba(57,255,20,0.28)" stroke-width="1.5"/>
    <circle cx="14" cy="18" r="5" fill="#39ff14"/>
    <circle cx="14" cy="46" r="5" fill="#39ff14"/>
    <circle cx="32" cy="12" r="3.5" fill="#39ff14" opacity=".72"/>
    <circle cx="32" cy="32" r="5" fill="#39ff14"/>
    <circle cx="32" cy="52" r="3.5" fill="#39ff14" opacity=".72"/>
    <circle cx="50" cy="24" r="4.5" fill="#39ff14"/>
    <circle cx="50" cy="42" r="4.5" fill="#39ff14"/>
  </symbol>
</svg>
<div class="card">
  <span class="wm">
    <svg class="wi" width="72" height="72"><use href="#nn"/></svg>
    <span class="wt">neuralrepo</span>
  </span>
  <div class="status">where ideas become code</div>
  <div class="divider"><span>authenticated</span></div>
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
