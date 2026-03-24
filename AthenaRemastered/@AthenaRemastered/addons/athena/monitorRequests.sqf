private ["_response", "_request", "_command", "_client", "_data"];

diag_log "Athena Queue: monitorRequests started";

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
                case "ATH_fnc_WorldTrees":       { (parseSimpleArray _data) call ATH_fnc_WorldTrees };
                case "ATH_fnc_World":            { [] call ATH_fnc_World };
        };
}];

//Polling loop: ask the extension for the next pending frontend request.
//The extension synchronously queries GET /api/game/request and returns the result
//as a SQF array string: ["command","clientId",[data...]]
while {true} do {
        _response = "AthenaServer" callExtension ["get", ["request"]];

        if ((count _response) < 2) then {
                diag_log format ["Athena Queue: malformed callExtension response=%1", _response];
                sleep 1;
        } else {
                //returnCode 0 = HTTP success, non-zero = backend unreachable/failed
                private _rc = _response param [1, -999];
                if !((_rc == 0) || {str _rc == "0"}) then {
                        diag_log format ["Athena Queue: get request failed response=%1", _response];
                        sleep 1;
                } else {
                        private _payload = _response select 0;

                        //empty payload means queue is currently empty
                        if (_payload == "") then {
                                sleep 1;
                        } else {
                                diag_log format ["Athena Queue: raw response=%1", _response];

                                //parse the SQF array string
                                _request = parseSimpleArray _payload;

                                //validate parsed format: [command, client, data]
                                if !(_request isEqualType []) then {
                                        diag_log format ["Athena Queue: parse failed payload=%1 parsed=%2", _payload, _request];
                                } else {
                                        if (count _request < 3) then {
                                                diag_log format ["Athena Queue: invalid request shape payload=%1 parsed=%2", _payload, _request];
                                        } else {
                                                _command = _request select 0;
                                                _client  = _request select 1;
                                                _data    = _request select 2;

                                                if (_command == "") then {
                                                        diag_log format ["Athena Queue: empty command payload=%1", _payload];
                                                } else {
                                                        diag_log format ["Athena Queue: command=%1 client=%2 data=%3", _command, _client, _data];

                                                        //dispatch based on command
                                                        switch (toLower _command) do {
                                                                case "locationclassexport": { [] call ATH_fnc_ExportLocationClasses };
                                                                case "vehicleclassexport":  { _data call ATH_fnc_ExportVehicleClasses };
                                                                case "weaponclassexport":   { [] call ATH_fnc_ExportWeaponClasses };

                                                                case "mission":     { [] call ATH_fnc_Mission };

                                                                // Heavy exports run via execVM so they never block this poll loop
                                                                case "elevations":  { diag_log format ["Athena Queue: dispatch elevations data=%1", _data]; _data execVM "\athena\World\getElevations.sqf" };
                                                                case "forests":     { diag_log format ["Athena Queue: dispatch forests data=%1", _data]; _data execVM "\athena\World\getForests.sqf" };
                                                                case "trees":       { diag_log format ["Athena Queue: dispatch trees data=%1", _data]; _data execVM "\athena\World\getTrees.sqf" };
                                                                case "locations":   { diag_log "Athena Queue: dispatch locations"; [] execVM "\athena\World\getLocations.sqf" };
                                                                case "roads":       { diag_log format ["Athena Queue: dispatch roads data=%1", _data]; _data execVM "\athena\World\getRoads.sqf" };
                                                                case "structures":  { diag_log format ["Athena Queue: dispatch structures data=%1", _data]; _data execVM "\athena\World\getStructures.sqf" };
                                                                case "world":       { [] call ATH_fnc_World };
                                                                default { diag_log format ["Athena Queue: unhandled command=%1 data=%2", _command, _data]; };
                                                        };
                                                };
                                        };
                                };
                        };
                };
        };
};
