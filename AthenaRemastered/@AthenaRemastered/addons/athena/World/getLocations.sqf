private ["_objs", "_obj", "_types", "_notypes", "_class", "_rectangular", "_text", "_w", "_l", "_d", "_x", "_y"];

//alert user
systemChat "Athena: Exporting locations.";

//populate vars
_types = ((configFile >> "cfgLocationTypes") call BIS_fnc_getCfgSubClasses);

//populate blacklist
_notypes = ["Mount", "Invisible"];

//iterate through types
{
        //check notype
        if(_x in _notypes) then { continue; };

        //create ref to type
        _class = _x;

        //get objects in range
        _objs = nearestLocations [[0,0,0], [_x], (worldSize * 2)];

        //check objects array
        if(count _objs == 0) then { continue; };

        //iterate through objects
        {
                _obj = _x;
                _d = direction _x;
                _rectangular = rectangular _x;
                _text = text _x;
                (size _x) params ["_w", "_l"];
                (locationPosition _x) params ["_x", "_y", "_z"];

                //push location info
                "AthenaServer" callExtension ["put",
                        [
                        "location",
                        _class,
                        _rectangular,
                        _text,
                        _w,
                        _l,
                        _d,
                        _x,
                        _y
                        ]
                ];
        } forEach _objs;
} forEach _types;

//notify extension of completion
"AthenaServer" callExtension ["put", ["locationsComplete"]];

ATHENA_LOCS_DONE = true;
systemChat "Athena: Locations exported.";
if (ATHENA_ROADS_DONE && ATHENA_FORESTS_DONE && ATHENA_LOCS_DONE) then {
	hint parseText "<t size='1.2' color='#00FF80'>Athena Remastered</t><br/>Map is ready!";
	systemChat "Athena: Map render complete - Athena Remastered is ready!";
};
