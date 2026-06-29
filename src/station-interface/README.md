# Station Interface — Local Web Dashboard

The on-device web dashboard for the CTT Sensor Station. It is an
[Express](https://expressjs.com/) + [Pug](https://pugjs.org/) application that
binds **port 80** and serves the station's local UI to anyone on the same
network (Wi-Fi access point or wired link to the station).

It is a **field/local interface, not a cloud app**. It renders status pages,
streams live radio detections, exposes diagnostics, and lets an operator perform
on-station actions (reboot, toggle modem/Wi-Fi, restart radios, manage data
files, edit Motus/SensorGnome deployment metadata). It does almost no work
itself — it authenticates the request, then either renders a Pug page, proxies
an HTTP call to the hardware API, or hands the browser a WebSocket to the radio
interface for live data and control.

```
browser ──HTTP:80──► station-interface ──┬─ renders Pug pages + static assets
                                          ├─ HTTP proxy ─► hardware API (127.0.0.1:3000)
                                          └─ (browser opens) ─► radio-interface WS (:8001)
```

---

## Quick Start

In production the dashboard runs as a systemd unit
(`system/systemd/station-web-interface.service`), started after the hardware
server, from the repo root:

```bash
npm run start-web-interface     # node ./src/station-interface/bin/www.js
```

Binding port 80 requires elevated privileges. The listen port can be overridden
with the `PORT` environment variable (see `bin/www.js`). The dashboard expects
the hardware API and radio interface to be running for its proxied and live-data
features to work.

---

## Architecture

```
src/station-interface/
├── bin/www.js              HTTP server bootstrap; binds PORT (default 80)
├── app.js                  Express app: middleware, static mounts, route table
├── users.js                file-backed user store (/etc/ctt/users.csv) + JWT secret
├── middleware/
│   ├── auth.js             JWT cookie verification, redirects to /login
│   ├── raw.js              raw body parser for binary uploads (firmware/update)
│   └── index.js
├── routes/
│   ├── login.js register.js logout.js    auth flows
│   ├── main.js blu.js                     dashboard page renderers
│   ├── update-station.js crash.js
│   ├── controls/           on-station actions (reboot, modem, wifi, radios, config)
│   ├── data/               local data-file listing / download / deletion
│   └── sensorgnome/        Motus/SensorGnome deployment + tag-database upload
├── views/                  Pug templates (main, login, register, update, blu, ...)
├── public/                 static assets served at site root
│   ├── javascripts/        client logic (interface.js, interface-blu.js, ...)
│   ├── stylesheets/        style.css
│   └── favicon.ico, logo
└── utils/                  data prep + temp-file helpers for downloads
```

Vendored browser libraries are mounted from the monorepo `node_modules` at fixed
prefixes in `app.js`: `/highcharts`, `/bootstrap`, `/jquery`, `/moment`. The
station's own static files are served from `public/`.

---

## Routing & pages

The full route table is declared in `app.js`. Routes fall into a few groups.

| Method · Route | Handler | Purpose |
|----------------|---------|---------|
| `GET /` | `routes/main.js` | Main dashboard (auth-gated); live stats, radios, modem |
| `GET /blu` | `routes/blu.js` | Blu-receiver dashboard variant (auth-gated) |
| `GET /login`, `POST /login` | `routes/login.js` | Render login form / verify credentials |
| `GET /register`, `POST /register` | `routes/register.js` | Create the first/local operator account |
| `GET /logout` | `routes/logout.js` | Clear the auth cookie |
| `GET /update-station`, `GET /update` | `routes/update-station.js` | Software-update page (auth-gated) |
| `POST /update` | `routes/controls/update.js` | Accept an uploaded update payload (auth + raw body) |
| `GET /crash` | `routes/crash.js` | Diagnostic/error page |
| `GET /config` | `routes/controls/config.js` | Read `/etc/ctt/station-config.json` as JSON |
| `POST /reboot` | `routes/controls/reboot.js` | Reboot the station (`shutdown -r now`) |
| `POST /radio-restart`, `POST /program-radios` | `routes/controls/` | Restart / reprogram the 434 MHz receivers |
| `POST /modem/enable`, `POST /modem/disable` | `routes/controls/` | Toggle the cellular modem |
| `GET /modem-signal-strength` | `routes/controls/` | Proxy modem signal strength from the hardware API |
| `POST /wifi/enable`, `POST /wifi/disable` | `routes/controls/` | Toggle Wi-Fi |
| `GET /software` | `routes/controls/software.js` | Proxy installed node/software version |
| `GET /internet-gateway`, `GET /internet-wifi-strength` | `routes/controls/` | Proxy connectivity info |
| `GET /reboot-schedule`, `POST /update-reboot-schedule` | `routes/controls/` | Read / set the scheduled reboot (proxied) |
| `GET /chrony` | `routes/controls/chrony.js` | Time-sync (chrony) status |
| `GET /ctt-data-*`, `GET /ctt-logfile` | `routes/data/ctt/` | Download current/rotated/uploaded CSV data + logs |
| `GET /sg-data-*` | `routes/data/sg/` | List SensorGnome rotated/uploaded data |
| `POST /delete-*-data-*`, `POST /clear-log` | `routes/data/` | Delete data files / clear a log |
| `GET /sg-deployment`, `POST /save-sg-deployment` | `routes/sensorgnome/` | View / save Motus deployment metadata |
| `POST /upload-sg-tag-file` | `routes/sensorgnome/` | Upload a SensorGnome tag database |
| `*` (fallback) | `app.js` | `404` |

Routes marked auth-gated mount `Middleware.Auth` in `app.js`.

---

## Auth

Authentication is a lightweight, station-local scheme — there is no external
identity provider.

- **User store** (`users.js`): operator accounts are read from a CSV file at
  `/etc/ctt/users.csv`, one `email,password_hash` per line. The file is created
  empty on first run. Passwords are hashed with `bcrypt` at registration
  (`routes/register.js`).
- **Login** (`routes/login.js`): on a correct `bcrypt.compare`, the server signs
  a [JWT](https://jwt.io/) carrying the user's email and sets it in the
  `auth_token` cookie. Sessions are short-lived (5 minutes).
- **Gate** (`middleware/auth.js`): protected routes verify the cookie's JWT and
  resolve the email back to a known user. Expired/invalid tokens redirect to
  `/login`. As a bootstrap convenience, when **no users exist yet** the gate
  lets requests through so the first account can be registered.

The JWT signing secret is generated randomly in-process at startup, so all
existing sessions are invalidated whenever the service restarts.

> Note: this guards the local dashboard only. It assumes the operator already
> has network access to the station (its access point or a wired link); it is
> not a substitute for network-level access control.

---

## Backend integration

The dashboard is a thin front end over two station services.

### HTTP proxy to the hardware API (`127.0.0.1:3000`)

Several control/diagnostic routes do not touch hardware directly — they `fetch`
the station **hardware HTTP API** on loopback and relay the JSON response. For
example:

| Dashboard route | Proxied call |
|-----------------|--------------|
| `GET /software` | `http://localhost:3000/node/version` |
| `GET /modem-signal-strength` | `http://localhost:3000/modem/signal-strength` |
| `GET /internet-gateway` | `http://localhost:3000/internet/gateway` |
| `GET /internet-wifi-strength` | `http://localhost:3000/internet/wifi-networks` |
| `GET /reboot-schedule` | `http://localhost:3000/control/reboot-schedule` |
| `POST /update-reboot-schedule` | `http://localhost:3000/control/update-reboot-schedule` |
| `POST /program-radios` | `http://localhost:3000/program-radios` |

This keeps all real hardware I/O behind the hardware server; the dashboard only
forwards requests and renders results. A handful of actions are handled locally
instead of proxied — e.g. `POST /reboot` runs `shutdown -r now`, and `GET /config`
reads `/etc/ctt/station-config.json` directly.

### Live data + control over WebSocket (`:8001`)

Live radio detections and station statistics arrive over a WebSocket served by
the **radio interface**. The connection is opened by the **browser**, not the
Express server: the client scripts (`public/javascripts/interface.js` and
`interface-blu.js`) connect to `ws://<station-host>:8001` using the page's own
hostname. Incoming messages are dispatched by a `msg_type` field (`beep`,
`blu`, `blu_stats`, `poll_interval`, `add_port`, `unlink_port`, ...) to update
the dashboard in real time, and the page periodically requests refreshed stats
over the same socket. The software-update page (`public/javascripts/station-update.js`)
uses the same `:8001` channel to follow update progress.

Because the browser connects directly, the dashboard host and the radio
interface must be reachable on the same host the page was loaded from.
