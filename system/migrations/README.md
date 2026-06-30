# Migrations

Scripts in this directory perform a **live, in-place** upgrade of a **deployed
field station** from one LTS to the next — for the cases where reflashing the
prepared image isn't possible. Each encodes the delta between two release
versions: cross the monorepo checkout to the new LTS branch, drive
`update-station` so the OTA hooks deploy the new layer, patch any known
OS-package deltas, and reboot to converge.

> **Reflashing the prepared image is the recommended upgrade.** New stations ship
> with the new image. A live migration here is a deliberate, one-off fallback for a
> fielded station that's confirmed on a more-stable build but **cannot** be
> reflashed (no physical access).

The **offline image-build** path (mount a `.img` → sanitize/prepare → PiShrink)
lives in [`ctt-sensor-build/util/prepare-image.sh`](../../../ctt-sensor-build),
not here.

---

## Manifest

| Migration | Source LTS | Target LTS / Release | Description |
| --------- | ---------- | -------------------- | ----------- |
| [`2026-07-native-integration.sh`](2026-07-native-integration.sh) | lts_24-06 (v1.8.0) | lts_26_07.iso (2.0.0) | Native hardware/radio layer. One-off force fallback: branch crossover → `update-station` → `jq` → reboot. Does **not** reproduce the image's apt upgrade/kernel. |

## Naming convention

```
YYYY-MM-<short-descriptor>.sh
```

The date marks the **target** LTS version (when the release is cut); the
descriptor names the most-prominent change. Same pattern as database migrations
(`0042_add_user_email_unique.sql`).

---

## When you need one

For most version-to-version moves the plain OTA path (`update-station.sh` →
`git pull --ff-only` → `post-merge.sh`) is enough — the hooks now deploy units,
udev rules, NM profiles, and native binaries, **and** purge retired units via the
`system/systemd/REMOVED` list. Write a migration only when an in-place upgrade
needs more than that, e.g.:

- The checkout must **cross to a different branch** — a plain `git pull --ff-only`
  only fast-forwards the current branch, so it can't move a station onto a new LTS
  line.
- The source carries **working-tree drift** (`npm install` side-effects on
  `package-lock.json`) that must be discarded before the checkout.
- A first-boot/ordering change needs an explicit **reboot sequence** to converge.

If none of those apply, skip the migration — the OTA does the work. If full OS
parity (apt/kernel) matters, **reflash** — no in-place path reproduces that.

## Running a migration

These run **on the station** — delivered via the per-station OTA-script mechanism
(`station-updater.py`) or over SSH. They are **safe by default**: without an
explicit force they print the plan and exit without changing anything.

```bash
sudo bash system/migrations/<YYYY-MM-name>.sh --force      # or: FORCE_MIGRATION=1
```

Requirements on the station: root, a working uplink (the migration `git fetch`es
the new branch over public HTTPS and may fetch native binaries), and enough free
space for the new checkout + binaries.

## What a live migration does

1. **Guard / idempotent** — no-op if already on the target branch; require an
   explicit `--force` (or `FORCE_MIGRATION=1`) before touching anything.
2. **Clear working-tree drift** — `git stash` + `reset --hard` so the checkout
   can proceed.
3. **Cross to the new LTS branch** — `git fetch` + `checkout -B <branch>
   origin/<branch>`, tracking origin so future OTAs follow the new line. Restore
   repo ownership (git runs as root; the station owns it as `ctt`).
4. **Durability barrier** — `sync` the freshly-checked-out tree before running
   hooks or rebooting (a power cut in the ext4 writeback window otherwise zeroes
   the new files).
5. **Deploy via `update-station`** — now the new on-disk version, so its hooks
   fetch the pinned armhf binaries, install/enable units (purging retired ones),
   and deploy udev/network config.
6. **Patch known OS-package deltas** — best-effort, non-fatal (e.g. `jq`). This is
   not a full apt upgrade; full OS parity requires a reflash.
7. **Reboot to converge** — starts the newly-enabled native daemons (enable ≠
   start) and lets `ctt-device-config` apply the canonical `/boot/config.txt`
   (which reboots once more on its own). Two reboots total.

---

## Related

- [`../scripts/update-station.sh`](../scripts/update-station.sh) — the OTA update
  path the migration drives.
- [`../scripts/hooks/`](../scripts/hooks/) — OTA hook orchestrator (post-merge +
  pre-merge) that deploys units/udev/network/native binaries.
- [`ctt-sensor-build/util/prepare-image.sh`](../../../ctt-sensor-build) — the
  offline image-build / sanitize path.
