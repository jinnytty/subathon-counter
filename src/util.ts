import process from 'process';
import pino, { Logger } from 'pino';
import type { Event, SocketIO } from './socketio';

export function initLogger(module: string): Logger {
  // eslint-disable-next-line dot-notation
  let level = process.env['LOG_LEVEL'];
  if (level === undefined) {
    level = 'info';
  }
  return pino({ level }).child({
    module,
  });
}

export async function waitForEvent(
  socketio: SocketIO,
  test: (event: Event) => boolean,
  timeout: number
): Promise<Event | null> {
  return new Promise<Event | null>((resolve, reject) => {
    const cb = (e: Event) => {
      if (test(e)) {
        clearTimeout(timer);
        socketio.removeListener('event', cb);
        resolve(e);
      }
    };
    socketio.on('event', cb);
    const timer = setTimeout(() => {
      socketio.removeListener('event', cb);
      resolve(null);
    }, timeout);
  });
}
