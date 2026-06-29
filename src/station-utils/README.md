# station-utils

Standalone Python helper scripts that run on the station as scheduled jobs (cron).
Unlike the rest of this repo, these are not part of the Node.js application — they
are small operational utilities invoked on their own schedule.

Both scripts read the station's unique ID from `/etc/ctt/station-id` and talk to
the cloud backend by its public role (a station-facing HTTPS service), never to a
fixed internal host.

## Layout

```
station-utils/
├── uploader.py          uploads logged data files to the backend
└── station-updater.py   fetches and runs an OTA update script
```

Both scripts use the station's Python virtual environment shebang
(`/lib/ctt/.envs/station/bin/python3`) and depend only on
[`requests`](https://pypi.org/project/requests/) plus the standard library.

## `uploader.py`

Uploads pending data files to the backend's upload endpoint, then files them away
locally so they are not re-sent.

- **CTT data** — rotated detection files under `/data/rotated/` are posted to the
  `.../ctt` upload route.
- **SensorGnome (SG) data** — gzipped files under `/data/SGdata/` are posted to the
  `.../sg` route, but only once older than ~1 hour (avoids uploading a file still
  being written).
- After a successful upload (HTTP `204`), each file is moved into a dated folder
  under `/data/uploaded/{ctt,sg}/YYYY-MM-DD/`.

Behavior details:

| Aspect | Behavior |
|--------|----------|
| Connectivity check | `GET /status` on the backend before attempting any upload. |
| Retries | Up to 3 attempts per file, 20 s timeout each. |
| Stop-on-failure | If any file fails to upload, the run stops (preserves ordering). |
| Selective upload | Reads `/etc/ctt/station-config.json`; the `upload.{ctt,sensorgnome}` flags enable/disable each stream (both default to on). |

Files are uploaded oldest-first as `application/octet-stream`, with the original
filename carried in a request header.

## `station-updater.py`

Obtains an update script and runs it, logging to `/data/update-<station-id>.log`.

1. If a USB stick provides `/mnt/usb/ctt/station-update.sh`, that script is used.
2. Otherwise the station POSTs its ID to the backend's update endpoint; a `200`
   response body is the update script to run.
3. The script is written to a temp file and executed with `bash`.

This gives two paths to update a deployed unit: over the air via the backend, or
in the field by inserting a prepared USB stick.

## Scheduling

These scripts are not imported by other code — they are entry points run on a
schedule. See the OS configuration under [`system/`](../../system/) for how and
when they are invoked.
