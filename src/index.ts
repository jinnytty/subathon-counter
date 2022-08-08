import { ArgumentConfig, parse } from 'ts-command-line-args';
import type { DonationMessage } from './model.js';
import { Toon, ToonConfig, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfig, TwipConfigOpt } from './twip.js';
import type { MessageListener } from './ws.js';

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

class Donation implements MessageListener<DonationMessage> {
  message(data: DonationMessage): void {
    console.log('donation:', data.amount, data.currency);
  }
}

const donation = new Donation();

if (config.twipToken.length > 0) {
  const twip = await Twip.create(config);
  twip.addListener(donation);
}

if (config.toonAlertBoxKey.length > 0) {
  const toon = await Toon.create(config);
  toon.addListener(donation);
}
