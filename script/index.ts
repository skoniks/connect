import debug from 'debug';
import { config } from 'dotenv';
import { createServer } from 'net';
import { UPNP } from './core/upnp';
import { createLogger, readline } from './utils';

config() && debug.enable('*');
readline.prompt(true);

const logger = createLogger('Main', true);
logger('client starting');
setImmediate(async () => {
  const upnp = new UPNP();
  const ip = await upnp.externalIp();
  logger('external ip %s', ip);

  const port = 8833;

  await upnp.portMapping(port);
  logger('port %d mapped', port);

  logger('server starting on %d', port);
  const server = createServer();
  server.on('listening', () => {
    logger('server listening on :%d', port);
  });
  server.on('connection', (socket) => {
    // this.handleConnection(socket);
    logger('connection %s:%d', socket.remoteAddress, socket.remotePort);
  });
  server.on('error', (err) => {
    logger('error | %o', err.message);
  });
  server.on('close', () => {
    logger('close');
  });
  server.listen(port);

  // upnp.portUnmapping(port).then(() => {
  //   logger('port %d unmapped', port);
  // });
});
