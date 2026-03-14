//Wait until the display is ready
waitUntil {!isNull (findDisplay 46)};

//Add the key event handler
(findDisplay 46) displayAddEventHandler ["KeyDown", "_this call ATH_fnc_HandleKeyDown"];

//Monitor mission for new units in order to add MPKilled handler as they spawn.
//FiredMan is already added per-unit in getUnits.sqf (ATHENA_EVENTS flag).
//MPKilled is added to ALL units (not just scoped ones) so every death is tracked.
while {true} do {
        {
                //Check to see if the MPKilled handler has been added
                if (!(_x getVariable ["ATH_MPEvents", false])) then {
                        _x setVariable ["ATH_MPEvents", true];
                        _x addMPEventHandler ["MPKilled", {
                                if (isClass(configFile >> "CfgPatches" >> "athena")) then {
                                        [_this select 0, _this select 1, _this select 2] call ATH_fnc_HandleKilled;
                                };
                        }];
                };
        } forEach allUnits;

        sleep 5;
};
