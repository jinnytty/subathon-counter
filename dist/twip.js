import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
const logger = initLogger('twip');
export const TwipConfigOpt = {
    twipAlertBoxKey: { type: String, defaultValue: '' },
    twipToken: { type: String, defaultValue: '' },
    twipVersion: { type: String, defaultValue: '1.1.67' },
};
export class Twip extends WebSocketConnection {
    constructor(url) {
        super(url);
        this.listener = [];
    }
    ping() {
        this.send('2');
    }
    isPong(data) {
        return data.toString() === '3';
    }
    onMessage(data) {
        logger.trace({ msg: data.toString() }, 'message received');
        const msg = data.toString();
        const id_reg = /^(\d+)/gm.exec(msg);
        if (id_reg === null)
            return null;
        if (id_reg[1] === '42') {
            const obj = JSON.parse(msg.substring(2));
            if (obj[0] === 'new donate') {
                this.listener.forEach((l) => l({
                    amount: obj[1].amount,
                    currency: 'krw',
                }));
            }
        }
        return null;
    }
    onDonation(callback) {
        this.listener.push(callback);
    }
    static async create(config) {
        const url = `wss://io.mytwip.net/socket.io/?alertbox_key=${config.twipAlertBoxKey}&version=${config.twipVersion}&token=${encodeURIComponent(config.twipToken)}&transport=websocket`;
        logger.info({ url }, 'twip connection string');
        const r = new Twip(url);
        await r.open();
        return r;
    }
}
