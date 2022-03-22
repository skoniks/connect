import debug from 'debug';
import { config } from 'dotenv';
import { Client } from './core/client';
import { UPNP } from './core/upnp';
import { createLogger, readline } from './utils';

config() && debug.enable('*');
readline.prompt(true);

const logger = createLogger('Main', true);
logger('app starting');
setImmediate(async () => {
  const upnp = await UPNP.create(true);
  const client = new Client(upnp);
  await client.listen();
  client.startInterface();
});
process.on('exit', (code) => {
  logger('exit %d', code);
});
