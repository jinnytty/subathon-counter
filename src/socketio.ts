import type { Logger } from 'pino';
import type WebSocket from 'ws';
import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
import type TypedEmitter from 'typed-emitter';
import { EventEmitter } from 'events';
import { Mixin } from 'ts-mixer';

const logger: Logger = initLogger('socketio');

export interface Packet {
  type: number;
  data: any;
}

export interface Event {
  type: number;
  name: string | null;
  data: any;
}

type SocketIOEvents = {
  packet: (p: Packet) => void;
  event: (e: Event) => void;
};

export abstract class SocketIO extends Mixin(
  WebSocketConnection,
  EventEmitter as new () => TypedEmitter<SocketIOEvents>
) {
  constructor(url: string) {
    super(url);
  }

  public async sendPacket(packet: Packet): Promise<void> {
    const str = `${packet.type}${JSON.stringify(packet.data)}`;
    logger.trace({ message: str }, 'send packet');
    return this.send(str);
  }
  public sendEvent(event: Event): Promise<void> {
    const str = `${event.type}${JSON.stringify([event.name, event.data])}`;
    logger.trace({ message: str }, 'send event');
    return this.send(str);
  }

  protected ping(): void {
    this.send('2');
  }

  protected isPong(data: WebSocket.Data): boolean {
    return data.toString() === '3';
  }

  protected onMessage(data: WebSocket.Data) {
    logger.trace({ msg: data.toString() }, 'message received');
    const msg = data.toString();
    const id_reg = /^(\d+)/gm.exec(msg);
    if (id_reg === null) return;

    try {
      if (id_reg[1]) {
        const id = Number(id_reg[1]);
        if (msg.length > id_reg[1].length) {
          const data = JSON.parse(msg.substring(id_reg[1].length));
          this.emit('packet', {
            type: id,
            data,
          });

          if (id === 42) {
            this.emit('event', {
              type: id,
              name: (data as string[])[0],
              data: data[1],
            });
          }
        }
      }
    } catch (e) {
      logger.error({ msg, error: e }, 'unable to parse message');
    }
  }
}
