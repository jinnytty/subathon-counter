import { ArgumentConfig, parse } from 'ts-command-line-args';
import type { DonationCallback, DonationMessage } from './model.js';
import { Toon, ToonConfig, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfig, TwipConfigOpt } from './twip.js';

interface CounterConfig {
  config?: string;
}

const CounterConfigOpt: ArgumentConfig<CounterConfig> = {
  config: { type: String, optional: true },
};

interface Config extends TwipConfig, ToonConfig, CounterConfig {}

const config: Config = parse<Config>(
  {
    ...TwipConfigOpt,
    ...ToonConfigOpt,
    ...CounterConfigOpt,
  },
  {
    loadFromFileArg: 'config',
  }
);

const donation: DonationCallback = (donation: DonationMessage) => {
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
