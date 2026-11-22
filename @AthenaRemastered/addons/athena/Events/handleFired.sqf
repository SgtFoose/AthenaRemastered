//private vars
private ["_idUnit", "_idVehicle"];

//Populate passed vars
params ["_unit", "_weapon", "_muzzle", "_mode", "_ammo", "_magazine", "_projectile", ["_last", objNull]];

private _shooter = _unit;
if (!isNull _last && {_last isKindOf "Man"}) then {
        _shooter = _last;
};

private _vehicle = objNull;
if (!isNull _unit && {_unit isKindOf "AllVehicles"} && {!(_unit isKindOf "Man")}) then {
        _vehicle = _unit;
} else {
if (!isNull _last && {_last isKindOf "AllVehicles"}) then {
        _vehicle = _last;
} else {
        private _objVeh = vehicle _shooter;
        if (!isNull _objVeh && {!(_objVeh isEqualTo _shooter)}) then {
                _vehicle = _objVeh;
        };
};
};

// Prevent duplicate fired reports when both Fired/FiredMan handlers observe the same projectile.
if (!isNull _projectile) then {
        if (_projectile getVariable ["ATHENA_FIRED_SENT", false]) exitWith {};
        _projectile setVariable ["ATHENA_FIRED_SENT", true, false];
};

//set initial values
_idUnit = _shooter call BIS_fnc_netID;
_idVehicle = "";

//Get vehicle netid
if (!isNull _vehicle) then { _idVehicle = _vehicle call BIS_fnc_netID; };
if (_idUnit isEqualTo "") then { _idUnit = _unit call BIS_fnc_netID; };
if (_idVehicle isEqualTo "" && {!isNull _unit} && {_unit isKindOf "AllVehicles"} && {!(_unit isKindOf "Man")}) then {
        _idVehicle = _unit call BIS_fnc_netID;
};

private _platform = if (!isNull _vehicle) then { _vehicle } else { _unit };
private _origin = getPosASL _platform;
private _targetCandidates = [];
private _targetPos = [];
private _targetSource = "";
private _targetEntityId = "";
private _targetAmbiguous = false;

private _turretSource = _shooter;
if (isNull _turretSource || {_turretSource isEqualTo _platform}) then {
        _turretSource = _platform;
};

private _weaponForDir = _muzzle;
if (_weaponForDir isEqualTo "") then {
        _weaponForDir = _weapon;
};
if (_weaponForDir isEqualTo "") then {
        _weaponForDir = currentWeapon _platform;
};
if (_weaponForDir isEqualTo "") then {
        _weaponForDir = currentWeapon _turretSource;
};

private _turretDirVec = _platform weaponDirection _weaponForDir;
private _turretDirX = _turretDirVec select 0;
private _turretDirY = _turretDirVec select 1;
private _turretLen = sqrt ((_turretDirX * _turretDirX) + (_turretDirY * _turretDirY));
if (_turretLen <= 0.001) then {
        _turretDirVec = _turretSource weaponDirection _weaponForDir;
        _turretDirX = _turretDirVec select 0;
        _turretDirY = _turretDirVec select 1;
        _turretLen = sqrt ((_turretDirX * _turretDirX) + (_turretDirY * _turretDirY));
};
if (_turretLen <= 0.001 && !(_muzzle isEqualTo "")) then {
        _turretDirVec = _platform weaponDirection _muzzle;
        _turretDirX = _turretDirVec select 0;
        _turretDirY = _turretDirVec select 1;
        _turretLen = sqrt ((_turretDirX * _turretDirX) + (_turretDirY * _turretDirY));
};
private _turretAzimuth = getDir _platform;
if (_turretLen > 0.001) then {
        _turretAzimuth = _turretDirX atan2 _turretDirY;
        if (_turretAzimuth < 0) then { _turretAzimuth = _turretAzimuth + 360; };
};

private _weaponText = toLower format ["%1 %2 %3", _weapon, _ammo, _magazine];
private _isGuided = ((_weaponText find "cruise") >= 0) || {(_weaponText find "missile") >= 0} || {(_weaponText find "sam") >= 0} || {(_weaponText find "at") >= 0};
private _allowTargetSteer = _isGuided;
private _debugFired = missionNamespace getVariable ["ATHENA_DEBUG_FIRED", true];
private _maxRange = 8000;
if ((_weaponText find "cruise") >= 0) then {
        _maxRange = 20000;
} else {
        if ((_weaponText find "artillery") >= 0 || {(_weaponText find "mortar") >= 0} || {(_weaponText find "shell") >= 0}) then {
                _maxRange = 12000;
        };
};

private _dirVec = if (!isNull _projectile) then { vectorDir _projectile } else { vectorDir _platform };
private _dirX = _dirVec select 0;
private _dirY = _dirVec select 1;
private _dirLen = sqrt ((_dirX * _dirX) + (_dirY * _dirY));
if (_dirLen < 0.001) then {
        private _dirDeg = getDir _platform;
        _dirX = sin _dirDeg;
        _dirY = cos _dirDeg;
        _dirLen = 1;
};
_dirX = _dirX / _dirLen;
_dirY = _dirY / _dirLen;

