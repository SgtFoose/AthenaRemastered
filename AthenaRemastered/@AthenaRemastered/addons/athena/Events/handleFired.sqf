//private vars
private ["_idUnit", "_idVehicle"];

//Populate passed vars
params ["_unit", "_weapon", "_muzzle", "_mode", "_ammo", "_magazine", "_projectile", "_vehicle"];

//set initial values
_idUnit = _unit call BIS_fnc_netID;
_idVehicle = "";

//Get vehicle netid
if(!isNull _vehicle) then { _idVehicle = _vehicle call BIS_fnc_netID; };

//push
"AthenaServer" callExtension ["put",
        [
        "fired",
        _idUnit,
        _idVehicle,
        _weapon,
        _muzzle,
        _mode,
        _ammo,
        _magazine,
        _projectile
        ]
];
