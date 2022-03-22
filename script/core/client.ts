import {
  decrypt,
  encrypt,
  generatePrivate,
  getPublicCompressed,
} from 'eccrypto';
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
  fromBuffer,
  promptLog,
  readline,
  sha256,
  toBuffer,
  toEcies,
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

type Cache = { [key: string]: number };

enum Opcode {
  INVITE,
  ACCEPT,
  MESSAGE,
}

const REQ_TTL = 30000;
const MAX_TTL = 60000;

export class Client {
  private upnp?: UPNP;
  private peers: Socket[] = [];
  private server: Server;
  private privateKey: Buffer;
  private publicKey: Buffer;

  private ip?: string;
  private host?: string;
  private port?: number;

  private cache: Cache = {};
  private chat?: number;
  private chatKey?: string;

  private commands: Commands = {
    '/help': {
      desc: 'print this command list',
      action: () => this.printHelp(),
    },
    '/peers': {
      desc: 'print peers list',
      action: () => this.printPeers(),
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
      desc: 'invite user to chat by his key',
      action: (key: string) => {
        this.broadcastInvite(key);
      },
    },
    '/close': {
      desc: 'close current chat',
      action: () => {
        this.chat = undefined;
        logger('chat closed');
      },
    },
    '/exit': {
      desc: 'close an application',
      action: async () => {
        if (this.upnp) await this.upnp.destroy();
        setTimeout(() => process.exit(0), 3000);
      },
    },
  };

