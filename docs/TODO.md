# Athena Remastered TODO

## Map Rendering Follow-ups

- Investigate missing static objects/building renders and verify layer visibility + data source parity.
- Investigate missing coastline renders for worlds where contour-derived coast lines are incomplete.
- Investigate missing elevation coverage and validate static cache fallback vs runtime export path.

## Immediate Follow-ups

- Investigate taxiway visibility on airport surfaces (runways visible, taxiways still too faint/missing in some worlds).
- Add/verify Follow Active Player control (sidebar toggle + map pan tracking).
- Fix/verify runtime tree visibility updates when tree data arrives asynchronously.
- Confirm whether athena.fixed.pbo is still required in release packaging flow or can be retired.
- Fix Tanoa object placements where some objects are flipped.
