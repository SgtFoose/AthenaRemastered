private ["_index", "_startX", "_startY", "_stopX", "_stopY", "_sizeSample", "_x", "_y", "_z"];

//populate vars from args
_index      = param [0, 0];
_startX     = param [1, 0];
_startY     = param [2, 0];
_stopX      = param [3, 0];
_stopY      = param [4, 0];
_sizeSample = param [5, 0];

//alert user
systemChat format ["Athena: Sampling terrain height within XY1:[%1,%3] XY2:[%2,%4] every %5 meters", _startX, _stopX, _startY, _stopY, _sizeSample];

for "_y" from _startY to _stopY do {
  if(_y mod _sizeSample == 0 || _y == _stopY) then {
    for "_x" from _startX to _stopX do {
          if(_x mod _sizeSample == 0 || _x == _stopX) then {
            _z = getTerrainHeightASL[_x,_y];
            "AthenaServer" callExtension ["put", ["elevation", _index, _x, _y, _z]];
          };
    };
  };
};

"AthenaServer" callExtension ["put", ["elevationsComplete", _index]];
