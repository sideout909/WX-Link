# Phone and browser dashboard

Introduced in v0.5.0 and updated through stable v0.8.2, the firmware expands the protected local setup page into a phone dashboard.
Join the station’s home Wi-Fi and open http://wxlink.local, or use the
numeric IP shown alongside it on the display.
Use the existing admin login. The setup access point also serves the page.

## Prerelease 0.9.0-rc.1 header and update settings

Header retains YOUR STATION. YOUR DATA., uses WX Link, and describes Live
conditions · Local history · Weather sharing. A GitHub project link sits on a
separate line below the local address/IP. Updates offers Stable/Dev selection;
repository editing requires an unchecked-by-default unlock checkbox. Changes are
published and installed in the prerelease. See [SIGNED_OTA.md](SIGNED_OTA.md).

## Local address — v0.7.2

The header links to http://wxlink.local and the current IP. If responder startup
is unavailable, the page explicitly offers the IP fallback. mDNS works only on
compatible local networks; no external DNS service or public domain is needed.
The setup Wi-Fi retains its existing DNS/captive-portal path and numeric
192.168.4.1 fallback. Authentication is the same at either address; browsers
may request login again when switching hosts.

## Overview order

1. **At your station:** callsign; RF, Wi-Fi and APRS/CWOP indicators;
   outdoor temperature; wind and bearing; five-minute gust; humidity;
   rain today; light and UV index/full level; NWS pressure; the NWS-based sky graphic; and
   a prominent local-alert strip. The small one-hour temperature line bridges
   missed minutes, matching Home. Retained stale temperatures turn orange.
2. **Trends:** select temperature, received wind peaks, light, humidity or hourly rain or observed cumulative rain
   across the last 24 hours. Tap/point at the chart to inspect a minute.
   Missing minutes break the detailed graph; real zero values remain visible. Rain bars end at the indicated hour; cumulative rain sums complete five-minute intervals and may be partial. Incomplete or uncertain intervals are gaps.
3. **Local forecast:** all retained NWS day/night periods (up to 14), full
   descriptions, wind, rain probabilities and issued time. Switch to the next
   24 hourly periods. Hourly cards scroll horizontally on phones; expandable
   descriptions keep the day/night list manageable.
4. **Weather alerts:** current or clearly marked last-known NWS headlines,
   descriptions, instructions and expiry. Unverified/partial/failed responses
   cannot establish an all-clear; retained warnings remain prominent.
5. Seven-day CSV recording/export and setup shortcuts, followed by sun/moon.

Temperature and gusts show one decimal place, rain two, and humidity/light
use appropriate whole-number units. Pressure uses two decimal places in inHg.
Display & clock settings in Station & Wi-Fi control the date format and
12/24-hour clock on both browser and panel. Backlight dim/off preferences
affect the panel only. Receiving indicates incoming packets while the current
weather cycle is incomplete. Forecast cards use original project icons; main cloudy
conditions overlay clouds on the sun or phase-aware moon. Night fog and
precipitation also retain a visible moon behind the condition artwork. NWS is labeled
above the Home-equivalent sky graphic.

Sky graphics and pressure are attributed to NWS, separate from Atlas readings.
No forecast or pressure is invented when provider data is absent or expired.

A device without a saved home Wi-Fi network opens Station & Wi-Fi with a
prominent setup prompt. A saved network restores Overview as the landing page;
a missing location keeps a visible setup prompt for forecasts/alerts. Sharing
is optional and does not block the local dashboard.

## Shared theme — v0.7.0

Display & clock includes Midnight, Matrix, Amber, Ice Blue, Violet, Paper and Night (low light).
Changing it previews this browser without changing the device. Save and restart
persists the same palette for the panel, forms, chart lines/labels, status and
original weather artwork. Reload restores the saved palette. New/legacy configs
use Midnight by default. Native form controls follow dark/light color scheme.
Warning/watch cards retain contrasting dark red/orange and light text even on
Paper; stale temperatures retain a legible orange. Sound is removed from the
web status row and device. Night uses subdued amber/olive colors, including the NWS all-clear strip and
moon. The panel also uses a lower backlight; webpage colors cannot adjust
phone/computer hardware brightness. Forecast moon shapes now track an estimate
for the forecast period from current lunar data; missing lunar data is unknown.
No additional provider calls are introduced.

