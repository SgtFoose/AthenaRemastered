class CfgPatches {
    class athena {
        units[] = {};
        weapons[] = {};
        requiredVersion = 1.68;
        requiredAddons[] = {};
        author = "Athena Remastered";
        url = "";
        version = "1.0.0";
        versionStr = "1.0.0";
        versionAr[] = {1, 0, 0};
    };
};

class CfgFunctions {
    class ATH {
        tag = "ATH";
        class Startup {
            class Init {
                postInit = 1;
                file = "\athena\init.sqf";
            };
        };
        class Mission {
            file = "\athena\Mission";
            class Mission        { file = "\athena\Mission\getMission.sqf"; };
            class MissionTime    { file = "\athena\Mission\getTime.sqf"; };
            class MissionGroups  { file = "\athena\Mission\getGroups.sqf"; };
            class MissionUnits   { file = "\athena\Mission\getUnits.sqf"; };
            class MissionUpdates { file = "\athena\Mission\getUpdates.sqf"; };
            class MissionVehicles{ file = "\athena\Mission\getVehicles.sqf"; };
            class SendSettings   { file = "\athena\Mission\sendSettings.sqf"; };
            class GatherLocations{ file = "\athena\Mission\gatherLocations.sqf"; };
            class GatherMarkers  { file = "\athena\Mission\gatherMarkers.sqf"; };
        };
        class World {
            file = "\athena\World";
            class World           { file = "\athena\World\getWorld.sqf"; };
            class WorldElevations { file = "\athena\World\getElevations.sqf"; };
            class WorldForests    { file = "\athena\World\getForests.sqf"; };
            class WorldLocations  { file = "\athena\World\getLocations.sqf"; };
            class WorldRoads      { file = "\athena\World\getRoads.sqf"; };
            class WorldStructures { file = "\athena\World\getStructures.sqf"; };
        };
        class Events {
            file = "\athena\Events";
            class HandleFired    { file = "\athena\Events\handleFired.sqf"; };
            class HandleKilled   { file = "\athena\Events\handleKilled.sqf"; };
            class HandleKeyDown  { file = "\athena\Events\handleKeyDown.sqf"; };
        };
        class Exports {
            file = "\athena\Exports";
            class ExportLocationClasses { file = "\athena\Exports\exportLocations.sqf"; };
            class ExportVehicleClasses  { file = "\athena\Exports\exportVehicles.sqf"; };
            class ExportWeaponClasses   { file = "\athena\Exports\exportWeapons.sqf"; };
        };
    };
};
