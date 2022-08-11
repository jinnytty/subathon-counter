import tmi from 'tmi.js';
import { initLogger } from './util.js';
const logger = initLogger('twitch');
export const TwitchConfigOpt = {
    twitchChannel: { type: String },
};
export class Twitch {
    constructor(channel) {
        this.donationListener = [];
        this.subListener = [];
        this.client = new tmi.Client({
            channels: [channel],
        });
    }
    async connect() {
        this.client.connect();
        this.client.on('message', (channel, tags, message) => {
            logger.trace({ channel, tags, message }, 'chat message');
        });
        this.client.on('resub', (channel, username, months, message, userstate, methods) => {
            const msg = this.fromMethod(methods);
            if (msg === null)
                return;
            this.emitSub(msg);
        });
        this.client.on('subscription', (channel, username, methods) => {
            const msg = this.fromMethod(methods);
            if (msg === null)
                return;
            this.emitSub(msg);
        });
        this.client.on('subgift', (channel, username, streakMonths, recipient, methods) => {
            const msg = this.fromMethod(methods);
            if (msg === null)
                return;
            this.emitSub(msg);
        });
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
        this.client.on('cheer', (channel, userstate) => {
            if (userstate.bits === undefined)
                return;
            const donation = {
                amount: parseInt(userstate.bits),
                currency: 'bits',
            };
            this.donationListener.forEach((l) => l(donation));
        });
    }
    fromMethod(method) {
        if (method.plan === undefined || method.prime === undefined) {
            logger.error({ method }, 'incomplete subMethod');
            return null;
        }
        return {
            plan: method.plan,
            prime: method.prime,
        };
    }
    emitSub(msg) {
        this.subListener.forEach((l) => l(msg));
    }
    onDonation(callback) {
        this.donationListener.push(callback);
    }
    onSubscription(callback) {
        this.subListener.push(callback);
    }
    static async create(config) {
        const r = new Twitch(config.twitchChannel);
        await r.connect();
        return r;
    }
}
