# system/native — fleet binary pins

One `<tool>.version` file per native tool, holding the **bare semver** the fleet
should run (e.g. `0.1.0`). The OTA hook `../scripts/hooks/post-merge.d/install-native.sh`
reads these, fetches the matching prebuilt armhf binary from the monorepo's GitHub
releases, and installs it to `/usr/local/bin/<tool>`.

These pins are **deliberately decoupled** from the source versions in
`native/src/<tool>/VERSION`:

- `native/src/<tool>/VERSION` is what the *next build* will stamp into the binary.
- `system/native/<tool>.version` is what *deployed stations* run right now.

Roll the fleet forward by: bump `native/src/<tool>/VERSION`, tag `<tool>-vX.Y.Z`
so CI publishes the release, **then** bump the matching `system/native/<tool>.version`
to the same value. Until that last bump, stations keep running the old pin even
though a newer release exists. Each tool rolls independently — no lockstep.

## Release contract (what CI must publish)

For pin `X.Y.Z` of `<tool>`, the hook fetches:

    https://github.com/cellular-tracking-technologies/sensor-station-software/releases/download/<tool>-vX.Y.Z/<tool>-X.Y.Z-armhf

Optionally (preferred), a sibling `<tool>-X.Y.Z-armhf.sha256` (the `sha256sum`
output line). When present the hook verifies it; when absent it falls back to a
`--version` smoke test. The installed binary's `<tool> --version` MUST print
exactly `X.Y.Z`.
