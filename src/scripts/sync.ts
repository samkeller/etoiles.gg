import 'dotenv/config';
import { parseSyncArgs } from './syncBackend';
import { executeSyncCommand } from './syncCli';
import { log } from './log';

try {
	await executeSyncCommand(parseSyncArgs(process.argv.slice(2), process.env.PLAYERS));
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
