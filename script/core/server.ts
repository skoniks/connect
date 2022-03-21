import { AddressInfo, createServer, Server } from 'net';
import { createLogger } from '../utils';

const logger = createLogger('Server', true);

export class CoreServer {
  public host?: string;
  public port?: number;
  private server: Server;

  constructor() {
    this.server = createServer();
    this.server.on('listening', () => {
      const address = <AddressInfo>this.server.address();
      this.host = address.address;
      this.port = address.port;
      logger('server listening on %s:%d', this.host, this.port);
    });
    this.server.on('connection', (socket) => {
      // this.handleConnection(socket);
      logger('connection %s:%d', socket.remoteAddress, socket.remotePort);
    });
    this.server.on('error', (err) => {
      logger('error | %o', err.message);
    });
    this.server.on('close', () => {
      logger('close');
    });
  }
  public listen(host: string) {
    return new Promise((resolve: (info: AddressInfo) => void, reject) => {
      this.server.once('listening', () => {
        resolve(<AddressInfo>this.server.address());
      });
      this.server.once('error', (err) => {
        reject(err.message);
      });
      this.server.listen(0, host);
    });
  }
}
