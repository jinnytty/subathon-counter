### Usage

To start the script

`node dist/index.js --twitchChannel= --streamlabsSocketToken=`

---

For manual control through `timer_control.txt`, editing and saving the file will update the timer.

*   **Set an absolute time:** `02:00:00` will set the timer to 2 hours. Must be in `hh:mm:ss` format.
*   **Add time:** `+10m` will add 10 minutes.
*   **Subtract time:** `-30s` will subtract 30 seconds.

After issuing a command, clear the control file and keep it empty.

---

### Controls via Chat or Control File

*   `!settime 01:30:00` - Sets the timer to a specific time (must be in HH:MM:SS format).
*   `!addtime 10m` - Adds time to the timer (e.g., `77m` or `1000s`).
*   `!subtime 30s` - Subtracts time from the timer.
*   `!pausetimer` - Pauses the countdown but still allows time to be added.
*   `!unpausetimer` - Resumes the countdown.
*   `!pausesubathon` - Stops new time from being added to the timer.
*   `!unpausesubathon` - Resumes allowing new time to be added.

---

### Timer Cap File Format

The timer cap file accepts standard date-time formats, such as `2025-09-28 20:00:00 GMT+8` or `2025-09-28T20:00:00 Etc/GMT-8`.