## Initial connection status — v0.6.3

On refresh, connection state starts unknown. If cached NWS responses arrive
before the device status, show Checking device connection without a false
Wi-Fi warning. A status response received before the deferred dashboard script
is retained and applied immediately when it loads. Actual Wi-Fi loss and
failed device requests still mark NWS data unverified; this fix does not
change NWS polling or hide known alerts.

## Data and refresh behavior

The dashboard uses the existing controller and cached NWS responses; opening
it does not cause provider requests. Status refreshes every five seconds,
minute history once per minute, cached forecasts every five minutes, and cached
alert details every 30 seconds while Overview is visible. Hidden tabs pause
these larger reads. Returning to the page refreshes due data. Fetches have
bounded timeouts and keep previous charts labeled unavailable if a read fails.

Protected read-only endpoints:

- `/api/status`: strict measurement fields plus a separate display-presence/age
  object, retaining the screen’s display behavior without weakening exporters.
- `/api/history`: at most 120 one-minute rows per request, with a pinned end
  minute and offset through the 1,440-entry ring. Rows contain UTC minute,
  temperature mean, wind peak, lux mean and humidity mean. Missing is JSON null.
- `/api/forecast`: four cached periods per page, daily or hourly, with fetched/
  issued times and explicit freshness. The browser rejects mixed revisions.
- `/api/alerts`: one cached alert per page with freshness, partial-response
  state and a revision marker. Failed reads retain an unverified status.

History reads run on the application loop against the existing ring; they do
not allocate another day of storage, write flash, replay samples or affect
measurement freshness. Display interpolation never enters exports or uploads.
All endpoints and local dashboard/icon assets require the existing admin
login. Weather/provider strings are rendered as text, never injected as HTML.
Credentials remain masked; no account secret is added to these responses.
The existing local HTTP transport is unchanged.

## Validation

Run `bash tools/test-firmware.sh` and the optional
`tools/verify_setup_page.py` / `tools/verify_location_setup.py` browser checks.
Host checks cover bounded history serialization, UTC paging, missing versus
zero, capacity exhaustion and read-only state. Browser checks use synthetic
packets/provider text only and verify formatting, graph gaps, day/hourly views,
warning prominence, safe text, stale/offline behavior, phone layout, setup-first
onboarding, settings ownership, masked secrets, CSRF and ZIP/map behavior.
Startup probes check dashboard authentication, its local gzip asset, forecast/
alert schemas, a full 120-row history page when UTC is valid, and invalid page
rejection without changing any saved settings.

### Owner-board validation, October 21

USB installation on the PanelLan SC05_X restored 638 populated minute buckets
and 134 archive intervals. All startup checks, including the new authenticated
endpoints, passed on the first attempt. Fourteen day/night and 24 hourly NWS
periods were available. Initial free heap was 141,456 bytes with 11,052 bytes
of minimum loop-stack headroom. Unauthenticated requests to history, forecast
and alerts each returned HTTP 401. Browser layout/onboarding/forecast/alert
checks and firmware host checks passed; live warning appearance and extended
phone/browser soak remain follow-up validation.


### Owner controls follow-up, October 21

The owner reports the v0.6.0 display/control changes passed their checks.
Automated setup checks cover clock/display preference saves, UV labels,
forecast assets and cloudy day/night overlays. This does not replace prolonged
phone/browser soak or tests of every live warning/failed-provider condition.

## Completed setup — v0.7.4

The Overview “Get connected” card follows the existing onboarding completion
rule: saved home Wi-Fi, a configured location and a confirmed station. It hides
after completion; new/incomplete setups retain guidance and top tabs remain
available. Visibility follows configuration rather than temporary Wi-Fi outages.


## v0.8.0 setup organization

Overview alone contains Sun & Moon. Wiring & Health starts with connection
health, followed by the guarded factory-reset card, then a collapsed/tappable
CC1101 wiring guide at the bottom. Station & Wi-Fi includes metric/imperial,
validated hostname and experimental daylight calibration; Sharing includes
independent PWSWeather and Windy.com v2 options with masked retained secrets.
Local source labels are LUX on the display / LUX* on web only for a valid daylight estimate,
otherwise NWS. AWC pressure identifies its provider and altimeter type.
