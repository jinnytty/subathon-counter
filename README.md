Usage

For manual control through timer_control.txt, editing and saving file will update the timer.
**Set an absolute time:** `02:00:00` will set the timer to 2 hours. Has to be hh:mm:ss meaning 04h etc.
**Add time:** `+10m` will add 10 minutes.
**Subtract time:** `-30s` will subtract 30 seconds.
Clear control file after issuing command, keep it empty.

Controls through chat or control file

"!settime 01:30:00" (has to be HH:MM:SS format)
"!addtime 10m" +10 mins to timer (supports 77mins or 1000s [number+h/m/s without space] etc)
"!subtime 30s" -30s from timer
"!pausetimer" pauses timer from going down and allows it to increase from subs/donos
"!unpausetimer"
"!pausesubathon" stops adding time to timer
"!unpausesubathon"

Timer cap file time format
2025-09-28 20:00:00 GMT+8
or
2025-09-28T20:00:00 Etc/GMT-8
