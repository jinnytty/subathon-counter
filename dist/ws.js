import WebSocket from 'ws';
import { initLogger } from './util.js';
const logger = initLogger('websocket');
var Status;
(function (Status) {
    Status[Status["CLOSE"] = 0] = "CLOSE";
    Status[Status["OPEN"] = 1] = "OPEN";
})(Status || (Status = {}));
export class WebSocketConnection {
    constructor(url) {
        this.status = Status.CLOSE;
        this.id = 'ws';
        this.url = '';
        this.ws = null;
        this.pingInt = null;
        this.pingTimeout = null;
        this.pingIntervalLength = 1000 * 3;
        this.listeners = [];
        this.openResolve = undefined;
        this.openReject = undefined;
        this.url = url;
    }
    async send(data) {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject('no websocket open');
                return;
            }
            this.ws.send(data, () => {
                resolve();
            });
        });
    }
    addListener(listener) {
        this.listeners.push(listener);
    }
    open() {
        return new Promise((resolve, reject) => {
            this.openResolve = resolve;
            this.openReject = reject;
            logger.debug({ id: this.id, url: this.url, status: this.status }, 'open');
            this.ws = new WebSocket(this.url);
            this.status = Status.OPEN;
            this.ws.on('open', () => this.wsOpen());
            this.ws.on('message', (data) => this.wsMessage(data));
            this.ws.on('close', () => this.wsClose());
            this.ws.on('error', () => this.wsError());
        });
    }
    close() {
        if (this.ws === null)
            return;
        if (this.openReject) {
            this.openReject();
            this.openReject = undefined;
        }
        this.status = Status.CLOSE;
        this.ws.close();
    }
    wsOpen() {
        if (this.ws === null)
            throw new Error('websocket not defined');
        if (this.openResolve) {
            this.openResolve();
            this.openResolve = undefined;
        }
        if (this.pingInt !== null) {
            clearInterval(this.pingInt);
            this.pingInt = null;
        }
        this.pingInt = setInterval(() => {
            if (this.ws === null) {
                clearInterval(this.pingInt);
                this.pingInt = null;
                return;
            }
            if (this.ws.readyState !== WebSocket.OPEN)
                return;
            this.ping();
            if (this.pingTimeout !== null) {
                clearInterval(this.pingTimeout);
            }
            this.pingTimeout = setTimeout(() => this.timeout(), 15 * 1000);
        }, this.pingIntervalLength);
        this.onOpen();
    }
    wsError() { }
    wsMessage(data) {
        if (this.isPong(data) && this.pingTimeout) {
            clearInterval(this.pingTimeout);
            this.pingTimeout = null;
        }
        const msg = this.onMessage(data);
        if (msg === null)
            return;
        this.listeners.forEach((l) => l.message(msg));
    }
    wsClose() {
        if (this.status === Status.CLOSE)
            return;
        logger.debug({ id: this.id, status: this.status }, 'ws disconnected, reconnect in 5 seconds');
        setTimeout(() => {
            this.open().catch(() => {
                logger.error('unable to open');
            });
        }, 5 * 1000);
        this.onClose();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // @ts-ignore: no-unused-vars
    onMessage(data) { }
    onOpen() { }
    onClose() { }
    timeout() {
        logger.debug({ id: this.id, status: this.status }, 'ping timeout');
        if (!this.ws)
            return;
        this.ws.close();
    }
}
