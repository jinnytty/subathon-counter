import type { Logger } from 'pino';
import type { ArgumentConfig } from 'ts-command-line-args';
import tmi from 'tmi.js';
import { initLogger } from './util.js';
import type {
  DonationCallback,
  DonationMessage,
  DonationPublisher,
  SubscriptionCallback,
  SubscriptionMessage,
  SubscriptionPublisher,
  TimerControlCallback, // <-- ADD
  TimerControlMessage, // <-- ADD
  TimerControlPublisher, // <-- ADD
} from './model.js';

const logger: Logger = initLogger('twitch');

export interface TwitchConfig {
  twitchChannel: string;
}

export const TwitchConfigOpt: ArgumentConfig<TwitchConfig> = {
  twitchChannel: { type: String },
};

export class Twitch
  implements DonationPublisher, SubscriptionPublisher, TimerControlPublisher
{
  // <-- ADD TimerControlPublisher
  private client: tmi.Client;
  private donationListener: DonationCallback[] = [];
  private subListener: SubscriptionCallback[] = [];
  private timerControlListener: TimerControlCallback[] = []; // <-- ADD

  constructor(channel: string) {
    this.client = new tmi.Client({
      channels: [channel],
    });
  }

  public async connect(): Promise<void> {
    this.client.connect();
    this.client.on('message', (channel, tags, message, self) => {
      // Ignore messages from the bot itself
      if (self) return;

      logger.trace({ channel, tags, message }, 'chat message');

      // Check for permissions (broadcaster or moderator)
      const isAllowedUser = tags.username === 'happyfluffyteddy';
      const isModerator = tags.badges?.moderator === '1';
      const isBroadcaster = tags.badges?.broadcaster === '1';
      if (!isBroadcaster && !isAllowedUser && !isModerator) {
        return;
      }

      // Parse commands
      const parts = message.trim().split(' ');
      const command = parts[0].toLowerCase();
      const value = parts[1];

      let controlMsg: TimerControlMessage | null = null;

      if (
        (command === '!settime' ||
          command === '!addtime' ||
          command === '!subtime') &&
        value
      ) {
        if (command === '!settime') {
          controlMsg = { command: 'set', value };
        } else if (command === '!addtime') {
          controlMsg = { command: 'add', value };
        } else if (command === '!subtime') {
          controlMsg = { command: 'sub', value };
        }
      } else if (command === '!pausetimer') {
        controlMsg = { command: 'pause' }; // No value needed
      } else if (command === '!unpausetimer') {
        controlMsg = { command: 'unpause' }; // No value needed
      } else if (command === '!pausesubathon') {
        controlMsg = { command: 'pausesubathon' }; // No value needed
      } else if (command === '!unpausesubathon') {
        controlMsg = { command: 'unpausesubathon' }; // No value needed
      }

      if (controlMsg) {
        this.timerControlListener.forEach((l) => l(controlMsg!));
      }
      // --- END OF MODIFIED LOGIC ---
    });

    this.client.on(
      'resub',
      (
        channel: string,
        username: string,
        months: number,
        message: string,
        userstate: tmi.SubUserstate,
        methods: tmi.SubMethods
      ) => {
        const msg = this.fromMethod(methods);
        if (msg === null) return;
        this.emitSub(msg);
      }
    );
    this.client.on(
      'subscription',
      (channel: string, username: string, methods: tmi.SubMethods) => {
        const msg = this.fromMethod(methods);
        if (msg === null) return;
        this.emitSub(msg);
      }
    );
    this.client.on(
      'subgift',
      (
        channel: string,
        username: string,
        streakMonths: number,
        recipient: string,
        methods: tmi.SubMethods
      ) => {
        const msg = this.fromMethod(methods);
        if (msg === null) return;
        this.emitSub(msg);
      }
    );
    /*this.client.on('submysterygift', (...args: any[]) => {
      console.log('submysterygift', args);
    });
    this.client.on('anonsubgift', (...args: any[]) => {
      console.log('anonsubgift', args);
    });
    this.client.on('anonsubmysterygift', (...args: any[]) => {
      console.log('anonsubmysterygift', args);
    });
    this.client.on('giftpaidupgrade', (...args: any[]) => {
      console.log('giftpaidupgrade', args);
    });
    this.client.on('anongiftpaidupgrade', (...args: any[]) => {
      console.log('anongiftpaidupgrade', args);
    });*/
    this.client.on('cheer', (channel: string, userstate: tmi.ChatUserstate) => {
      if (userstate.bits === undefined) return;
      const donation: DonationMessage = {
        amount: parseInt(userstate.bits),
        currency: 'bits',
      };
      this.donationListener.forEach((l) => l(donation));
    });
  }

  private fromMethod(method: tmi.SubMethods): SubscriptionMessage | null {
    if (method.plan === undefined || method.prime === undefined) {
      logger.error({ method }, 'incomplete subMethod');
      return null;
    }
    return {
      plan: method.plan,
      prime: method.prime,
    };
  }

  private emitSub(msg: SubscriptionMessage): void {
    this.subListener.forEach((l) => l(msg));
  }

  public onDonation(callback: DonationCallback): void {
    this.donationListener.push(callback);
  }

  public onSubscription(callback: SubscriptionCallback): void {
    this.subListener.push(callback);
  }

  public onTimerControl(callback: TimerControlCallback): void {
    this.timerControlListener.push(callback);
  }

  public static async create(config: TwitchConfig): Promise<Twitch> {
    const r = new Twitch(config.twitchChannel);
    await r.connect();
    return r;
  }
}
