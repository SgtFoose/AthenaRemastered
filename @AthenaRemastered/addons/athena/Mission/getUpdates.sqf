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

                private _laserTarget = laserTarget _x;
                if (isNull _laserTarget && !(isNull objectParent _x)) then {
                        _laserTarget = laserTarget (vehicle _x);
                };

                private _laserX = 0;
                private _laserY = 0;
                private _laserActive = false;
                if (!isNull _laserTarget) then {
                        private _laserPos = getPosASL _laserTarget;
                        if ((count _laserPos) >= 2) then {
                                _laserX = _laserPos select 0;
                                _laserY = _laserPos select 1;
                                _laserActive = true;
                        };
                } else {
                        // Some designators report as "on" before a laserTarget object is available.
                        // Fall back to a forward raycast so the map can still show the current point of aim.
                        private _laserOn = isLaserOn _x;
                        if (!_laserOn && !(isNull objectParent _x)) then {
                                _laserOn = isLaserOn (vehicle _x);
                        };

                        if (_laserOn) then {
                                private _eyeOrigin = eyePos _x;
                                private _eyeDir = eyeDirection _x;
                                private _rayEnd = _eyeOrigin vectorAdd (_eyeDir vectorMultiply 12000);
                                private _hits = lineIntersectsSurfaces [_eyeOrigin, _rayEnd, _x, objNull, true, 1, "GEOM", "NONE"];

                                private _aimPos = _rayEnd;
                                if ((count _hits) > 0) then {
                                        _aimPos = (_hits select 0) select 0;
                                };

                                if ((count _aimPos) >= 2) then {
                                        _laserX = _aimPos select 0;
                                        _laserY = _aimPos select 1;
                                        _laserActive = true;
                                };
                        };
                };

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
                        speed _x,
                        _laserX,
                        _laserY,
                        _laserActive]];
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
