import { BinaryLike, createHash } from 'crypto';
import debug, { Debugger } from 'debug';
import { ec } from 'elliptic';
import { IncomingMessage, request as http, RequestOptions } from 'http';
import { stdin as input, stdout as output } from 'process';
import {
  clearLine,
  clearScreenDown,
  createInterface,
  cursorTo,
} from 'readline';

export const readline = createInterface({ input, output, terminal: true });
export const clearScreen = (prompt = false) => {
  cursorTo(output, 0, 0) && clearScreenDown(output);
  !prompt || readline.prompt(true);
};
export const question = (question: string) =>
  new Promise((callback: (answer: string) => void) => {
    readline.question(question, (answer: string) => {
      readline.prompt(true);
      callback(answer);
    });
  });

export type Response = IncomingMessage & { data: string };
export const request = (
  url: string | URL,
  options: RequestOptions = {},
  body?: unknown,
) =>
  new Promise((resolve: (res: Response) => void, reject) => {
    let data = '';
    const callback = (res: IncomingMessage) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(Object.assign({ data }, res)));
    };
    const req = http(url, options, callback);
    req.on('error', reject);
    req.write(body || '');
    req.end();
  });

export const createLogger = (namespace: string | Debugger, prompt = false) => {
  const logger = typeof namespace === 'string' ? debug(namespace) : namespace;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caller = (formatter: any, ...args: any[]) => {
    !prompt || cursorTo(process.stdout, 0);
    !prompt || clearLine(process.stdout, 0);
    logger(formatter, ...args);
    !prompt || readline.prompt(true);
  };
  Object.assign(caller, logger);
  return <Debugger>caller;
};

export const extendLogger = (
  prev: Debugger,
  prompt = false,
  namespace: string,
  delimiter?: string,
) => {
  const next = prev.extend(namespace, delimiter);
  return createLogger(next, prompt);
};

export const EC = new ec('secp256k1');

export const sha256 = (data: BinaryLike) =>
  createHash('sha256').update(data).digest('hex');

export const parse = (data: string) => {
  try {
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

export const ub8 = (i: number) => {
  const buffer = Buffer.alloc(1);
  buffer.writeUint8(i);
  return buffer;
};
