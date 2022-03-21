// import { createServer, Server, Socket } from 'net';
// import { createLogger } from './utils';

// // enum CODE {
// //   AUTH,
// //   MSG,
// // }

// const logger = createLogger('server', true);

// export class CoreServer {
//   private server: Server;

//   constructor() {
//     const port = Number(process.env.PORT);
//     if (!port) throw Error('Invalid port');
//     this.server = createServer();
    // this.server.on('listening', () => {
    //   logger('listening on :%d', port);
    // });
    // this.server.on('connection', (socket) => {
    //   this.handleConnection(socket);
    // });
    // this.server.on('error', (err) => {
    //   logger('error | %o', err.message);
    // });
    // this.server.on('close', () => {
    //   logger('close');
    // });
    // this.server.listen(port);
//   }

//   private handleConnection(socket: Socket) {
//     logger(socket);
//   }
// }
