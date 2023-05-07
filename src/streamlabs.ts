import type { Logger } from 'pino';
import type { ArgumentConfig } from 'ts-command-line-args';
import type WebSocket from 'ws';
import type {
  DonationCallback,
  DonationMessage,
  DonationPublisher,
} from './model.js';
import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';

const logger: Logger = initLogger('streamlabs');

export interface StreamlabsConfig {
  streamlabsSocketToken: string;
}

export const StreamlabsConfigOpt: ArgumentConfig<StreamlabsConfig> = {
  streamlabsSocketToken: { type: String, defaultValue: '' },
};

type MessageObj = [string, any];

interface Event {
  type: string;
  message: any[];
}

interface DonationEvent {
  currency: string;
  amount: number;
}

export class Streamlabs
  extends WebSocketConnection
  implements DonationPublisher
{
  private listener: DonationCallback[] = [];

  private constructor(url: string) {
    super(url);
  }

  protected ping(): void {
    this.send('2');
  }

  protected isPong(data: WebSocket.Data): boolean {
    return data.toString() === '3';
  }

  protected onMessage(data: WebSocket.Data): DonationMessage | null {
    logger.trace({ msg: data.toString() }, 'message received');
    const msg = data.toString();
    const id_reg = /^(\d+)/gm.exec(msg);
    if (id_reg === null) return null;
    if (id_reg[1] === '42') {
      const obj = JSON.parse(msg.substring(2)) as MessageObj;
      if (obj[0] !== 'event') return null;
      const event = obj[1] as Event;
      if (event.type === 'donation') {
        event.message.forEach((em: DonationEvent) => {
          this.listener.forEach((l) =>
            l({
              amount: em.amount,
              currency: em.currency.toLowerCase(),
            })
          );
        });
      }
    }
    return null;
  }

  public onDonation(callback: DonationCallback): void {
    this.listener.push(callback);
  }

  public static async create(config: StreamlabsConfig): Promise<Streamlabs> {
    const url = `wss://sockets.streamlabs.com/socket.io/?token=${config.streamlabsSocketToken}&transport=websocket&EIO=3`;
    logger.info(url, 'connection url');
    const r = new Streamlabs(url);
    await r.open();
    return r;
  }
}
