// Samples terrain height (ASL) on a regular grid inside one export region and
// sends each sample to the server ("elevation"), then "elevationsComplete".
// Runs once per map during a world export (the result is cached by the server).
//
// Args: [index, startX, startY, stopX, stopY, sampleSize (m)]
//
// Before 1.2.1 this looped over EVERY metre in X and Y and only sampled when
// `coordinate mod sampleSize == 0`, i.e. ~164 million iterations on a 12.8 km map
// for a few thousand samples, freezing the game during the export (community
// report on the Workshop, 2026-11-22). The loops now step by sampleSize directly
// and visit exactly the same sample points (multiples of sampleSize, plus the
// stop edge).
private ["_index", "_startX", "_startY", "_stopX", "_stopY", "_sizeSample", "_xs", "_ys", "_z"];

//populate vars from args
_index      = param [0, 0];
_startX     = param [1, 0];
_startY     = param [2, 0];
_stopX      = param [3, 0];
_stopY      = param [4, 0];
_sizeSample = param [5, 0];

// Guard against a zero/negative sample size (the old loop then only sampled the edges).
if (_sizeSample <= 0) then { _sizeSample = 1; };

//alert user
systemChat format ["Athena: Sampling terrain height within XY1:[%1,%3] XY2:[%2,%4] every %5 meters", _startX, _stopX, _startY, _stopY, _sizeSample];

// Sample coordinates along one axis: every multiple of _step in [_from, _to],
// plus _to itself when it is not a multiple (the same points as the old loop).
private _axisSamples = {
        params ["_from", "_to", "_step"];
        private _out = [];
        private _first = _from + ((_step - (_from mod _step)) mod _step);
        for "_v" from _first to _to step _step do { _out pushBack _v; };
        if ((_to mod _step) != 0) then { _out pushBack _to; };
        _out
};

_xs = [_startX, _stopX, _sizeSample] call _axisSamples;
_ys = [_startY, _stopY, _sizeSample] call _axisSamples;

{
        private _y = _x;
        {
                _z = getTerrainHeightASL [_x, _y];
                "AthenaServer" callExtension ["put", ["elevation", _index, _x, _y, _z]];
        } forEach _xs;
} forEach _ys;

"AthenaServer" callExtension ["put", ["elevationsComplete", _index]];
