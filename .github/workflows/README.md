# CI/CD workflows

Three GitHub Actions workflows. All run on standard `ubuntu-latest` runners
(free/unlimited for this public repo).

| Workflow | Trigger | Produces |
|---|---|---|
| [`native-build.yml`](native-build.yml) | push / PR touching `native/**` | compile-check only (CI gate) — cross-compiles the C++ tools to armhf via the pinned bullseye Docker toolchain; no release |
| [`native-release.yml`](native-release.yml) | push tag `<tool>-vX.Y.Z` | a GitHub Release with `<tool>-X.Y.Z-armhf` + `.sha256` |
| [`build-image.yml`](build-image.yml) | `workflow_dispatch` | a date-stamped SD-card image `sensor-station.<date>.img.xz` (+ `.sha256`) published to S3 |

## Native binaries — `native-build` / `native-release`

The C++ tools under `native/` are versioned and released **independently, per tool**.
The release/fetch contract (VERSION files, fleet pins, `install-native`) is documented in
**[`system/native/README.md`](../../system/native/README.md)** — read that for the full model.

Cut a binary release:

```bash
# bump native/src/<tool>/VERSION, then:
git tag <tool>-vX.Y.Z && git push origin <tool>-vX.Y.Z   # CI builds + publishes the armhf asset
# then roll the fleet: set system/native/<tool>.version to X.Y.Z (references the live release)
```

The tag's `X.Y.Z` **must** equal `native/src/<tool>/VERSION` — `native-release.yml` enforces it.

## Image build — `build-image.yml`

Incrementally builds a distributable image: takes the **last published image** as a base,
lays the current software onto it, and republishes a dated image.

- Uses `pguyot/arm-runner-action` to loop-mount the base `.img` under qemu and run
  `system/scripts/update-station.sh` **inside** it — the same OTA path field stations take
  (pulls the monorepo + `sensorgnome`, `install-native` fetches the pinned armhf binaries).
  So a green run also serves as an **OTA convergence test**.
- Shrinks the image, `xz`-compresses it, and uploads `sensor-station.<date>.img.xz` + a
  `.sha256` sidecar to `s3://media.celltracktech.com/sensor-station/images/` as `public-read`
  (served for download via CloudFront at `media.celltracktech.com`).

Run it:

```bash
gh workflow run build-image.yml --ref <branch> -f base_image=sensor-station.<YYYY-MM-DD>.img.xz
```

Notes:
- `workflow_dispatch` only registers on the repo's **default branch** — the workflow file must
  be on the default branch for the Actions button / `gh workflow run` to see it (it can then run
  against any `--ref`).
- The base image's on-disk checkout must already be on the release branch; the produced image is
  the platform of the base + the software current at build time (immediately OTA-updatable). This
  is the *incremental* path — full-OS/platform changes belong in the from-scratch build (see the
  root [README](../../README.md) "Build & deployment model").

## AWS access (image build)

`build-image.yml` authenticates to AWS via **GitHub OIDC** — no long-lived keys. It assumes a
**least-privilege role** (defined as infrastructure-as-code) scoped to this repo, permitted only
to read/write the `sensor-station/images/` S3 prefix. The role ARN is stored as the repo secret
**`AWS_IMAGE_BUILD_ROLE`** (Settings → Secrets and variables → Actions); OIDC uses the standard
`sts.amazonaws.com` audience. No secret needs to be rotated on the runner side.
