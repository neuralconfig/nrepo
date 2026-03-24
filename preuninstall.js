import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

try {
  const skillDir = join(homedir(), '.claude', 'skills', 'neuralrepo');
  rmSync(skillDir, { recursive: true });
  console.log('nrepo: Claude Code skill removed');
} catch {
  // Silent failure — skill dir may not exist
}
