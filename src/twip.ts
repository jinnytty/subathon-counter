import type { Logger } from 'pino';
import type { ArgumentConfig } from 'ts-command-line-args';
import type WebSocket from 'ws';
import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
import type {
  DonationMessage,
  DonationPublisher,
  DonationCallback,
} from './model.js';

const logger: Logger = initLogger('twip');

export interface TwipConfig {
  twipAlertBoxKey: string;
  twipToken: string;
  twipVersion: string;
}

export const TwipConfigOpt: ArgumentConfig<TwipConfig> = {
  twipAlertBoxKey: { type: String, defaultValue: '' },
  twipToken: { type: String, defaultValue: '' },
  twipVersion: { type: String, defaultValue: '1.1.67' },
};

// websocket url
// wss://io.mytwip.net/socket.io/?alertbox_key=WEN87wzm9B&version=1.1.67&token=MmY0NzJiYzczNmZjNTI2YQ==HgGsLvk4E1l/RTC0YlyJ07Z7KxaV6vN0bMesJ0wzMZjt80lGNjYXx/PxlCsJZqi0G9GlGlsX6ugkII26rbc33qdpZIn3h/NAnA82J2Am0pQ21gTJLhGfx8kDM66UEVFD&EIO=3&transport=websocket

// init traffic
// i 0{"sid":"uvoybVmeWPW1FOjCCQBr","upgrades":[],"pingInterval":25000,"pingTimeout":30000}
// i 40
// i 42["pause",{"all":false,"media_only":false,"media_exclude":false}]
// o 42["new follow",{"created_at":"2018-03-13T01:07:00Z","user":{"display_name":"kaylikaufman265","_id":"203309942"}}]
// o 42["new follow",{"created_at":"2017-09-10T01:28:36Z","user":{"display_name":"bettie4886639648","_id":"173383829"}}]
// o 2
// i 3

// test donation traffic
// i 42["new donate",{"_id":"TEST","nickname":"peter_berling5","amount":1000,"comment":"aedxf","watcher_id":"peter_berling5","subbed":false,"repeat":true,"ttstype":"heyguys","ttsurl":[],"slotmachine_data":null,"effect":{},"variation_id":null}]
// o 42["now",{"media":"","type":"donate","_id":"TEST"}]
// o 42["sound:stop"]
// o 42["sound:play",{"volume":80,"url":"//assets.mytwip.net/sounds/Coins.mp3?id=donateSound"}]
// i 42["now",{"media":"","type":"donate","_id":"TEST"}]
// i 42["sound:stop"]
// i 42["sound:play",{"volume":80,"url":"//assets.mytwip.net/sounds/Coins.mp3?id=donateSound"}]

type MessageObj = [string, any];

export class Twip extends WebSocketConnection implements DonationPublisher {
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
      if (obj[0] === 'new donate') {
        this.listener.forEach((l) =>
          l({
            amount: obj[1].amount,
            currency: 'krw',
          })
        );
      }
    }
    return null;
  }

  public onDonation(callback: DonationCallback): void {
    this.listener.push(callback);
  }

  public static async create(config: TwipConfig): Promise<Twip> {
    const url = `wss://io.mytwip.net/socket.io/?alertbox_key=${
      config.twipAlertBoxKey
    }&version=${config.twipVersion}&token=${encodeURIComponent(
      config.twipToken
    )}&transport=websocket`;
    logger.info({ url }, 'twip connection string');
    const r = new Twip(url);
    await r.open();
    return r;
  }
}
