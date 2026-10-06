import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// package.json sits one level above both src/ and the bundled dist/.
const __dirname = dirname(fileURLToPath(import.meta.url));

export const VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version as string;
