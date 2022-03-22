import debug from 'debug';
import { config } from 'dotenv';
import { Client } from './core/client';
import { UPNP } from './core/upnp';
import { createLogger, readline } from './utils';

config() && debug.enable('*');
readline.prompt(true);

const DEFAULT = 'a.sknx.ru:8888';

const logger = createLogger('Main', true);
logger('app starting');
setImmediate(async () => {
  let upnp: UPNP | undefined;
  try {
    upnp = await UPNP.create(true);
  } catch (error) {
    const { message } = <Error>error;
    logger('error - %s', message);
  }
  const client = new Client(upnp);
  await client.listen();
  client.createConnection(DEFAULT);
  client.startInterface();
});
process.on('exit', (code) => {
  logger('exit %d', code);
});
process.on('uncaughtException', (err) => {
  logger('uncaughtException - %O', err);
  setTimeout(() => process.exit(1), 3000);
});
process.on('uncaughtExceptionMonitor', (err) => {
  logger('uncaughtExceptionMonitor - %O', err);
  setTimeout(() => process.exit(1), 3000);
});
process.on('unhandledRejection', (err) => {
  logger('unhandledRejection - %O', err);
  setTimeout(() => process.exit(1), 3000);
});
