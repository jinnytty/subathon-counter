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
    ping() {
        console.log('sendping');
        this.send('2');
    }
    isPong(data) {
        console.log('isping???', data.toString());
        return data.toString() === '3';
    }
    onMessage(data) {
        const msg = data.toString();
        try {
            const obj = JSON.parse(msg);
            if (obj.content && obj.content.amount) {
                return {
                    amount: obj.content.amount,
                    currency: 'krw',
                };
            }
        }
        catch (e) {
            // do nothing
        }
        return null;
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
