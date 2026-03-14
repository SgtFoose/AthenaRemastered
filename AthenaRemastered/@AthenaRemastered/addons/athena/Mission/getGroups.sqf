//setup private vars
private ["_groups", "_idGroup", "_idLeader", "_name", "_wp", "_wpPos", "_wpX", "_wpY", "_wpType"];

//get groups
_groups = player getVariable ["ATHENA_SCOPE_GROUPS", []];

//check groups
if (count _groups == 0) exitWith { true };

//iterate through groups
{
        _idGroup = _x call BIS_fnc_netID;
        _idLeader = (leader _x) call BIS_fnc_netID;
        _name = groupid _x;
        _wpX = 0;
        _wpY = 0;
        _wpType = "";

        //get next waypoint
        _wp = currentWaypoint _x;

        //Get coordinates of next waypoint and type
        if(_wp < (count waypoints _x)) then {
                _wpPos = getWPPos[_x, _wp];
                _wpX = _wpPos select 0;
                _wpY = _wpPos select 1;
                _wpType = waypointType [_x, _wp];
        };

        //push group
        "AthenaServer" callExtension ["put",
                [
                "group",
                _idGroup,
                _idLeader,
                _name,
                _wpX,
                _wpY,
                _wpType]];
} forEach _groups;
