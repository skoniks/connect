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
  const upnp = await UPNP.create(true, 0);
  const { address } = upnp.gateway;
  const ip = await upnp.externalIp();
  logger('external ip %s', ip);
  const client = new Client(ip);
  const { port } = await client.listen(address);
  await upnp.portMapping(port, 'TCP');
  logger('port %d mapped', port);
  client.startInterface();
});

process.on('exit', (code) => {
  logger('app exit %d', code);
});
