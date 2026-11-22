//private
private ["_vehicles", "_idVehicle", "_class", "_crew", "_idUnit", "_role"];

//get vehicles
_vehicles = player getVariable ["ATHENA_SCOPE_VEHICLES", []];

//check vehicles
if (count _vehicles == 0) exitWith { true };

//iterate
{
        _idVehicle = _x call BIS_fnc_netID;
        _class = typeOf _x;
        _crew = [];

        //check if _idVehicle is an empty string
        if(_idVehicle == '') then { continue; };

        //Add a vehicle fired handler once so heavy ordnance launches are always captured.
        if (!(_x getVariable ["ATHENA_VEH_EVENTS", false])) then {
                _x addEventHandler ["Fired", {
                        if (isClass(configFile >> "CfgPatches" >> "athena")) then {
                                params ["_veh", "_weapon", "_muzzle", "_mode", "_ammo", "_magazine", "_projectile", ["_gunner", objNull]];
                                private _unit = _gunner;
                                if (isNull _unit) then { _unit = driver _veh; };
                                if (isNull _unit) exitWith {};
                                [_unit, _weapon, _muzzle, _mode, _ammo, _magazine, _projectile, _veh] call ATH_fnc_HandleFired;
                        };
                }];
                _x setVariable ["ATHENA_VEH_EVENTS", true];
        };

        //populate crew array
        {
                _idUnit = (_x select 0) call BIS_fnc_netID;
                _role = _x select 1;
                _crew pushBack [_idUnit, _role];
        } forEach fullCrew _x;

        //push vehicle
        "AthenaServer" callExtension ["put",
                [
                "vehicle",
                _idVehicle,
                _class,
                _crew]];
} forEach _vehicles;
