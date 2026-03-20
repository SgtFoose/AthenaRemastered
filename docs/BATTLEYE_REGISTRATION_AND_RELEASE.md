# BattlEye Registration And Release Gate

This project depends on Arma callExtension loading `AthenaServer_x64.dll`.
If BattlEye is enabled and the DLL is not allowlisted by BattlEye, Athena data export will fail.

Use this document as a required gate for any release that ships a new DLL binary.

## Scope

Apply this process when any of the following changes:
- `AthenaServer_x64.dll` binary content
- Extension build toolchain or linker settings
- Extension filename, path, or load name
- Any extension behavior that may affect anti-cheat review

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

## Verification Steps After Allowlist

1. Launch Arma with BattlEye enabled and Athena mod loaded.
2. Confirm RPT does not contain:
   - `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll`
3. Confirm extension startup line exists in RPT (`AthenaServer` load path).
4. Confirm backend receives data (`mission`, `world`, and frame updates).
5. Confirm map population and live updates in browser.

## Fast Failure Signals

- `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll` in RPT.
- Athena stuck waiting for backend/extension handshake in-game.
- backend request queue stays empty despite player in mission.

## Operational Notes

- Keep extension filename and location stable (`AthenaServer_x64.dll` next to the mod root) to minimize review churn.
- Avoid unnecessary DLL rebuilds between submission and release.
- Treat every hash change as a new review requirement.
