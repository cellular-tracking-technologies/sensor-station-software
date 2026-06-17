# Image Migrations

Scripts in this directory transform one known-good LTS image into the
next. They encode the **delta** between two release versions: the
forward deploy of new files (systemd units, udev rules, NetworkManager
profiles, version stamps) **and** the cleanup of artifacts the previous
LTS shipped that the new release no longer needs.

This is the **image-build** path. Live stations get the same forward
deploy via the OTA post-merge hooks (`system/scripts/hooks/`) but the
OTA does **not** remove obsolete files — so stations updated in the
field over time accumulate cruft that we explicitly purge here when
building a fresh image.

---

## Naming convention

```
YYYY-MM-<short-descriptor>.sh
```

The date marks the **target** LTS version (when this release is cut).
The descriptor names the most-prominent change. Same pattern as
database migrations (`0042_add_user_email_unique.sql`).

## Manifest

| Migration                                                | Source LTS  | Target LTS / Release  | Description                                                          |
| -------------------------------------------------------- | ----------- | --------------------- | -------------------------------------------------------------------- |
| [`2026-06-telit-rndis.sh`](2026-06-telit-rndis.sh)       | 2025-11-10  | v1.8.0 (2026-06)      | Telit LE910Q1 + RNDIS data path, modular OTA hooks, modem-cache API. |

---

## Running a migration

```bash
sudo bash system/migrations/<YYYY-MM-name>.sh /path/to/sensor-station.<source>.img
```

The script reads the source image, validates its provenance (checks
`/etc/ctt/station-image` matches the expected source-LTS date), and
produces `sensor-station.<today>.img` in the **same directory** as the
source.

Requirements on the build host:

- `bash`, `git`, `awk`, `install`, `chown`, `losetup`, `mount`, `umount`,
  `cp`, `sync` — all in any standard distribution
- [`pishrink`](https://github.com/Drewsif/PiShrink) on PATH (the
  scripts call it by basename at the end)
- Root (the scripts call `sudo`-requiring operations directly)
- A working internet connection — the migration runs `git fetch` to
  bring the image's monorepo checkout up to the release tag

After the migration completes, the resulting `.img` is ready to burn
to an SD card with `dd` / Etcher / etc., or to compress and upload via
`images/upload-image.sh` (or `images/upload-latest.sh` to promote to
the public LTS pointer).

## What each migration must do

1. **Validate source provenance** — read `/etc/ctt/station-image` from
   the mounted source and fail loud if it doesn't match the expected
   LTS date. Migrations are pinned to a specific source.
2. **Reset the image's monorepo to a specific release ref** — usually
   a tag like `v1.8.0`. Doing `git pull --ff-only` from the source LTS
   often fails on uncommitted working-tree drift (e.g. `npm install`
   side-effects on `package-lock.json` that the LTS build never
   committed). Use `git fetch && git reset --hard && checkout -B <branch> <tag>`.
3. **Cleanup obsolete artifacts** — explicitly `rm -f` services / rules
   that the previous LTS shipped and the new release no longer wants.
   The OTA hooks don't do this.
4. **Apply forward deploys** — install new systemd units, udev rules,
   NetworkManager profiles. Use `install -o root -g root -m <mode>` so
   ownership is correct on the Pi regardless of build-host user.
5. **Stamp the image version** — write `/etc/ctt/station-image` and
   `station-software`.
6. **Normalize file ownership** — chown the monorepo checkout to the
   `ctt` user. Look up UID/GID from the **image's** `/etc/passwd`, not
   the build host's (UID `1000` is `ctt` on the Pi but the build host
   may have a different user at UID `1000`).
7. **Shrink with pishrink** — must run **after** unmount + losetup
   detach. pishrink does its own loop attach internally and corrupts
   the filesystem if the image is still mounted.

## When the live OTA can't replace a migration

For most version-to-version moves, the live OTA path
(`update-station.sh` → `git pull` → `post-merge.sh`) is enough. A
migration is required when **any** of these apply:

- New release **removes** a service / udev rule / NM profile that
  previous versions deployed
- Release introduces a config or systemd-unit-file change that
  conflicts with the previous state and would fail `git pull` mid-OTA
- The source LTS has known working-tree drift (`npm install`
  side-effects, dev edits, etc.) that needs to be discarded cleanly
- A first-boot ordering change requires a fresh image rather than an
  in-place update

If none of those apply, skip writing a migration — the OTA does the
work.

## Why a migration script is version-pinned

Each migration is hardcoded for a specific source LTS and a specific
target release tag. Running `2026-06-telit-rndis.sh` against a
non-2025-11-10 LTS will fail loud at the provenance check. This is
deliberate: a migration encodes assumptions about both the input and
the output state, and silently running against a different input
could produce a corrupted image.

For chained upgrades (LTS A → B → C across multiple major releases),
run each migration in sequence:

```bash
sudo bash 2026-06-telit-rndis.sh    sensor-station.2025-11-10.img   # → 2026-06
sudo bash 2027-XX-next-thing.sh     sensor-station.2026-06-XX.img   # → 2027-XX
```

Each step verifies the previous step's output via the `station-image`
stamp before doing any work.

## Related

- [`../scripts/hooks/`](../scripts/hooks/) — OTA hook orchestrator
  (post-merge + pre-merge). Same `install-*.sh` deploy semantics as
  migrations, minus the cleanup step.
- [`../scripts/update-station.sh`](../scripts/update-station.sh) — the
  live-station update path that invokes the OTA hooks.
- [`../../images/upload-image.sh`](../../images/upload-image.sh) —
  distribute a built image to S3.
