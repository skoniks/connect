// import debug from 'debug';
// import { createServer, Server, Socket } from 'net';
// import { v4 } from 'uuid';
// import { ub8 } from './utils';

// const log = debug('server');

// export enum CODE {
//   AUTH,
//   MSG,
// }

// export class CoreServer {
//   server: Server;
//   sockets: { [id: string]: Socket } = {};

//   constructor(port: number) {
//     if (!port) throw Error('Invalid server port');
//     this.server = createServer();
//     this.server.on('listening', () => {
//       log('listening on %d', port);
//     });
//     this.server.on('connection', (socket) => {
//       this.connection(socket);
//     });
//     this.server.on('error', (err) => {
//       log('error %o', err);
//     });
//     this.server.on('close', () => {
//       log('close');
//     });
//     this.server.listen(port);
//   }

//   connection(socket: Socket) {
//     const id = v4();
//     const { remoteAddress, remotePort } = socket;
//     const address = `${remoteAddress}:${remotePort}`;
//     this.sockets[id] = socket;
//     log('connection | %s - %s', address, id);
//     socket.on('data', (data) => {
//       log('data | %s (%d)', id, data.length);
//       this.parse(data, id);
//     });
//     socket.on('error', (err) => {
//       log('error | %s - %o', id, err.message);
//     });
//     socket.on('close', () => {
//       log('close | %s', id);
//       delete this.sockets[id];
//     });
//   }

//   parse(buffer: Buffer, id: string) {
//     const code = buffer.readUint8(0);
//     // switch (code) {
//     //   case CODE.AUTH: {
//     //     if (Object.values(this.clients).includes(id)) return;
//     //     const client = buffer.toString('utf8', 1);
//     //     log('auth %s - %s', id, client);
//     //     this.clients[id] = client;
//     //     this.request(CODE.AUTH, Buffer.from(client), client);
//     //     break;
//     //   }
//     //   case CODE.MSG: {
//     //     const auth = this.clients[id];
//     //     if (!auth) return log('msg | no auth %s', id);
//     //     const length = buffer.readUint8(1);
//     //     const client = buffer.toString('utf8', 2, length + 2);
//     //     const message = buffer.toString('utf8', length + 2);
//     //     const authb = Buffer.from(auth);
//     //     const data = Buffer.concat([
//     //       ub8(authb.length),
//     //       authb,
//     //       Buffer.from(message),
//     //     ]);
//     //     this.request(code, data, client);
//     //     break;
//     //   }
//     //   default: {
//     //     log('Invalid code %d', code);
//     //     break;
//     //   }
//     // }
//   }

//   request(code: CODE, data: Buffer, id: string) {
//     log('request | %s : %s', CODE[code], id);
//     const buffer = Buffer.concat([ub8(code), data]);
//     const socket = this.sockets[id];
//     if (!socket) return log('request | not found %s', id);
//     socket.write(buffer);
//   }
// }