  constructor(upnp?: UPNP) {
    if (upnp) this.upnp = upnp;
    this.server = createServer();
    this.privateKey = generatePrivate();
    this.publicKey = getPublicCompressed(this.privateKey);
    this.server.on('listening', () => {
      const address = <AddressInfo>this.server.address();
      this.host = address.address;
      this.port = address.port;
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
    setInterval(() => {
      Object.entries(this.cache).forEach(([key, value]) => {
        if (value < Date.now()) delete this.cache[key];
      });
    }, 10000);
  }

  // * Networking
  public async listen() {
    if (this.upnp) {
      this.ip = await this.upnp.externalIp();
      const { address: host } = this.upnp.gateway;
      const { port } = await new Promise(
        (resolve: (info: AddressInfo) => void, reject) => {
          this.server.once('listening', () => {
            resolve(<AddressInfo>this.server.address());
          });
          this.server.once('error', (err) => {
            reject(err.message);
          });
          this.server.listen(Number(process.env.PORT) || 0, host);
        },
      );
      await this.upnp.portMapping(port, 'TCP');
      logger('port %d mapped', port);
    } else {
      await new Promise((resolve: (info: AddressInfo) => void, reject) => {
        this.server.once('listening', () => {
          resolve(<AddressInfo>this.server.address());
        });
        this.server.once('error', (err) => {
          reject(err.message);
        });
        this.server.listen(Number(process.env.PORT) || 0, '0.0.0.0');
      });
    }
  }

  private handleConnection(socket: Socket) {
    const { remoteAddress, remotePort } = socket;
    const address = `${remoteAddress}:${remotePort}`;
    logger('new connection %s', address);
    this.peers.push(socket);
    socket.on('data', (buffer) => {
      if (!this.chat) logger('data %s (%d bytes)', address, buffer.length);
      this.handleData(socket, buffer);
    });
    socket.on('error', (err) => {
      logger('error %s - %o', address, err.message);
    });
    socket.on('close', () => {
      logger('close %s', address);
      const index = this.peers.indexOf(socket);
      if (index !== -1) this.peers.splice(index, 1);
      if (this.chat === index) this.chat = undefined;
    });
  }

  public async createConnection(address: string) {
    logger('connecting to %s', address);
    const [host, port] = address.split(':');
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
      return undefined;
    }
  }

  private async handleData(socket: Socket, buffer: Buffer) {
    try {
      const hash = sha256(buffer);
      if (this.cache[hash]) throw new Error('already cached');
      const opcode = buffer.readUint8(0);
      const expire = Number(buffer.readBigUInt64BE(1));
      const ttl = expire - Date.now();
      if (ttl > MAX_TTL || ttl < 0) throw new Error('invalid ttl');
      const data = fromBuffer(buffer, 9);
      if (!data) throw new Error('invalid data');
      if (!this.chat) logger('verify - opcode: %s', Opcode[opcode]);
      switch (opcode) {
        case Opcode.INVITE: {
          if (this.chat) throw new Error('already chatting');
          if (!data.hash || !data.payload) throw new Error('invalid params');
          if (data.hash === sha256(this.publicKey.toString('hex'))) {
            const payload = await decrypt(
              this.privateKey,
              toEcies(data.payload),
            );
            const { address, publicKey } = fromBuffer(payload);
            if (!address || !publicKey) throw new Error('invalid payload');
            let socket = this.peers.find((socket) => {
              const { address: host, port } = <AddressInfo>socket.address();
              return address == `${host}:${port}`;
            });
            if (!socket) socket = await this.createConnection(address);
            if (!socket) throw new Error('connection faild');
            const response = await encrypt(
              Buffer.from(publicKey, 'hex'),
              toBuffer({
                address: `${this.ip}:${this.port}`,
                publicKey: this.publicKey.toString('hex'),
              }),
            );
            const buffer = this.buildData(Opcode.ACCEPT, {
              hash: sha256(publicKey),
              payload: response,
            });
            this.writeData(socket, buffer);
            const index = this.peers.indexOf(socket);
            if (index !== -1) {
              this.chat = index;
              this.chatKey = publicKey;
              const { remoteAddress, remotePort } = socket;
              const address = `${remoteAddress}:${remotePort}`;
              logger('chat with %s', address);
            }
          } else {
            this.broadcastData(buffer);
          }
          break;
        }
        case Opcode.ACCEPT: {
          if (this.chat) throw new Error('already chatting');
          if (!data.hash || !data.payload) throw new Error('invalid params');
          if (data.hash === sha256(this.publicKey.toString('hex'))) {
            const payload = await decrypt(
              this.privateKey,
              toEcies(data.payload),
            );
            const { address, publicKey } = fromBuffer(payload);
            if (!address || !publicKey) throw new Error('invalid payload');
            const index = this.peers.indexOf(socket);
            if (index !== -1) {
              this.chat = index;
              this.chatKey = publicKey;
              const { remoteAddress, remotePort } = socket;
              const address = `${remoteAddress}:${remotePort}`;
              logger('chat with %s', address);
            }
          }
          break;
        }
        case Opcode.MESSAGE: {
          if (!this.chat) throw new Error('no chatting');
          if (!data.hash || !data.payload) throw new Error('invalid params');
          if (data.hash === sha256(this.publicKey.toString('hex'))) {
            const payload = await decrypt(
              this.privateKey,
              toEcies(data.payload),
            );
            const { remoteAddress, remotePort } = socket;
            const address = `${remoteAddress}:${remotePort}`;
            promptLog('< %s > %s', address, payload.toString());
          }
          break;
        }
        default:
          throw new Error('invalid opcode');
      }
    } catch (error) {
      const { message } = <Error>error;
      if (!this.chat) logger('data handle - %s', message);
    }
  }

  private async broadcastInvite(key: string) {
    logger('invite %s', key);
    const payload = await encrypt(
      Buffer.from(key, 'hex'),
      toBuffer({
        address: `${this.ip}:${this.port}`,
        publicKey: this.publicKey.toString('hex'),
      }),
    );
    const buffer = this.buildData(Opcode.INVITE, {
      hash: sha256(key),
      payload,
    });
    this.broadcastData(buffer);
  }

  private buildData(opcode: Opcode, data: unknown, ttl = REQ_TTL) {
    const opcodeBuffer = Buffer.alloc(1);
    opcodeBuffer.writeUint8(opcode);
    const expire = BigInt(Date.now() + ttl);
    const expireBuffer = Buffer.alloc(8);
    expireBuffer.writeBigUInt64BE(expire);
    const dataBuffer = toBuffer(data);
    return Buffer.concat([opcodeBuffer, expireBuffer, dataBuffer]);
  }

  private writeData(socket: Socket, buffer: Buffer) {
    const hash = sha256(buffer);
    const expire = Number(buffer.readBigUInt64BE(1));
    this.cache[hash] = expire;
    socket.write(buffer);
  }

  private broadcastData(buffer: Buffer) {
    const hash = sha256(buffer);
    const expire = Number(buffer.readBigUInt64BE(1));
    this.cache[hash] = expire;
    this.peers.forEach((socket) => {
      socket.write(buffer);
    });
  }

  // * Interface
  public startInterface() {
    clearScreen(true);
    logger('remote address - %s:%d', this.ip, this.port);
    logger('key - %s', this.publicKey.toString('hex'));
    this.printPeers();
    this.printHelp();
    readline.on('line', (line) => {
      const [key, ...args] = line.trim().split(' ');
      type CMD = keyof typeof this.commands;
      const command = this.commands[<CMD>key];
      if (command !== undefined) {
        command.action(...args);
      } else if (this.chat && this.chatKey) {
        readline.prompt(true);
        const key = this.chatKey;
        const socket = this.peers[this.chat];
        encrypt(Buffer.from(key, 'hex'), Buffer.from(line)).then((payload) => {
          const buffer = this.buildData(Opcode.MESSAGE, {
            hash: sha256(key),
            payload,
          });
          this.writeData(socket, buffer);
        });
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

  private printPeers() {
    logger('peers: %d', this.peers.length);
    this.peers.forEach((socket, index) => {
      const { remoteAddress, remotePort } = socket;
      logger('- %d. %s:%d', index + 1, remoteAddress, remotePort);
    });
  }
}