private _fireAzimuth = _turretAzimuth;
private _velVec = if (!isNull _projectile) then { velocity _projectile } else { [0,0,0] };
private _velX = _velVec select 0;
private _velY = _velVec select 1;
private _velLen = sqrt ((_velX * _velX) + (_velY * _velY));
private _velAzimuth = -1;
private _projAzimuth = -1;
private _targetBearing = -1;

if (_velLen > 0.25) then {
        _velAzimuth = _velX atan2 _velY;
        if (_velAzimuth < 0) then { _velAzimuth = _velAzimuth + 360; };
        _fireAzimuth = _velAzimuth;
} else {
if (_dirLen > 0.001) then {
        _projAzimuth = _dirX atan2 _dirY;
        if (_projAzimuth < 0) then { _projAzimuth = _projAzimuth + 360; };
        _fireAzimuth = _projAzimuth;
};
};

private _pushCandidate = {
        params ["_obj", "_source", "_priority", ["_applyGeometry", true]];
        if (isNull _obj) exitWith {};

        private _pos = getPosASL _obj;
        if ((count _pos) < 2) exitWith {};

        private _dx = (_pos select 0) - (_origin select 0);
        private _dy = (_pos select 1) - (_origin select 1);
        private _dist = sqrt ((_dx * _dx) + (_dy * _dy));
        if (_dist < 5) exitWith {};

        private _dot = 1;
        if (_applyGeometry) then {
                if (_dist > _maxRange) exitWith {};
                _dot = ((_dx / _dist) * _dirX) + ((_dy / _dist) * _dirY);
                if (_dot < 0.1) exitWith {};
        };

        private _entityId = _obj call BIS_fnc_netID;
        if (_entityId isEqualTo "") then {
                _entityId = typeOf _obj;
        };

        private _score = _priority + ((1 - _dot) * 100) + (_dist / 100);
        _targetCandidates pushBack [_score, _pos, _source, _entityId];
};

private _assignedTarget = assignedTarget _platform;
if (isNull _assignedTarget) then {
        _assignedTarget = assignedTarget _shooter;
};
if (_allowTargetSteer) then {
        [_assignedTarget, "assigned", 0, false] call _pushCandidate;
};

private _laserTarget = laserTarget _platform;
if (isNull _laserTarget) then {
        _laserTarget = laserTarget _shooter;
};
if (_allowTargetSteer) then {
        [_laserTarget, "laser", 200, false] call _pushCandidate;
};

private _laserObjects = [];
{
        _laserObjects append (allMissionObjects _x);
} forEach ["LaserTargetW", "LaserTargetE", "LaserTargetC"];

if (_allowTargetSteer) then {
        {
                [_x, "scan", 1000, true] call _pushCandidate;
        } forEach _laserObjects;
};

if ((count _targetCandidates) > 0) then {
        _targetCandidates sort true;

        private _best = _targetCandidates select 0;
        private _bestScore = _best select 0;
        private _bestPos = _best select 1;

        if ((count _targetCandidates) > 1) then {
                private _nextScore = (_targetCandidates select 1) select 0;
                _targetAmbiguous = (_nextScore - _bestScore) < 15;
        };

        if (!_targetAmbiguous) then {
                _targetPos = _bestPos;
                _targetSource = _best select 2;
                _targetEntityId = _best select 3;
        };
};

if (_allowTargetSteer && {(count _targetPos) > 1}) then {
        private _tx = _targetPos select 0;
        private _ty = _targetPos select 1;
        private _dx = _tx - (_origin select 0);
        private _dy = _ty - (_origin select 1);
        private _dLen = sqrt ((_dx * _dx) + (_dy * _dy));
        if (_dLen > 1) then {
                _targetBearing = _dx atan2 _dy;
                if (_targetBearing < 0) then { _targetBearing = _targetBearing + 360; };
                _fireAzimuth = _targetBearing;
        };
};

if (_debugFired) then {
        diag_log format [
                "ATHENA_FIREDDBG|unit=%1|vehicle=%2|weapon=%3|muzzle=%4|weaponForDir=%5|vehDir=%6|turretAz=%7|velAz=%8|projAz=%9|targetBrg=%10|finalAz=%11|velLen=%12|allowTargetSteer=%13|targetSource=%14|targetAmbiguous=%15|targetX=%16|targetY=%17",
                _idUnit,
                _idVehicle,
                _weapon,
                _muzzle,
                _weaponForDir,
                getDir _platform,
                _turretAzimuth,
                _velAzimuth,
                _projAzimuth,
                _targetBearing,
                _fireAzimuth,
                _velLen,
                _allowTargetSteer,
                _targetSource,
                _targetAmbiguous,
                if ((count _targetPos) > 0) then { _targetPos select 0 } else { -1 },
                if ((count _targetPos) > 1) then { _targetPos select 1 } else { -1 }
        ];
};

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
                _projectile,
                if ((count _targetPos) > 0) then { _targetPos select 0 } else { 0 },
                if ((count _targetPos) > 1) then { _targetPos select 1 } else { 0 },
                _targetSource,
                _targetEntityId,
                _targetAmbiguous,
                _fireAzimuth
                ]
];

