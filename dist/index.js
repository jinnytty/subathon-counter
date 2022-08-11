import fs from 'fs';
import { parse } from 'ts-command-line-args';
import { Duration } from 'luxon';
import { Streamlabs, StreamlabsConfigOpt, } from './streamlabs.js';
import { Toon, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfigOpt } from './twip.js';
import { Twitch, TwitchConfigOpt } from './twitch.js';
const CounterConfigOpt = {
    config: { type: String, optional: true },
    donoRateFile: { type: String, defaultValue: 'dono.json' },
    subRateFile: { type: String, defaultValue: 'sub.json' },
    startTimer: { type: String, optional: true },
};
const config = parse({
    ...TwipConfigOpt,
    ...ToonConfigOpt,
    ...StreamlabsConfigOpt,
    ...TwitchConfigOpt,
    ...CounterConfigOpt,
}, {
    loadFromFileArg: 'config',
});
const donoRate = JSON.parse(await fs.promises.readFile(config.donoRateFile, { encoding: 'utf8' }));
const subRate = JSON.parse(await fs.promises.readFile(config.subRateFile, { encoding: 'utf8' }));
let last = new Date().getTime();
let lastOutput = '';
let timer = Duration.fromMillis(0);
if (config.startTimer) {
    timer = Duration.fromISOTime(config.startTimer);
}
setInterval(() => {
    const time = new Date().getTime();
    //const diff = Math.min(time - last, timer.toMillis());
    const diff = time - last;
    last = time;
    timer = timer.minus(Duration.fromMillis(diff));
    update();
}, 250);
function update() {
    if (timer.valueOf() < 0) {
        timer = Duration.fromMillis(0);
    }
    const output = timer.toFormat('hh:mm:ss');
    if (output !== lastOutput) {
        lastOutput = output;
        console.log('Timer:', output);
    }
}
const donation = (donation) => {
    console.log('donation:', donation.amount, donation.currency);
    updateTime(donoRate, donation.currency, donation.amount);
};
const subscription = (sub) => {
    console.log('subscription', sub.plan);
    updateTime(subRate, sub.plan, 1);
};
function updateTime(rates, key, amount) {
    key = key.toLowerCase();
    if (rates[key]) {
        timer = timer.plus(Duration.fromObject({
            seconds: amount * rates[key],
        }));
        update();
    }
    else {
        console.log('key not found!!!!', key, rates);
    }
}
if (config.twipToken.length > 0) {
    const twip = await Twip.create(config);
    twip.onDonation(donation);
}
if (config.toonAlertBoxKey.length > 0) {
    const toon = await Toon.create(config);
    toon.onDonation(donation);
}
if (config.streamlabsSocketToken.length > 0) {
    const streamlabs = await Streamlabs.create(config);
    streamlabs.onDonation(donation);
}
const twitch = await Twitch.create(config);
twitch.onDonation(donation);
twitch.onSubscription(subscription);
