private ["_index", "_startX", "_startY", "_stopX", "_stopY", "_sizeSample", "_radius", "_minLight", "_minMedium", "_minHeavy", "_center", "_objs", "_count", "_level"];

//populate vars from args
_index     = param[0,0];
_startX    = param[1,0];
_startY    = param[2,0];
_stopX     = param[3,0];
_stopY     = param[4,0];
_sizeSample= param[5,0];
_radius    = param[6,0];
_minLight  = param[7,0];
_minMedium = param[8,0];
_minHeavy  = param[9,0];

//alert user
systemChat format ["Athena: Sampling forestation within XY1:[%1,%3] XY2:[%2,%4] every %5 meters", _startX, _stopX, _startY, _stopY, _sizeSample];

//iterate through y axis
for "_y" from _startY to (_stopY - _sizeSample) step _sizeSample do {
        //iterate through x axis
        for "_x" from _startX to (_stopX - _sizeSample) step _sizeSample do {
                //get a center point
                _center = [_x + (_sizeSample / 2), _y + (_sizeSample / 2)];

                //get objects in range — only proper trees, not small scrub/bushes
                _objs = nearestTerrainObjects[_center, ["tree"], _radius, false, true];

                //get # of objs
                _count = count _objs;

                //set level
                _level = 0;

                //check for light
                if (_count >= _minLight)  then { _level = 1; };
                if (_count >= _minMedium) then { _level = 2; };
                if (_count >= _minHeavy)  then { _level = 3; };

                //push forest info
                "AthenaServer" callExtension ["put",
                        [
                        "forest",
                        _index,
                        _y,
                        _x,
                        _level
                        ]
                ];
        };
};

"AthenaServer" callExtension ["put", ["forestsComplete", _index]];

ATHENA_FORESTS_DONE = true;
systemChat "Athena: Forest survey complete.";
if (ATHENA_ROADS_DONE && ATHENA_FORESTS_DONE && ATHENA_LOCS_DONE) then {
	hint parseText "<t size='1.2' color='#00FF80'>Athena Remastered</t><br/>Map is ready!";
	systemChat "Athena: Map render complete - Athena Remastered is ready!";
};
