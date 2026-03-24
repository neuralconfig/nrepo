import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

try {
  const claudeDir = join(homedir(), '.claude');
  if (existsSync(claudeDir)) {
    const skillDir = join(claudeDir, 'skills', 'neuralrepo');
    mkdirSync(skillDir, { recursive: true });

    const src = join(dirname(fileURLToPath(import.meta.url)), 'skill', 'SKILL.md');
    const dest = join(skillDir, 'SKILL.md');
    copyFileSync(src, dest);

    console.log('');
    console.log('  nrepo: Claude Code skill installed');
  }

  console.log('');
  console.log('  Get started:');
  console.log('    nrepo login       Authenticate with NeuralRepo');
  console.log('    nrepo --help      See all commands');
  console.log('');
} catch {
  // Silent failure — postinstall must not break npm install
}
