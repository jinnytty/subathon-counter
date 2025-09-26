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

function parseDurationString(value: string): Duration {
  const match = value
    .toLowerCase()
    .match(/^(\d+)\s*(s|sec|seconds?|m|mins?|minutes?|h|hr|hours?)$/);

  if (!match) {
    // Return an invalid duration if the format is wrong
    return Duration.invalid('invalid format');
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].charAt(0); // We only need the first letter (s, m, or h) to decide

  switch (unit) {
    case 's':
      return Duration.fromObject({ seconds: amount });
    case 'm':
      return Duration.fromObject({ minutes: amount });
    case 'h':
      return Duration.fromObject({ hours: amount });
    default:
      // This should not be reachable due to the regex, but it's good practice.
      return Duration.invalid('unknown unit');
  }
}

interface CounterConfig {
  config?: string;
  donoRateFile: string;
  subRateFile: string;
  startTimer?: string;
  timerFile: string;
  timerControlFile: string;
}

const CounterConfigOpt: ArgumentConfig<CounterConfig> = {
  config: { type: String, optional: true },
  donoRateFile: { type: String, defaultValue: 'dono.json' },
  subRateFile: { type: String, defaultValue: 'sub.json' },
  startTimer: { type: String, optional: true },
  timerFile: { type: String, defaultValue: 'timer.txt' },
  timerControlFile: { type: String, defaultValue: 'timer_control.txt' },
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
let isSubathonPaused = false;
let isPaused = false;

if (config.startTimer) {
  timer = Duration.fromISOTime(config.startTimer);
}

// --- START: NEW FILE WATCHER SECTION ---
console.log(`\nWatching for timer changes in: ${config.timerControlFile}`);
fs.watch(config.timerControlFile, async (eventType, filename) => {
  if (eventType === 'change') {
    console.log(
      `\nDetected change in ${config.timerControlFile}. Attempting to update timer.`
    );
    try {
      const content = await fs.promises.readFile(config.timerControlFile, {
        encoding: 'utf8',
      });
      const newTime = content.trim();

      // We support two command formats:
      // 1. Absolute time: "01:30:00" -> sets the timer to 1 hour 30 mins
      // 2. Relative time: "+10m", "-30s" -> adds 10 mins or subtracts 30 secs

      if (newTime.startsWith('+') || newTime.startsWith('-')) {
        if (newTime.startsWith('+') && isSubathonPaused) {
          console.log(
            '\nSubathon is paused. Ignoring time addition from control file.'
          );
          return; // <-- Exit if subathon is paused and time is being added
        }
        const amount = newTime.substring(1); // e.g., "10m"
        const durationChange = parseDurationString(amount); // <-- USE THE NEW FUNCTION

        if (!durationChange.isValid) {
          // <-- ADD VALIDITY CHECK
          console.error(
            `\nInvalid duration format in control file: "${newTime}"`
          );
          return; // Exit if the format is bad
        }

        if (newTime.startsWith('+')) {
          timer = timer.plus(durationChange);
          console.log(
            `\nAdded ${durationChange.toFormat('h:mm:ss')} to timer.`
          );
        } else {
          timer = timer.minus(durationChange);
          console.log(
            `\nSubtracted ${durationChange.toFormat('h:mm:ss')} from timer.`
          );
        }
      } else {
        // Assume absolute time like HH:mm:ss
        const newDuration = Duration.fromISOTime(newTime);
        if (newDuration.isValid) {
          timer = newDuration;
          console.log(`\nTimer manually set to: ${timer.toFormat('h:mm:ss')}`);
        } else {
          throw new Error(`Invalid time format: "${newTime}"`);
        }
      }

      // Immediately update the output file
      update().catch(console.error);
    } catch (err) {
      console.error(
        `\nError reading or parsing ${config.timerControlFile}:`,
        err
      );
    }
  }
});
// --- END: NEW FILE WATCHER SECTION ---

// MODIFIED SECTION 1: Adjusted setInterval to handle async update()
setInterval(() => {
  const time = new Date().getTime();
  const diff = time - last;
  last = time;
  if (!isPaused) {
    timer = timer.minus(Duration.fromMillis(diff));
  } // Call update and catch any potential errors from the async operation
  update().catch(console.error);
}, 250);

// MODIFIED SECTION 2: Changed update() to write to a file
async function update() {
  if (timer.valueOf() < 0) {
    timer = Duration.fromMillis(0);
  }
  const output = timer
    .shiftTo('hours', 'minutes', 'seconds')
    .toFormat('h:mm:ss');
  if (output !== lastOutput) {
    lastOutput = output;
    try {
      // Write the formatted time to the file specified in the config
      await fs.promises.writeFile(config.timerFile, output, {
        encoding: 'utf8',
      });
      process.stdout.write(
        `Timer: ${output} (written to ${config.timerFile})\r`
      );
    } catch (err) {
      console.error('\nError writing timer file:', err);
    }
  }
}

const donation: DonationCallback = (donation: DonationMessage) => {
  console.log('\ndonation:', donation.amount, donation.currency);
  updateTime(donoRate, donation.currency, donation.amount);
};

const subscription: SubscriptionCallback = (sub: SubscriptionMessage) => {
  console.log('\nsubscription', sub.plan);
  updateTime(subRate, sub.plan, 1);
};

function updateTime(
  rates: { [key: string]: number },
  key: string,
  amount: number
): void {
  // Check if the subathon is paused before adding any time
  if (isSubathonPaused) {
    console.log('\nSubathon is paused. Ignoring time addition from event.');
    return;
  }
  key = key.toLowerCase();
  if (rates[key]) {
    timer = timer.plus(
      Duration.fromObject({
        seconds: amount * rates[key],
      })
    );
    // MODIFIED SECTION 3: Adjusted this call to handle async update()
    update().catch(console.error);
  } else {
    console.log('\nkey not found!!!!', key, rates);
  }
}

// --- The rest of the file is unchanged ---

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

// --- START: NEW SECTION FOR TWITCH COMMANDS ---
twitch.onTimerControl((msg) => {
  console.log('\nReceived timer command from Twitch:', msg);
  try {
    let durationChange: Duration;
    switch (msg.command) {
      case 'set':
        // Add a check to ensure msg.value exists
        if (!msg.value) {
          console.error('\nError: !settime command requires a value.');
          break; // Exit this case
        }
        const newDuration = Duration.fromISOTime(msg.value); // This is now safe
        if (newDuration.isValid) {
          timer = newDuration;
          console.log(
            `\nTimer set via Twitch to: ${timer.toFormat('h:mm:ss')}`
          );
        } else {
          throw new Error(`Invalid time format for !settime: "${msg.value}"`);
        }
        break;

      case 'add':
        if (!msg.value) {
          console.error('\nError: !addtime command requires a value.');
          break;
        }
        durationChange = parseDurationString(msg.value); // <-- USE THE NEW FUNCTION
        if (!durationChange.isValid) {
          // <-- ADD VALIDITY CHECK
          console.error(`\nInvalid time format for !addtime: "${msg.value}"`);
          break;
        }
        //  Check if subathon is paused before adding time
        if (isSubathonPaused) {
          console.log('\nSubathon is paused. Ignoring !addtime command.');
          break;
        }
        timer = timer.plus(durationChange);
        console.log(
          `\nAdded ${durationChange.toFormat('h:mm:ss')} to timer via Twitch.`
        );
        break;

      case 'sub':
        if (!msg.value) {
          console.error('\nError: !subtime command requires a value.');
          break;
        }
        durationChange = parseDurationString(msg.value); // <-- USE THE NEW FUNCTION
        if (!durationChange.isValid) {
          // <-- ADD VALIDITY CHECK
          console.error(`\nInvalid time format for !subtime: "${msg.value}"`);
          break;
        }
        timer = timer.minus(durationChange);
        console.log(
          `\nSubtracted ${durationChange.toFormat(
            'h:mm:ss'
          )} from timer via Twitch.`
        );
        break;

      case 'pause':
        isPaused = true;
        console.log('\nTimer has been PAUSED.');
        break;

      case 'unpause':
        isPaused = false;
        last = new Date().getTime();
        console.log('\nTimer has been RESUMED.');
        break;

      // Handle the new subathon pause/unpause commands
      case 'pausesubathon':
        isSubathonPaused = true;
        console.log('\nSubathon has been PAUSED. No new time will be added.');
        break;
      case 'unpausesubathon':
        isSubathonPaused = false;
        console.log(
          '\nSubathon has been RESUMED. Time can now be added again.'
        );
        break;
    }
    // Immediately update the output file
    update().catch(console.error);
  } catch (err) {
    console.error(`\nError processing Twitch command:`, err);
  }
});
// --- END: NEW SECTION FOR TWITCH COMMANDS ---
