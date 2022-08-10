import { initLogger } from './util.js';
import { WebSocketConnection } from './ws.js';
const logger = initLogger('streamlabs');
export const StreamlabsConfigOpt = {
    streamlabsSocketToken: { type: String, defaultValue: '' },
};
export class Streamlabs extends WebSocketConnection {
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
            if (obj[0] !== 'event')
                return null;
            const event = obj[1];
            if (event.type === 'donation') {
                event.message.forEach((em) => {
                    this.listener.forEach((l) => l({
                        amount: em.amount,
                        currency: em.currency.toLowerCase(),
                    }));
                });
            }
        }
        return null;
    }
    onDonation(callback) {
        this.listener.push(callback);
    }
    static async create(config) {
        const url = `wss://sockets.streamlabs.com/socket.io/?token=${config.streamlabsSocketToken}&transport=websocket&EIO=3`;
        logger.info(url, 'connection url');
        const r = new Streamlabs(url);
        await r.open();
        return r;
    }
}
