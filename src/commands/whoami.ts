import chalk from 'chalk';
import { getAuthenticatedConfig } from '../config.js';
import * as api from '../api.js';

export async function whoamiCommand(opts: { json?: boolean }): Promise<void> {
  const config = await getAuthenticatedConfig();
  const user = await api.getMe(config);

  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }

  console.log(`${chalk.bold(user.display_name ?? user.email)}`);
  console.log(`  Email:  ${user.email}`);
  console.log(`  Plan:   ${user.plan}`);
  console.log(`  ID:     ${chalk.dim(user.id)}`);
}
