private ["_index", "_centerX", "_centerY", "_radius", "_types", "_type", "_objs", "_obj", "_posX", "_posY", "_posZ", "_id", "_m", "_mp", "_d", "_p1", "_p1X", "_p1Y", "_p1Z", "_p2", "_p2X", "_p2Y", "_p2Z", "_h", "_l", "_w", "_bp"];

//populate vars from args
_index   = param[0, 0];
_centerX = param[1, 0];
_centerY = param[2, 0];
_radius  = param[3, 0];

//alert user
systemChat format ["Athena: Exporting structures within %1 meters of XY:[%2,%3]", _radius, _centerX, _centerY];

//structure types to collect
_types = ["building", "bunker", "busstop", "chapel", "church", "cross", "fence", "fortress", "fountain", "fuelstation", "hospital", "house", "lighthouse", "power lines", "powersolar", "powerwave", "powerwind", "quay", "ruin", "stack", "tourism", "transmitter", "view-tower", "wall", "watertower"];

//iterate through types
{
        _type = _x;
        _objs = nearestTerrainObjects[[_centerX, _centerY], [_x], _radius, false, true];

        if(count _objs <= 0) then { continue; };

        {
                _obj = _x;
                _id = getObjectId _x;

                (getModelInfo _x) params ["_m", "_mp"];
                (getPosWorld _x) params ["_posX", "_posY", "_posZ"];
                _d = getDir _x;

                (0 boundingBoxReal _x) params ["_p1", "_p2"];
                _p1 params ["_p1X", "_p1Y", "_p1Z"];
                _p2 params ["_p2X", "_p2Y", "_p2Z"];

                _w = (abs _p1X) + (abs _p2X);
                _l = (abs _p1Y) + (abs _p2Y);
                _h = (abs _p1Z) + (abs _p2Z);

                _bp = [];
                { _bp pushBack (_obj worldToModel _x); } forEach ([_x] call BIS_fnc_buildingPositions);

                "AthenaServer" callExtension ["put",
                        [
                        "structure",
                        _index,
                        _id,
                        _m,
                        _mp,
                        _type,
                        _posX,
                        _posY,
                        _posZ,
                        _d,
                        _w,
                        _l,
                        _h,
                        _bp
                        ]
                ];
        } forEach _objs;
} forEach _types;

"AthenaServer" callExtension ["put", ["structuresComplete", _index]];
