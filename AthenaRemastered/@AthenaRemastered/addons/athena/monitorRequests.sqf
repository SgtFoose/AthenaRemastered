private ["_response", "_request", "_command", "_client", "_data"];

//Listen for ExtensionCallback events (world data callbacks from extension).
//These are fired by the native extension when world-export batches are received
//and acknowledged by the backend -- triggers the appropriate SQF export function.
addMissionEventHandler ["ExtensionCallback", {
        params ["_name", "_function", "_data"];

        if (_name != "AthenaServer") exitWith { false };

        switch (_function) do {
                case "ATH_fnc_WorldElevations":  { (parseSimpleArray _data) call ATH_fnc_WorldElevations };
                case "ATH_fnc_WorldForests":     { (parseSimpleArray _data) call ATH_fnc_WorldForests };
                case "ATH_fnc_WorldLocations":   { [] call ATH_fnc_WorldLocations };
                case "ATH_fnc_WorldRoads":       { (parseSimpleArray _data) call ATH_fnc_WorldRoads };
                case "ATH_fnc_WorldStructures":  { (parseSimpleArray _data) call ATH_fnc_WorldStructures };
                case "ATH_fnc_World":            { [] call ATH_fnc_World };
        };
}];

//Polling loop: ask the extension for the next pending frontend request.
//The extension synchronously queries GET /api/game/request and returns the result
//as a SQF array string: ["command","clientId",[data...]]
while {true} do {
        _response = "AthenaServer" callExtension ["get", ["request"]];

        //check to see if we received anything
        if ((_response select 0) == "") then {
                sleep 1;
                continue;
        };

        //parse the SQF array string
        _request = parseSimpleArray (_response select 0);

        //validate
        if ((isNil "_request") || {count _request == 0} || {(_request select 0) == ""}) then { continue; };

        _command = _request select 0;
        _client  = _request select 1;
        _data    = _request select 2;

        //dispatch based on command
        switch (toLower _command) do {
                case "locationclassexport": { [] call ATH_fnc_ExportLocationClasses };
                case "vehicleclassexport":  { _data call ATH_fnc_ExportVehicleClasses };
                case "weaponclassexport":   { [] call ATH_fnc_ExportWeaponClasses };

                case "mission":     { [] call ATH_fnc_Mission };

                // Heavy exports run via execVM so they never block this poll loop
                case "elevations":  { _data execVM "\athena\World\getElevations.sqf" };
                case "forests":     { _data execVM "\athena\World\getForests.sqf" };
                case "locations":   { [] execVM "\athena\World\getLocations.sqf" };
                case "roads":       { _data execVM "\athena\World\getRoads.sqf" };
                case "structures":  { _data execVM "\athena\World\getStructures.sqf" };
                case "world":       { [] call ATH_fnc_World };
        };
};
