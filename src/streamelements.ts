import type { Logger } from 'pino';
import type { ArgumentConfig } from 'ts-command-line-args';
import { initLogger, waitForEvent } from './util.js';
import type { DonationPublisher, DonationCallback } from './model.js';
import { Event, SocketIO } from './socketio.js';

const logger: Logger = initLogger('streamelements');

export interface StreamElementsConfig {
  streamElementsToken: string;
}

export const StreamElementsConfigOpt: ArgumentConfig<StreamElementsConfig> = {
  streamElementsToken: { type: String, defaultValue: '' },
};

export class StreamElements extends SocketIO implements DonationPublisher {
  private listener: DonationCallback[] = [];

  private constructor(url: string) {
    super(url);

    this.addListener('event', (event: Event) => {
      try {
        if (event.name === 'event:update') {
          if (event.data.name && event.data.name === 'tip-latest') {
            const data = event.data.data;
            this.listener.forEach((l) =>
              process.nextTick(() =>
                l({
                  amount: data.amount,
                  currency: 'usd',
                })
              )
            );
          }
        }
      } catch (e) {
        logger.error({ event, e }, 'error processing message');
      }
    });
  }

  public onDonation(callback: DonationCallback): void {
    this.listener.push(callback);
  }

  public static async create(
    config: StreamElementsConfig
  ): Promise<StreamElements> {
    const url =
      'wss://realtime.streamelements.com/socket.io/?cluster=main&EIO=3&transport=websocket';

    const client = new StreamElements(url);
    await client.open();

    await client.sendEvent({
      type: 42,
      name: 'authenticate',
      data: {
        method: 'apikey',
        token: config.streamElementsToken,
      },
    });

    const p = await waitForEvent(
      client,
      (e: Event) => {
        logger.trace({ event: e }, 'test for authenticated event');
        return e.name === 'authenticated';
      },
      5000
    );

    if (!p || !p.data.channelId) {
      throw new Error('authenticate response missing channelId');
    }
    await client.sendEvent({
      type: 421,
      name: 'subscribe',
      data: {
        room: `kvstore::${p.data.channelId}`,
        reconnect: false,
      },
    });
    return client;
  }
}
