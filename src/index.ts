import { ArgumentConfig, parse } from 'ts-command-line-args';
import type { DonationCallback, DonationMessage } from './model.js';
import {
  Streamlabs,
  StreamlabsConfig,
  StreamlabsConfigOpt,
} from './streamlabs.js';
import { Toon, ToonConfig, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfig, TwipConfigOpt } from './twip.js';

interface CounterConfig {
  config?: string;
}

const CounterConfigOpt: ArgumentConfig<CounterConfig> = {
  config: { type: String, optional: true },
};

interface Config
  extends TwipConfig,
    ToonConfig,
    StreamlabsConfig,
    CounterConfig {}

const config: Config = parse<Config>(
  {
    ...TwipConfigOpt,
    ...ToonConfigOpt,
    ...StreamlabsConfigOpt,
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

if (config.streamlabsSocketToken.length > 0) {
  const streamlabs = await Streamlabs.create(config);
  streamlabs.onDonation(donation);
}
