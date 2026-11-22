private ["_scope", "_units", "_groups", "_vehicles"];

//enter loop
while {true} do {
        //populate variables
        _scope = player getVariable ["ATHENA_SCOPE", 1];
        _units = player getVariable ["ATHENA_SCOPE_UNITS", []];
        _groups = [];
        _vehicles = [];

        //check scope
        if(_scope != 64) then { _units = [] };

        //collect units based on scope
        switch (_scope) do {
                case 1:  { _units pushBack player };
                case 2:  { _units = units player };
                case 4:  { { if((side _x) == (side player)) then { _units pushBack _x; } } forEach allUnits; };
                case 8:  { { if((side _x) == (side player)) then { _units pushBack leader _x; } } forEach allGroups; };
                case 16: { { _units pushBack _x; } forEach allUnits; };
                case 32: { { _units pushBack leader _x; } forEach allGroups; };
                //case 64: { }; //the variable ATHENA_SCOPE_UNITS should already be populated
        };

        //check scope again to see if it contains the player
        _units pushBackUnique player;

        //update public unit list
        player setVariable ["ATHENA_SCOPE_UNITS", _units, false];

        //iterate through units
        {
                //check if unit group is in groups array and if not, add it
                _groups pushBackUnique (group _x);

                //check if unit is in a vehicle
                if(!(isNull (objectParent _x))) then { _vehicles pushBackUnique (vehicle _x); }
        } forEach _units;

        //collect placed mines so they show on the map
        { _vehicles pushBackUnique _x; } forEach allMines;

        //update public lists
        player setVariable ["ATHENA_SCOPE_GROUPS", _groups, false];
        player setVariable ["ATHENA_SCOPE_VEHICLES", _vehicles, false];

        //wait a tick and do it all over again
        sleep 5;
};
