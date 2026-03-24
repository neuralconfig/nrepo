import ora from 'ora';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';
import { formatIdeaDetail } from '../format.js';

export async function showCommand(id: string, opts: { json?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const ideaId = parseInt(id, 10);
  if (isNaN(ideaId)) {
    console.error('Invalid idea ID');
    process.exit(1);
  }

  const spinner = opts.json ? null : ora('Loading idea...').start();
  const idea = await api.getIdea(config, ideaId);
  spinner?.stop();

  if (opts.json) {
    console.log(JSON.stringify(idea, null, 2));
    return;
  }

  console.log(formatIdeaDetail(idea));
}
