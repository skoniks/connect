import { ec } from 'elliptic';
import {
  AddressInfo,
  createConnection,
  createServer,
  Server,
  Socket,
} from 'net';
import {
  clearScreen,
  createLogger,
  EC,
  parse,
  readline,
  sha256,
} from '../utils';
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

type Cache = { [key: string]: BigInt };

enum Opcode {
  INVITE,
  ACCEPT,
}

const MAXTTL = 60000;

export class Client {
  private upnp: UPNP;
  private ip?: string;
  private host?: string;
  private port?: number;
  private server: Server;
  private peers: Socket[];
  private keys: ec.KeyPair;
  private cache: Cache = {};

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
      action: (key: string) => {
        const buffer = this.buildData(Opcode.INVITE, {
          hash: sha256(key.trim()),
          address: `${this.ip}:${this.port}`,
          key: this.getPublic(),
        });
        this.broadcastData(buffer);
      },
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
    socket.on('data', (buffer) => {
      logger('data %s (%d bytes)', address, buffer.length);
      this.handleData(socket, buffer);
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
      return socket;
    } catch (error) {
      logger('connection faild - %s', error);
      return null;
    }
  }

  private handleData(socket: Socket, buffer: Buffer) {
    // TODO: Cache clean
    const hash = sha256(buffer);
    if (this.cache[hash]) {
      logger('cached');
      return;
    }
    const opcode = buffer.readUint8(0);
    const expire = buffer.readBigUInt64BE(1);
    this.cache[hash] = expire;
    const ttl = expire - BigInt(Date.now());
    if (ttl > BigInt(MAXTTL) || ttl < 0) {
      logger('expire %d', expire);
      logger('ttl %d', ttl);
      return;
    }
    const data = parse(buffer.toString('utf8', 9));
    if (!data) {
      logger('!data %O', data);
      return;
    }
    switch (opcode) {
      case Opcode.INVITE: {
        const { hash, address, key } = data;
        if (!hash || !address || !key) {
          logger('data %O', data);
          return;
        }
        // key
        if (hash === sha256(this.getPublic())) {
          this.createConnection(address).then((socket) => {
            if (!socket) {
              logger('!socket %s', address);
              return;
            }
            const buffer = this.buildData(Opcode.ACCEPT, {
              key: this.getPublic(),
              address: `${this.ip}:${this.port}`,
            });
            this.writeData(socket, buffer);
          });
        } else {
          this.broadcastData(data);
        }
        return;
      }
      case Opcode.ACCEPT: {
        logger('ACCEPT', data);
        return;
      }
    }
  }

  private buildData(opcode: Opcode, data: unknown, ttl = MAXTTL / 2) {
    const opcodeBuffer = Buffer.alloc(1);
    opcodeBuffer.writeUint8(opcode);
    const expire = BigInt(Date.now() + ttl);
    const expireBuffer = Buffer.alloc(8);
    expireBuffer.writeBigUInt64BE(expire);
    const dataBuffer = Buffer.from(JSON.stringify(data));
    return Buffer.concat([opcodeBuffer, expireBuffer, dataBuffer]);
  }

  private writeData(socket: Socket, data: Buffer) {
    socket.write(data);
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
    logger('key - %s', this.getPublic());
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
