private ["_units", "_vehicles", "_posX", "_posY", "_posZ", "_idGroup", "_idVehicle"];

//Populate variables
_units    = player getVariable ["ATHENA_SCOPE_UNITS", []];
_vehicles = player getVariable ["ATHENA_SCOPE_VEHICLES", []];

//Get unit updates
if(!isNil "_units") then {
        {
                //pos
                (getPosASL _x) params ["_posX", "_posY", "_posZ"];

                //group net id
                _idGroup = (group _x) call BIS_fnc_netID;

                //vehicle net id
                _idVehicle = '';

                //check for vehicle
                if(!(isNull objectParent _x)) then { _idVehicle = (vehicle _x) call BIS_fnc_netID; };

                //push update
                "AthenaServer" callExtension ["put",
                        [
                        "updateunit",
                        _x call BIS_fnc_netID,
                        _idGroup,
                        _idVehicle,
                        _posX,
                        _posY,
                        _posZ,
                        getDir _x,
                        speed _x]];
        } forEach _units;
};

//Get vehicle updates
if(!(isNil "_vehicles")) then {
        {
                //pos
                (getPosASL _x) params ["_posX", "_posY", "_posZ"];

                //push update
                "AthenaServer" callExtension ["put",
                        [
                        "updatevehicle",
                        _x call BIS_fnc_netID,
                        _posX,
                        _posY,
                        _posZ,
                        getDir _x,
                        speed _x]];
        } forEach _vehicles;
};