// Spawn a lightweight tracker that reports the actual impact position
// and time-of-flight once the projectile object disappears.
// The fired_impact event lets the frontend show the correct landing point
// and compute an accurate ETA for the linger phase.
// Only track unguided indirect-fire weapons to avoid spawning a thread per infantry bullet.
private _isIndirectFire = !_isGuided && (
        (_weaponText find "mortar")    >= 0 ||
        (_weaponText find "shell")     >= 0 ||
        (_weaponText find "amos")      >= 0 ||
        (_weaponText find "nemo")      >= 0 ||
        (_weaponText find "mlrs")      >= 0 ||
        (_weaponText find "himars")    >= 0 ||
        (_weaponText find "grad")      >= 0 ||
        (_weaponText find "smerch")    >= 0 ||
        (_weaponText find "artillery") >= 0 ||
        (_weaponText find "bombl")     >= 0 ||
        (_weaponText find "shipcannon")>= 0
);
if (_isIndirectFire) then {
        private _tFired = time;
        private _shooterPos = getPosASL _platform;
        if (_debugFired) then {
                diag_log format [
                        "ATHENA_IMPACTDBG|stage=start|unit=%1|vehicle=%2|weapon=%3|muzzle=%4|ammo=%5|projNull=%6|x=%7|y=%8",
                        _idUnit,
                        _idVehicle,
                        _weapon,
                        _muzzle,
                        _ammo,
                        isNull _projectile,
                        _shooterPos select 0,
                        _shooterPos select 1
                ];
        };
        [_projectile, _tFired, _idUnit, _idVehicle, _weapon, _muzzle, _shooterPos, _ammo] spawn {
                params ["_proj", "_tFired", "_idUnit", "_idVehicle", "_weapon", "_muzzle", "_shooterPos", "_ammo"];
                // Fallback: if projectile reference was null at EH time, search near shooter by ammo class.
                // This handles cases where the projectile object is not yet propagated when the EH fires.
                if (isNull _proj) then {
                        sleep 0.1;
                        private _candidates = nearestObjects [_shooterPos, [_ammo], 600];
                        if ((missionNamespace getVariable ["ATHENA_DEBUG_FIRED", true])) then {
                                diag_log format [
                                        "ATHENA_IMPACTDBG|stage=fallback|unit=%1|vehicle=%2|weapon=%3|ammo=%4|candidates=%5",
                                        _idUnit,
                                        _idVehicle,
                                        _weapon,
                                        _ammo,
                                        count _candidates
                                ];
                        };
                        if (count _candidates > 0) then { _proj = _candidates select 0; };
                };
                if (isNull _proj) exitWith {
                        if ((missionNamespace getVariable ["ATHENA_DEBUG_FIRED", true])) then {
                                diag_log format [
                                        "ATHENA_IMPACTDBG|stage=abort-null|unit=%1|vehicle=%2|weapon=%3|muzzle=%4|ammo=%5",
                                        _idUnit,
                                        _idVehicle,
                                        _weapon,
                                        _muzzle,
                                        _ammo
                                ];
                        };
                };
                private _lastPos = getPosASL _proj;
                while { !isNull _proj && (time - _tFired) < 200 } do {
                        _lastPos = getPosASL _proj;
                        sleep 0.1;
                };
                // Only report if the shell actually hit (not timed-out)
                if ((time - _tFired) < 200) then {
                        private _tof = time - _tFired;
                        if ((missionNamespace getVariable ["ATHENA_DEBUG_FIRED", true])) then {
                                diag_log format [
                                        "ATHENA_IMPACTDBG|stage=send|unit=%1|vehicle=%2|weapon=%3|muzzle=%4|x=%5|y=%6|tof=%7",
                                        _idUnit,
                                        _idVehicle,
                                        _weapon,
                                        _muzzle,
                                        _lastPos select 0,
                                        _lastPos select 1,
                                        _tof
                                ];
                        };
                        "AthenaServer" callExtension ["put", [
                                "fired_impact",
                                _idUnit,
                                _idVehicle,
                                _weapon,
                                _muzzle,
                                _lastPos select 0,
                                _lastPos select 1,
                                _tof
                        ]];
                } else {
                        if ((missionNamespace getVariable ["ATHENA_DEBUG_FIRED", true])) then {
                                diag_log format [
                                        "ATHENA_IMPACTDBG|stage=timeout|unit=%1|vehicle=%2|weapon=%3|muzzle=%4",
                                        _idUnit,
                                        _idVehicle,
                                        _weapon,
                                        _muzzle
                                ];
                        };
                };
        };
};
