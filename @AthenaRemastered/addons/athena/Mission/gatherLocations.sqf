private ["_locs", "_locsOut", "_locsArr", "_loc", "_found", "_type", "_text", "_width", "_length", "_posx", "_posy", "_posz", "_athid"];

_locs = nearestLocations [[0,0,0], ["NameCityCapital","NameMarine","NameLocal","NameVillage","NameCity","Hill"], (worldSize * 2)];
_locsOut = [];
_locsArr = [];

if(!isNil "_locs") then {
        {
                _loc = _x;
                _found = false;

                if(!isNil "ATH_LocationsWorld") then {
                        {
                                if ((_x >> "name") call BIS_fnc_getCfgData == (text _loc)) then {
                                        _found = true;
                                };
                        } forEach ATH_LocationsWorld;
                };

                if(!_found) then {
                        _locsOut pushBack _loc;
                };
        } forEach _locs;
};

if(count _locsOut > 0) then {
        {
                _type = type _x;
                _text = text _x;

                (size _x) params ["_width", "_length"];

                (locationPosition _x) params ["_posx", "_posy", "_posz"];

                _athid = _x getVariable "athid";
                if(isNil("_athid")) then {
                        _athid = str(round(_posx)) + str(round(_posy)) + str(round(_posz)) + str(random 1000);
                        _x setVariable ["athid", _athid];
                };

                _locsArr pushBack [_type, _text, _width, _length, _posx, _posy, _posz, _athid];
        } forEach _locsOut;
};

_locsArr;
