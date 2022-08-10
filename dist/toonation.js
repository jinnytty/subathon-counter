import fetch from 'node-fetch';
import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
const logger = initLogger('toon');
export const ToonConfigOpt = {
    toonAlertBoxKey: { type: String, defaultValue: '' },
};
// websocket url
// wss://toon.at:8071/eyJhdXRoIjoiOTE3.....
export class Toon extends WebSocketConnection {
    constructor() {
        super(...arguments);
        this.listener = [];
    }
    ping() {
        this.send('#ping');
    }
    isPong(data) {
        return data.toString() === '#pong';
    }
    onMessage(data) {
        const msg = data.toString();
        logger.trace({ msg }, 'message received');
        try {
            const obj = JSON.parse(msg);
            if (obj.content && obj.content.amount) {
                this.listener.forEach((l) => process.nextTick(() => l({
                    amount: obj.content.amount,
                    currency: 'krw',
                })));
            }
        }
        catch (e) {
            // do nothing
        }
        return null;
    }
    onDonation(callback) {
        this.listener.push(callback);
    }
    static async create(config) {
        const resp = await fetch(`https://toon.at/widget/alertbox/${config.toonAlertBoxKey}`);
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
