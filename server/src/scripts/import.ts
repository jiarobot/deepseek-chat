import { ensureOwnerUser } from '../db';
import { runImport } from '../importer';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  ensureOwnerUser();
  const state = await runImport(force);
  console.log(JSON.stringify(state, null, 2));
  process.exit(state.status === 'error' ? 1 : 0);
}

void main();
