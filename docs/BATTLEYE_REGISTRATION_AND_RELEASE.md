# BattlEye Registration And Release Gate

Legacy Athena builds depend on Arma `callExtension` loading `AthenaServer_x64.dll`.
If BattlEye is enabled and the DLL is not allowlisted by BattlEye, Athena data export fails.

Athena Remastered is migrating to a DLL-free runtime path (`SQF scheduled telemetry -> external bridge -> backend`).
This document now covers both release modes.

Use this document as a required gate for any release, with mode-specific checks.

## Release Modes

- **Mode A (Legacy):** DLL-based runtime (`AthenaServer_x64.dll` in active data path)
- **Mode B (Target):** DLL-free runtime (no Arma extension loaded for Athena data path)

Every release must explicitly declare which mode it ships.

## Scope

Apply the BattlEye registration process when any of the following changes:
- `AthenaServer_x64.dll` binary content
- Extension build toolchain or linker settings
- Extension filename, path, or load name
- Any extension behavior that may affect anti-cheat review

For DLL-free releases, skip registration steps and run the DLL-free verification steps in this document.

## Root Cause Summary

- PBO signatures (`.bisign` + `.bikey`) validate addon content for server signature checks.
- They do not override BattlEye extension blocking.
- BattlEye blocking happens before Athena can send mission/world/frame data.

## BattlEye Registration Checklist

1. Build release candidate DLL and freeze it (no post-build edits).
2. Record DLL metadata:
   - file name
   - file size
   - SHA256 hash
   - product version
   - source commit SHA
   - helper command: `AthenaRemastered/tools/Get-AthenaDllMetadata.ps1`
3. Prepare review package notes:
   - high-level feature summary
   - explicit statement that DLL is used through Arma `callExtension`
   - local HTTP target and endpoints used by the extension
   - no remote command execution or code injection behavior
4. Submit the DLL and metadata through official BattlEye channels for extension review/allowlisting.
5. Track submission date, contact, and current status in release notes or internal tracker.
6. Wait for allowlist confirmation before publishing a Workshop build that requires BattlEye-enabled multiplayer usage.

## Release Gate (Required)

Do not publish a Workshop update with a new DLL unless one of these is true:
- BattlEye allowlist confirmation received for the exact DLL hash, or
- release notes explicitly mark the build as BattlEye-incompatible and intended for `-noBE` usage.

For DLL-free releases, do not publish unless all of these are true:
- no Athena runtime path loads `AthenaServer_x64.dll` in mission flow
- release notes clearly identify build as DLL-free
- verification steps below pass with BattlEye enabled

## Verification Steps After Allowlist

1. Launch Arma with BattlEye enabled and Athena mod loaded.
2. Confirm RPT does not contain:
   - `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll`
3. Confirm extension startup line exists in RPT (`AthenaServer` load path).
4. Confirm backend receives data (`mission`, `world`, and frame updates).
5. Confirm map population and live updates in browser.

## Verification Steps For DLL-Free Releases

1. Launch Arma with BattlEye enabled and Athena mod loaded.
2. Confirm RPT does not show extension load attempts for `AthenaServer_x64.dll` in Athena mission flow.
3. Confirm SQF telemetry scheduler starts and emits expected world/frame/event telemetry.
4. Confirm external bridge ingests telemetry and forwards to backend (`mission`, `world`, and frame updates).
5. Confirm map population and live updates in browser.

## Fast Failure Signals

- `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll` in RPT.
- Athena stuck waiting for backend/extension handshake in-game.
- backend request queue stays empty despite player in mission.

Additional DLL-free failure signals:
- no scheduled telemetry events emitted after mission init
- bridge process running but no valid parsed telemetry reaches backend

## Operational Notes

- Keep extension filename and location stable (`AthenaServer_x64.dll` next to the mod root) to minimize review churn.
- Avoid unnecessary DLL rebuilds between submission and release.
- Treat every hash change as a new review requirement.

During migration:
- keep legacy DLL release path isolated from DLL-free path in release notes and test plans
- avoid mixed messaging in Workshop/GitHub docs; always state build mode explicitly
