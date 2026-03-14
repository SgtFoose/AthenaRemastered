//setup private vars
private ["_units", "_unitsPlayable", "_idPlayer", "_idSession", "_idSteam", "_idUnit", "_idGroup", "_idLeader", "_idVehicle", "_name", "_faction", "_side", "_team", "_type", "_rank", "_hasMediKit", "_weaponPrimary", "_weaponSecondary", "_weaponHandgun"];

//get units
_units = player getVariable ["ATHENA_SCOPE_UNITS", []];

//check units
if (count _units == 0) exitWith { true };

//get playable units
_unitsPlayable = playableUnits;

//iterate
{
        _idGroup = (group _x) call BIS_fnc_netID;
        _idLeader = (leader _x) call BIS_fnc_netID;
        _idPlayer = '';
        _idSession = '';
        _idSteam = '';
        _idUnit = _x call BIS_fnc_netID;
        _idVehicle = '';

        //check if _idUnit is an empty string
        if(_idUnit == '') then { continue; };

        _name = name _x;
        _faction = faction _x;
        _side = side _x;
        _team = assignedTeam _x;
        _type = typeOf _x;
        _rank = rank _x;

        _hasMediKit = ("Medikit" in (backpackItems _x));
        _weaponPrimary = primaryWeapon _x;
        _weaponSecondary = secondaryWeapon _x;
        _weaponHandgun = handgunWeapon _x;

        //Check team
        if(isNil("_team")) then { _team = "MAIN"; };

        //Check to see if the unit is in a vehicle
        if(!(isNull objectParent _x)) then { _idVehicle = (vehicle _x) call BIS_fnc_netID; };

        //Collect different data depending on whether or not this is a 'playable unit'
        if (count _unitsPlayable == 0) then {
                //No playable units, so must be singleplayer
                if (isPlayer _x) then {
                        _idPlayer = profileName;
                        _idSteam = getPlayerUID player;
                };
        } else {
                //There are playable units, must be multiplayer
                if (_x in _unitsPlayable) then {
                        if (isPlayer _x) then {
                                if(_x == player) then {
                                        _idSession = owner _x;
                                        _idSteam = getPlayerUID _x;
                                        _idPlayer = profileName;
                                } else {
                                        _idSession = owner _x;
                                        _idSteam = getPlayerUID _x;
                                        _idPlayer = name _x;
                                };
                        };
                };
        };

        //Check if our event handlers have been added to the unit
        if (!(_x getVariable ["ATHENA_EVENTS", false])) then {
                _x addEventHandler ["FiredMan", {
                        if (isClass(configFile >> "CfgPatches" >> "athena")) then { _this call ATH_fnc_HandleFired; };
                }];
                _x setVariable ["ATHENA_EVENTS", true];
        };

        //push unit
        "AthenaServer" callExtension ["put",
                [
                "unit",
                _idUnit,
                _idGroup,
                _idLeader,
                _idVehicle,
                _idPlayer,
                _idSession,
                _idSteam,
                _name,
                _faction,
                _side,
                _team,
                _type,
                _rank,
                _hasMediKit,
                _weaponPrimary,
                _weaponSecondary,
                _weaponHandgun]];
} forEach _units;
