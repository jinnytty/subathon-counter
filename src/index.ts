import fs from 'fs';
import { ArgumentConfig, parse } from 'ts-command-line-args';
                                               
import { Duration, DateTime } from 'luxon';
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
                                                        
    return Duration.invalid('invalid format');
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].charAt(0);

  switch (unit) {
    case 's':
      return Duration.fromObject({ seconds: amount });
    case 'm':
      return Duration.fromObject({ minutes: amount });
    case 'h':
      return Duration.fromObject({ hours: amount });
    default:
                                                                               
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
  timerCapFile: string;
}

const CounterConfigOpt: ArgumentConfig<CounterConfig> = {
  config: { type: String, optional: true },
  donoRateFile: { type: String, defaultValue: 'dono.json' },
  subRateFile: { type: String, defaultValue: 'sub.json' },
  startTimer: { type: String, optional: true },
  timerFile: { type: String, defaultValue: 'timer.txt' },
  timerControlFile: { type: String, defaultValue: 'timer_control.txt' },
  timerCapFile: { type: String, defaultValue: 'timer_cap.txt' },
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

let timerCap: DateTime | null = null;
let wasPausedByCap = false;

if (config.startTimer) {
  timer = Duration.fromISOTime(config.startTimer);
}

function checkAndApplyCap() {
  if (!timerCap) {
    return;
  }

  const now = DateTime.now();
  const maxAllowedDuration = timerCap.diff(now);

  if (maxAllowedDuration.valueOf() <= 0) {
    timer = Duration.fromMillis(0);
    if (!isSubathonPaused) {
      isSubathonPaused = true;
      wasPausedByCap = true;
      console.log('\nSubathon has been PAUSED automatically as new cap is in the past.');
    }
    return;
  }

  if (timer > maxAllowedDuration) {
    timer = maxAllowedDuration;
    console.log(`\nTimer adjusted down to meet the new cap: ${timer.toFormat('h:mm:ss')}`);
    if (!isSubathonPaused) {
      isSubathonPaused = true;
      wasPausedByCap = true;
      console.log('\nSubathon has been PAUSED automatically as timer exceeded new cap.');
    }
  } else {
    if (isSubathonPaused && wasPausedByCap) {
      isSubathonPaused = false;
      wasPausedByCap = false;
      console.log('\nSubathon has been RESUMED as timer is now under the new cap.');
    }
  }
  update().catch(console.error);
}

function addCappedTime(durationToAdd: Duration): void {
  if (isSubathonPaused) {
    console.log('\nSubathon is paused. Ignoring time addition.');
    return;
  }

  const newTimerDuration = timer.plus(durationToAdd);

  if (!timerCap) {
    timer = newTimerDuration;
    console.log(`\nAdded ${durationToAdd.toFormat('h:mm:ss')}. New timer: ${timer.toFormat('h:mm:ss')}`);
    return;
  }

  const now = DateTime.now();
  const maxAllowedDuration = timerCap.diff(now);

  if (maxAllowedDuration.valueOf() <= 0) {
    console.log('\nTimer cap has been reached or is in the past. No time added.');
    if (!isSubathonPaused) {
      isSubathonPaused = true;
      wasPausedByCap = true;
      console.log('\nSubathon has been PAUSED automatically.');
    }
    return;
  }

  if (newTimerDuration > maxAllowedDuration) {
    const oldTimer = timer;
    timer = maxAllowedDuration;
    const timeActuallyAdded = timer.minus(oldTimer);

    console.log(`\nTime addition capped. Added ${timeActuallyAdded.toFormat('h:mm:ss')} to reach the cap. New timer: ${timer.toFormat('h:mm:ss')}`);

    isSubathonPaused = true;
    wasPausedByCap = true;
    console.log('\nSubathon has been PAUSED automatically as cap was reached.');
  } else {
    timer = newTimerDuration;
    console.log(`\nAdded ${durationToAdd.toFormat('h:mm:ss')}. New timer: ${timer.toFormat('h:mm:ss')}`);
  }
}

                                                                       
async function updateTimerCap() {
  try {
    const content = await fs.promises.readFile(config.timerCapFile, { encoding: 'utf8' });
    const capString = content.trim();

    if (capString === '') {
      if (timerCap !== null) {
        console.log('\nTimer cap has been removed.');
        if (isSubathonPaused && wasPausedByCap) {
          isSubathonPaused = false;
          wasPausedByCap = false;
          console.log('\nSubathon has been RESUMED as the cap was removed.');
        }
      }
      timerCap = null;
      return;
    }

    let newCap: DateTime | null = null;

    // Try parsing the new "YYYY-MM-DD HH:mm:ss GMT+8" format
    const gmtRegex = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s*(?:GMT|UTC)([+-])(\d{1,2})$/i;
    const gmtMatch = capString.match(gmtRegex);

    if (gmtMatch) {
      const dateTimePart = gmtMatch[1].replace(' ', 'T');
      const sign = gmtMatch[2];
      const offset = parseInt(gmtMatch[3], 10);
      
      // IANA Etc/GMT zones have inverted signs. GMT+8 is Etc/GMT-8.
      const invertedSign = sign === '+' ? '-' : '+';
      const ianaZone = `Etc/GMT${invertedSign}${offset}`;
      
      newCap = DateTime.fromISO(dateTimePart, { zone: ianaZone });
    } else {
      // Fallback to the original format: "YYYY-MM-DDTHH:mm:ss Zone/Identifier"
      const parts = capString.split(/\s+/);
      const dateTimeString = parts[0];
      const zoneString = parts[1];

      const opts: { zone?: string } = {};
      if (zoneString) {
        opts.zone = zoneString;
      }
      newCap = DateTime.fromISO(dateTimeString, opts);
    }
    
    if (newCap && newCap.isValid) {
      timerCap = newCap;
      console.log(`\nTimer cap set to: ${timerCap.toLocaleString(DateTime.DATETIME_FULL)} (Zone: ${timerCap.zoneName})`);
      checkAndApplyCap();
    } else {
      console.error(`\nInvalid date format in ${config.timerCapFile}. Use 'YYYY-MM-DD HH:mm:ss GMT+8' or 'YYYY-MM-DDTHH:mm:ss Zone/Identifier'. Found: "${capString}"`);
      timerCap = null;
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log(`\nCap file ${config.timerCapFile} not found. Creating an empty one. No cap is active.`);
      try {
        await fs.promises.writeFile(config.timerCapFile, '', { encoding: 'utf8' });
      } catch (writeErr) {
        console.error(`\nFailed to create cap file ${config.timerCapFile}:`, writeErr);
      }
      timerCap = null;
    } else {
      console.error(`\nError reading or parsing ${config.timerCapFile}:`, err);
    }
  }
}
                               


// First, run updateTimerCap() to ensure the file exists.
await updateTimerCap();

// Now that the file is guaranteed to exist, we can watch it.
console.log(`\nWatching for timer cap changes in: ${config.timerCapFile}`);
fs.watch(config.timerCapFile, async (eventType, filename) => {
  if (eventType === 'change' || eventType === 'rename') {
    console.log(`\nDetected change in ${config.timerCapFile}. Attempting to update cap.`);
    await updateTimerCap();
  }
});

// Ensure timer_control.txt exists before watching it
try {
  await fs.promises.access(config.timerControlFile);
} catch (error: any) {
  if (error.code === 'ENOENT') {
    console.log(`\nControl file ${config.timerControlFile} not found. Creating an empty one.`);
    try {
      await fs.promises.writeFile(config.timerControlFile, '', { encoding: 'utf8' });
    } catch (writeErr) {
      console.error(`\nFailed to create control file ${config.timerControlFile}:`, writeErr);
    }
  } else {
    console.error(`\nError checking for ${config.timerControlFile}:`, error);
  }
}

console.log(`\nWatching for timer changes in: ${config.timerControlFile}`);
fs.watch(config.timerControlFile, async (eventType, filename) => {
  if (eventType === 'change') {
    console.log(`\nDetected change in ${config.timerControlFile}. Attempting to update timer.`);
    try {
      const content = await fs.promises.readFile(config.timerControlFile, { encoding: 'utf8' });
      const command = content.trim().toLowerCase();

      // If the file is empty, it was just cleared or is in a default state. Do nothing.
      if (command === '') {
        return;
      }

      let commandIsValid = true;

      switch (command) {
        case 'pausetimer':
          isPaused = true;
          console.log('\nTimer has been PAUSED via control file.');
          break;
        case 'unpausetimer':
          isPaused = false;
          last = new Date().getTime();
          console.log('\nTimer has been RESUMED via control file.');
          break;
        case 'pausesubathon':
          isSubathonPaused = true;
          wasPausedByCap = false; // Manual pause is not a cap-pause
          console.log('\nSubathon has been PAUSED via control file. No new time will be added.');
          break;
        case 'unpausesubathon':
          if (wasPausedByCap) {
            console.log('\nSubathon was paused by the cap. Clearing the cap and resuming via control file.');
            timerCap = null;
            isSubathonPaused = false;
            wasPausedByCap = false;

            // Clear the cap file to make the change persistent.
            fs.promises.writeFile(config.timerCapFile, '', { encoding: 'utf8' })
              .then(() => console.log(`\nCap file has been cleared: ${config.timerCapFile}`))
              .catch((err) => console.error(`\nError clearing the cap file:`, err));
          } else {
            isSubathonPaused = false;
            wasPausedByCap = false;
            console.log('\nSubathon has been RESUMED via control file. Time can now be added again.');
          }
          break;
        default:
          if (command.startsWith('+') || command.startsWith('-')) {
            const amount = command.substring(1);
            const durationChange = parseDurationString(amount);
            if (!durationChange.isValid) {
              console.error(`\nInvalid duration format in control file: "${command}" use 02:34:12 or +10min, -5s etc`);
              commandIsValid = false;
            } else if (command.startsWith('+')) {
              addCappedTime(durationChange);
            } else {
              timer = timer.minus(durationChange);
              console.log(`\nSubtracted ${durationChange.toFormat('h:mm:ss')} from timer.`);
            }
          } else {
            const newDuration = Duration.fromISOTime(command);
            if (newDuration.isValid) {
              timer = newDuration;
              console.log(`\nTimer manually set to: ${timer.toFormat('h:mm:ss')}`);
              checkAndApplyCap();
            } else {
              console.error(`\nInvalid command or time format in control file: "${command}" use 02:34:12 or +10min, -5s etc`);
              commandIsValid = false;
            }
          }
          break;
      }

      // If the command was valid, update the timer and clear the control file.
      if (commandIsValid) {
        update().catch(console.error);
        await fs.promises.writeFile(config.timerControlFile, '', { encoding: 'utf8' });
        console.log(`\nProcessed and cleared ${config.timerControlFile}.`);
      }
    } catch (err) {
      console.error(`\nError reading or parsing ${config.timerControlFile}:`, err);
    }
  }
});

setInterval(() => {
  const time = new Date().getTime();
  const diff = time - last;
  last = time;
  if (!isPaused) {
    timer = timer.minus(Duration.fromMillis(diff));
  }
  update().catch(console.error);
}, 250);

async function update() {
  if (timer.valueOf() < 0) {
    timer = Duration.fromMillis(0);
  }
  const output = timer.shiftTo('hours', 'minutes', 'seconds').toFormat('h:mm:ss');
  if (output !== lastOutput) {
    lastOutput = output;
    try {
      await fs.promises.writeFile(config.timerFile, output, { encoding: 'utf8' });
      process.stdout.write(`Timer: ${output} (written to ${config.timerFile})\r`);
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
  key = key.toLowerCase();
  if (rates[key]) {
    const durationToAdd = Duration.fromObject({
      seconds: amount * rates[key],
    });
    addCappedTime(durationToAdd);
    update().catch(console.error);
  } else {
    console.log('\nkey not found!!!!', key, rates);
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

twitch.onTimerControl((msg) => {
  console.log('\nReceived timer command from Twitch:', msg);
  try {
    let durationChange: Duration;
    switch (msg.command) {
      case 'set':
        if (!msg.value) {
          console.error('\nError: !settime command requires a value.');
          break;
        }
        const newDuration = Duration.fromISOTime(msg.value);
        if (newDuration.isValid) {
          timer = newDuration;
          console.log(`\nTimer set via Twitch to: ${timer.toFormat('h:mm:ss')}`);
          checkAndApplyCap();
        } else {
          throw new Error(`Invalid time format for !settime: "${msg.value}"`);
        }
        break;

      case 'add':
        if (!msg.value) {
          console.error('\nError: !addtime command requires a value.');
          break;
        }
        durationChange = parseDurationString(msg.value);
        if (!durationChange.isValid) {
          console.error(`\nInvalid time format for !addtime: "${msg.value}"`);
          break;
        }
        addCappedTime(durationChange);
        break;

      case 'sub':
        if (!msg.value) {
          console.error('\nError: !subtime command requires a value.');
          break;
        }
        durationChange = parseDurationString(msg.value);
        if (!durationChange.isValid) {
          console.error(`\nInvalid time format for !subtime: "${msg.value}"`);
          break;
        }
        timer = timer.minus(durationChange);
        console.log(`\nSubtracted ${durationChange.toFormat('h:mm:ss')} from timer via Twitch.`);
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

      case 'pausesubathon':
        isSubathonPaused = true;
        wasPausedByCap = false;
        console.log('\nSubathon has been PAUSED. No new time will be added.');
        break;
      
      // --- MODIFIED SECTION START: 'unpausesubathon' now has cap-clearing logic ---
      case 'unpausesubathon':
        // Check if the subathon was paused automatically by reaching the cap.
        if (wasPausedByCap) {
          console.log('\nSubathon was paused by the cap. Clearing the cap and resuming.');
          timerCap = null; // Clear the cap internally.
          isSubathonPaused = false;
          wasPausedByCap = false;

          // Asynchronously clear the cap file to make the change persistent.
          fs.promises.writeFile(config.timerCapFile, '', { encoding: 'utf8' })
            .then(() => {
              console.log(`\nCap file has been cleared: ${config.timerCapFile}`);
            })
            .catch((err) => {
              console.error(`\nError clearing the cap file:`, err);
            });
        } else {
          // If it was a manual pause or not paused, just resume without touching the cap.
          isSubathonPaused = false;
          wasPausedByCap = false; // Ensure this is reset regardless.
          console.log('\nSubathon has been RESUMED. Time can now be added again. Cap (if any) remains active.');
        }
        break;
      // --- MODIFIED SECTION END ---
    }
    update().catch(console.error);
  } catch (err) {
    console.error(`\nError processing Twitch command:`, err);
  }
});
