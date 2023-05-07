import fs from 'fs';
import { ArgumentConfig, parse } from 'ts-command-line-args';
import { Duration } from 'luxon';
import type {
  DonationCallback,
  DonationMessage,
  SubscriptionCallback,
  SubscriptionMessage,
} from './model.js';
import {
  Streamlabs,
  StreamlabsConfig,
  StreamlabsConfigOpt,
} from './streamlabs.js';
import { Toon, ToonConfig, ToonConfigOpt } from './toonation.js';
import { Twip, TwipConfig, TwipConfigOpt } from './twip.js';
import { Twitch, TwitchConfig, TwitchConfigOpt } from './twitch.js';
import {
  StreamElements,
  StreamElementsConfig,
  StreamElementsConfigOpt,
} from './streamelements.js';

interface CounterConfig {
  config?: string;
  donoRateFile: string;
  subRateFile: string;
  startTimer?: string;
}

const CounterConfigOpt: ArgumentConfig<CounterConfig> = {
  config: { type: String, optional: true },
  donoRateFile: { type: String, defaultValue: 'dono.json' },
  subRateFile: { type: String, defaultValue: 'sub.json' },
  startTimer: { type: String, optional: true },
};

interface Config
  extends TwipConfig,
    ToonConfig,
    StreamlabsConfig,
    StreamElementsConfig,
    TwitchConfig,
    CounterConfig {}

const config: Config = parse<Config>(
  {
    ...TwipConfigOpt,
    ...ToonConfigOpt,
    ...StreamlabsConfigOpt,
    ...StreamElementsConfigOpt,
    ...TwitchConfigOpt,
    ...CounterConfigOpt,
  },
  {
    loadFromFileArg: 'config',
  }
);

const donoRate = JSON.parse(
  await fs.promises.readFile(config.donoRateFile, { encoding: 'utf8' })
);
const subRate = JSON.parse(
  await fs.promises.readFile(config.subRateFile, { encoding: 'utf8' })
);

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

const donation: DonationCallback = (donation: DonationMessage) => {
  console.log('donation:', donation.amount, donation.currency);
  updateTime(donoRate, donation.currency, donation.amount);
};

const subscription: SubscriptionCallback = (sub: SubscriptionMessage) => {
  console.log('subscription', sub.plan);
  updateTime(subRate, sub.plan, 1);
};

function updateTime(
  rates: { [key: string]: number },
  key: string,
  amount: number
): void {
  key = key.toLowerCase();
  if (rates[key]) {
    timer = timer.plus(
      Duration.fromObject({
        seconds: amount * rates[key],
      })
    );
    update();
  } else {
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

if (config.streamElementsToken.length > 0) {
  const streamElements = await StreamElements.create(config);
  streamElements.onDonation(donation);
}

const twitch = await Twitch.create(config);
twitch.onDonation(donation);
twitch.onSubscription(subscription);
