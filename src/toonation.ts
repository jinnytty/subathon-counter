import type { Logger } from 'pino';
import type { ArgumentConfig } from 'ts-command-line-args';
import type WebSocket from 'ws';
import fetch from 'node-fetch';
import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
import type { DonationMessage } from './model.js';

const logger: Logger = initLogger('toon');

export interface ToonConfig {
  toonAlertBoxKey: string;
}

export const ToonConfigOpt: ArgumentConfig<ToonConfig> = {
  toonAlertBoxKey: { type: String, defaultValue: '' },
};

// websocket url
// wss://toon.at:8071/eyJhdXRoIjoiOTE3.....

export class Toon extends WebSocketConnection<DonationMessage> {
  protected ping(): void {
    this.send('#ping');
  }

  protected isPong(data: WebSocket.Data): boolean {
    return data.toString() === '#pong';
  }

  protected onMessage(data: WebSocket.Data): DonationMessage | null {
    const msg = data.toString();
    logger.trace({ msg }, 'message received');
    try {
      const obj = JSON.parse(msg);
      if (obj.content && obj.content.amount) {
        return {
          amount: obj.content.amount,
          currency: 'krw',
        };
      }
    } catch (e) {
      // do nothing
    }
    return null;
  }

  public static async create(config: ToonConfig): Promise<Toon> {
    const resp = await fetch(
      `https://toon.at/widget/alertbox/${config.toonAlertBoxKey}`
    );
    const text = await resp.text();
    const reg = /"payload":"(.*?)"/;
    const res = reg.exec(text);
    if (res === null) {
      throw new Error('playload key not found');
    }

    const url = `wss://toon.at:8071/${res[1]}`;
    logger.debug({ url }, 'websocket url');
    const r = new Toon(url);
    await r.open();
    return r;
  }
}
