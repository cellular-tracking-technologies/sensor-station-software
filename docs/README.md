# SensorStation software — documentation

Repo-coupled documentation for the CTT SensorStation software stack. These docs are
**versioned with the code**: the copy on a release tag describes *that* release. Keep each
doc focused on one topic and link rather than duplicate.

## Where documentation lives

| Here (`docs/`) | Central docs site | Engineering KB (internal) |
|---|---|---|
| Code-coupled to **this** repo — architecture, migration, dev/build/release — versioned with tags | Customer / product guides (flashing, user guides), rendered to GitHub Pages: [`ctt_documentation`](https://cellular-tracking-technologies.github.io/ctt_documentation/) | Cross-cutting ecosystem engineering knowledge (private) |

Rule of thumb: if a doc describes **how this repo's code works or how to operate a build of it**,
it belongs here. Customer-facing product material goes to the central docs site; cross-cutting
engineering knowledge that spans repos goes to the internal KB.

## Layout

- **`overview.md`** — what the SensorStation software is and how the stack fits together
  (the Node services, the native hardware/radio layer, SensorGnome, the cloud path).
- **`architecture/`** — technical design of subsystems: the native hardware/radio layer and its
  `/run/ctt/` contracts, the OTA update system, the radio/data pipeline, the cellular data path,
  the CI image build.
- **`guides/`** — operational how-tos: migration, deployment, troubleshooting.
- **`development/`** — dev environment, building, the release / versioning process, contributing.

New docs start from the closest existing one. Product-level and customer-facing content belongs
on the central docs site, not here.

## Index

- [guides/migrating-to-lts_26_07.md](guides/migrating-to-lts_26_07.md) — migrating a station from
  the previous LTS (v1.7.0) to **lts_26_07 (v2.2.x)**: what changed, the operator-facing behavior
  changes, how to re-flash, and a post-migration checklist.
