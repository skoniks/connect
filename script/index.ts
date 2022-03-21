import debug from 'debug';
import { config } from 'dotenv';
import { CoreServer } from './core/server';
import { UPNP } from './core/upnp';
import { createLogger, readline } from './utils';

config() && debug.enable('*');
readline.prompt(true);

const logger = createLogger('Main', true);
logger('client starting');
setImmediate(async () => {
  const upnp = await UPNP.create();
  const { address } = upnp.gateway;
  const external = await upnp.externalIp();
  logger('external ip %s', external);

  const server = new CoreServer();
  const { port } = await server.listen(address);
  await upnp.portMapping(port, 'TCP');
  logger('port %d mapped', port);
});

process.on('exit', (code) => {
  logger('client exit %d', code);
});
