import { parse } from 'ts-command-line-args';
import { Toon, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfigOpt } from './twip.js';
const CounterConfigOpt = {
    config: { type: String, optional: true },
};
const config = parse({
    ...TwipConfigOpt,
    ...ToonConfigOpt,
    ...CounterConfigOpt,
}, {
    loadFromFileArg: 'config',
});
const donation = (donation) => {
    console.log('donation:', donation.amount, donation.currency);
};
if (config.twipToken.length > 0) {
    const twip = await Twip.create(config);
    twip.onDonation(donation);
}
if (config.toonAlertBoxKey.length > 0) {
    const toon = await Toon.create(config);
    toon.onDonation(donation);
}
