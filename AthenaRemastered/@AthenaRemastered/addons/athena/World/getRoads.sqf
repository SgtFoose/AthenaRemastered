private ["_index", "_centerX", "_centerY", "_radius", "_type", "_objs", "_obj", "_id", "_d", "_w", "_l", "_h", "_foot", "_texture", "_textureEnd", "_mat", "_begPos", "_endPos", "_bridge", "_connections", "_pos1X", "_pos1Y", "_pos1Z", "_pos2X", "_pos2Y", "_pos2Z"];

//populate vars from args
_index   = param[0,0];
_centerX = param[1,0];
_centerY = param[2,0];
_radius  = param[3,0];

//alert user
systemChat format ["Athena: Exporting road segments within %1 meters of XY:[%2,%3]", _radius, _centerX, _centerY];

//get objects in range
_objs = [_centerX, _centerY] nearRoads _radius;

//iterate through objects
{
        _obj = _x;
        _id = getObjectId _x;

        (getRoadInfo _x) params ["_type", "_w", "_foot", "_texture", "_textureEnd", "_mat", "_begPos", "_endPos", "_bridge"];
        (getPosASL _x) params ["_posX", "_posY", "_posZ"];
        (_begPos) params ["_pos1X", "_pos1Y", "_pos1Z"];
        (_endPos) params ["_pos2X", "_pos2Y", "_pos2Z"];

        _connections = [];

        if(_type == "hide") then {
                //treat this more like an object (probably a runway)
                _d = getDir _x;
                (boundingBoxReal _x) params ["_p1", "_p2"];
                _p1 params ["_p1X", "_p1Y", "_p1Z"];
                _p2 params ["_p2X", "_p2Y", "_p2Z"];
                _w = (abs _p1X) + (abs _p2X);
                _l = (abs _p1Y) + (abs _p2Y);
                _h = (abs _p1Z) + (abs _p2Z);

                "AthenaServer" callExtension ["put",
                        [
                                "road",
                                _index,
                                _id,
                                _type,
                                _foot,
                                _bridge,
                                _connections,
                                _posX,
                                _posY,
                                _posZ,
                                _pos1X,
                                _pos1Y,
                                _pos1Z,
                                _pos2X,
                                _pos2Y,
                                _pos2Z,
                                _d,
                                _l,
                                _w
                        ]
                ];
                continue;
        };

        //populate connections
        {
                _connections pushBackUnique (getObjectId _x);
        } forEach (roadsConnectedTo [_x, true]);

        "AthenaServer" callExtension ["put",
                [
                        "road",
                        _index,
                        _id,
                        _type,
                        _foot,
                        _bridge,
                        _connections,
                        _posX,
                        _posY,
                        _posZ,
                        _pos1X,
                        _pos1Y,
                        _pos1Z,
                        _pos2X,
                        _pos2Y,
                        _pos2Z,
                        0,
                        0,
                        0
                ]
        ];
} forEach _objs;

"AthenaServer" callExtension ["put", ["roadsComplete", _index]];

ATHENA_ROADS_DONE = true;
systemChat format ["Athena: Roads exported (%1 segments).", count _objs];
if (ATHENA_ROADS_DONE && ATHENA_FORESTS_DONE && ATHENA_LOCS_DONE) then {
	hint parseText "<t size='1.2' color='#00FF80'>Athena Remastered</t><br/>Map is ready!";
	systemChat "Athena: Map render complete - Athena Remastered is ready!";
};
