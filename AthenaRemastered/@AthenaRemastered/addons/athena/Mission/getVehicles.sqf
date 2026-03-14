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
