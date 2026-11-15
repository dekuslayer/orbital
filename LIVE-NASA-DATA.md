# Live NASA data in the Jukebox and Science Lab

`src/nasaLive.js` feeds every Jukebox record and its Science Lab panel from NASA APIs at run time (browser must be online):

| Record | API | What is plotted |
|---|---|---|
| Fire Frequency | EONET `/categories/wildfires` | wildfire events started per month, latest 12 months vs a year earlier; spikes = open events |
| Storm Signals | EONET `/categories/severeStorms` | severe-storm events per month; spikes = open events |
| Earth in Motion | EONET `/events` | all natural events per month; spikes = open events |
| Ice Memory | POWER monthly T2M, 78°N 15°E | Arctic air temperature, latest 12 months vs a year earlier |
| Ocean Symphony | POWER monthly T2M, Alexandria | coastal air temperature |
| Atmosphere in Motion | POWER monthly ALLSKY_SFC_SW_DWN, Cairo | surface sunlight |
| Fever Chart | POWER monthly T2M, 0°N 0°E, vs 1991–2020 | single-point anomaly (not global GISTEMP) |

Badge: **LIVE — NASA API DATA (not a verified archive)**. The record's variable, units, explanation, sound mapping and source panel are rewritten to the real API quantity. If NASA cannot be reached, the old illustrative/provisional data return with a "NASA LIVE API UNAVAILABLE" notice.
Tests (mocked fetch): `node test/nasalive.test.mjs`. Real NASA responses were NOT fetched in the build sandbox (no network).
