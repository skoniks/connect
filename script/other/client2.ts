// import debug from 'debug';
// import { createConnection, Socket } from 'net';
// import { v4 } from 'uuid';
// import { CODE } from './server';
// import { question, ub8 } from './utils';

// const log = debug('client');

// export class CoreClient {
//   id: string = v4();
//   client = '';
//   socket: Socket;
//   connected = false;
//   authenticated = false;

//   constructor(host: string, port: number) {
//     if (!host) throw Error('Invalid host');
//     if (!port) throw Error('Invalid port');
//     this.socket = createConnection({ host, port });
//     this.socket.on('connect', () => {
//       log('connected');
//       this.connected = true;
//       this.authenticate();
//     });
//     this.socket.on('data', (data) => {
//       log('data | %d', data.length);
//       this.parse(data);
//     });
//     this.socket.on('error', (err) => {
//       log('error | %o', err.message);
//     });
//     this.socket.on('close', () => {
//       log('close');
//       this.connected = false;
//     });
//   }

//   parse(buffer: Buffer) {
//     const code = buffer.readUint8(0);
//     switch (code) {
//       case CODE.AUTH: {
//         const id = buffer.toString('utf8', 1);
//         if (id !== this.id) return;
//         this.authenticated = true;
//         log('authenticated');
//         this.interface();
//         break;
//       }
//       case CODE.MSG: {
//         const length = buffer.readUint8(1);
//         const client = buffer.toString('utf8', 2, length + 2);
//         const message = buffer.toString('utf8', length + 2);
//         log('%s > %s', client, message);
//         break;
//       }
//       default: {
//         log('Invalid code %d', code);
//         break;
//       }
//     }
//   }

//   request(code: CODE, data: Buffer) {
//     if (!this.connected) return;
//     const buffer = Buffer.concat([ub8(code), data]);
//     this.socket.write(buffer);
//   }

//   authenticate() {
//     if (this.authenticated) return;
//     log('authenticate %s', this.id);
//     const data = Buffer.from(this.id);
//     this.request(CODE.AUTH, data);
//   }

//   async interface() {
//     if (!this.client) this.client = await question('Client ID: ');
//     const message = await question('> ');
//     const client = Buffer.from(this.client);
//     const buffer = Buffer.concat([
//       ub8(client.length),
//       client,
//       Buffer.from(message.trim()),
//     ]);
//     this.request(CODE.MSG, buffer);
//     this.interface();
//   }
// }
