import { ec } from 'elliptic';
import {
  AddressInfo,
  createConnection,
  createServer,
  Server,
  Socket,
} from 'net';
import { clearScreen, createLogger, EC, readline } from '../utils';
import { UPNP } from './upnp';

const logger = createLogger('Client', true);

interface Commands {
  [key: string]: {
    args?: string[];
    desc: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: (...args: any) => void;
  };
}

export class Client {
  private upnp: UPNP;
  private ip?: string;
  private host?: string;
  private port?: number;
  private server: Server;
  private peers: Socket[];
  private keys: ec.KeyPair;

  private commands: Commands = {
    '/help': {
      desc: 'print this command list',
      action: () => this.printHelp(),
    },
    '/connect': {
      args: ['ip:port'],
      desc: 'connect to peer',
      action: (address: string) => {
        this.createConnection(address);
      },
    },
    '/invite': {
      args: ['key'],
      desc: 'invite user by his key',
      action: () => this.printHelp(),
    },
    '/exit': {
      desc: 'close an application',
      action: async () => {
        await this.upnp.destroy();
        setTimeout(() => process.exit(1), 3000);
      },
    },
  };

  constructor(upnp: UPNP) {
    this.upnp = upnp;
    this.peers = [];
    this.server = createServer();
    this.keys = EC.genKeyPair();
    this.server.on('listening', () => {
      logger('listening on %s:%d', this.host, this.port);
    });
    this.server.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    this.server.on('error', (err) => {
      logger('error - %o', err.message);
    });
    this.server.on('close', () => {
      logger('close');
    });
  }

  // * Networking
  public async listen() {
    this.ip = await this.upnp.externalIp();
    const { address: host } = this.upnp.gateway;
    const address = await new Promise(
      (resolve: (info: AddressInfo) => void, reject) => {
        this.server.once('listening', () => {
          resolve(<AddressInfo>this.server.address());
        });
        this.server.once('error', (err) => {
          reject(err.message);
        });
        this.server.listen(0, host);
      },
    );
    this.host = address.address;
    this.port = address.port;
    await this.upnp.portMapping(this.port, 'TCP');
    logger('port %d mapped', this.port);
  }

  private handleConnection(socket: Socket) {
    const { remoteAddress, remotePort } = socket;
    const address = `${remoteAddress}:${remotePort}`;
    logger('connection %s', address);
    this.peers.push(socket);
    socket.on('data', (data) => {
      logger('data %s (%d bytes)', address, data.length);
      // this.handleData(data, id);
    });
    socket.on('error', (err) => {
      logger('error %s - %o', address, err.message);
    });
    socket.on('close', () => {
      logger('close %s', address);
      const index = this.peers.indexOf(socket);
      if (index !== -1) this.peers.splice(index, 1);
    });
  }

  private async createConnection(address: string) {
    const [host, port] = address.trim().split(':');
    try {
      const socket = await new Promise(
        (resolve: (info: Socket) => void, reject) => {
          const socket = createConnection({
            host,
            port: Number(port),
          });
          socket.once('connect', () => {
            resolve(socket);
          });
          socket.once('error', (err) => {
            reject(err.message);
          });
        },
      );
      this.handleConnection(socket);
    } catch (error) {
      logger('connection faild - %s', error);
    }
  }

  private broadcastData(data: Buffer) {
    this.peers.forEach((socket) => {
      socket.write(data);
    });
  }

  // * Interface
  public startInterface() {
    clearScreen(true);
    logger('remote address - %s:%d', this.ip, this.port);
    logger('public key - %s', this.getPublic());
    this.printHelp();
    logger('peers: %d', this.peers.length);
    readline.on('line', (line) => {
      // logger('new line %s', line);
      // TODO: if !connected ...
      const [key, ...args] = line.trim().split(' ');
      type CMD = keyof typeof this.commands;
      const command = this.commands[<CMD>key];
      if (command !== undefined) {
        command.action(...args);
      } else {
        logger('invalid command');
      }
    });
  }

  private printHelp() {
    logger('command list:');
    Object.entries(this.commands)
      .map(([key, { args, desc }]) => {
        return ['-', key, ...(args || []), '-', desc].join(' ');
      })
      .forEach((line) => logger(line));
  }

  // * Security
  private getPublic() {
    return this.keys.getPublic(true, 'hex');
  }

  private getPrivate() {
    return this.keys.getPrivate('hex');
  }
}
