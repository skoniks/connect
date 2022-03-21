// import { ec } from 'elliptic';
// import { createConnection, Socket } from 'net';
// import { createLogger, EC, question, readline } from './utils';

// const defaults = {
//   host: '127.0.0.1',
//   port: 8833,
// };

// const logger = createLogger('client', true);

// export class CoreClient {
//   private keys!: ec.KeyPair;
//   private socket!: Socket;
//   private connected = false;

//   constructor() {
//     readline.on('line', (line) => {
//       logger('new line %s', line);
//       readline.prompt(true);
//     });

//     this.connect();
//   }

//   private async connect() {
//     this.keys = EC.genKeyPair();

//     const host = await question(`> Server host (${defaults.host}): `);
//     const port = await question(`> Server port (${defaults.port}): `);
//     this.socket = createConnection({
//       host: host || defaults.host,
//       port: Number(port) || defaults.port,
//     });
//     this.socket.on('connect', () => {
//       logger('connected');
//       this.connected = true;
//     });
//     this.socket.on('data', (data) => {
//       logger('data | (%d)', data.length);
//       // this.parse(data);
//     });
//     this.socket.on('error', (err) => {
//       logger('error | %o', err.message);
//     });
//     this.socket.on('close', () => {
//       logger('close');
//       this.connected = false;
//       this.connect();
//     });
//   }

//   private getPublic() {
//     return this.keys.getPublic(true, 'hex');
//   }

//   private getPrivate() {
//     return this.keys.getPrivate('hex');
//   }
// }
