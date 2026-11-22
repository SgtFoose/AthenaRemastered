// Export every tree on the map in batched callExtension calls for performance.
// Instead of one HTTP call per tree (~500k calls), we collect positions into
// semicolon-delimited strings and send batches of up to 500 trees at once.

private ["_index", "_tileSize", "_tileRadius", "_maxX", "_maxY",
         "_tileCount", "_totalCount", "_batch", "_batchCount",
         "_tileCenter", "_tileEndX", "_tileEndY", "_tileObjs"];

_index = param [0, 0];

_tileSize   = 1000;
_tileRadius = sqrt 2 * (_tileSize / 2);
_maxX       = worldSize;
_maxY       = worldSize;
_tileCount  = 0;
_totalCount = 0;
_batch      = "";
_batchCount = 0;

private _BATCH_SIZE = 500;

systemChat format ["Athena: Exporting trees in %1m tiles across world size %2", _tileSize, worldSize];
diag_log format ["Athena Trees: start worldSize=%1 tileSize=%2", worldSize, _tileSize];

for "_tileStartY" from 0 to (_maxY - 1) step _tileSize do {
    for "_tileStartX" from 0 to (_maxX - 1) step _tileSize do {
        _tileEndX = (_tileStartX + _tileSize) min _maxX;
        _tileEndY = (_tileStartY + _tileSize) min _maxY;
        _tileCenter = [_tileStartX + (_tileSize / 2), _tileStartY + (_tileSize / 2), 0];

        _tileObjs = nearestTerrainObjects [_tileCenter, ["TREE", "SMALL TREE", "BUSH"], _tileRadius, false, true];

        {
            private _treeObj = _x;
            (getPosWorld _treeObj) params ["_posX", "_posY"];

            // Skip trees outside this tile (overlap from circular search radius)
            if !(_posX < _tileStartX || {_posY < _tileStartY} || {_posX >= _tileEndX} || {_posY >= _tileEndY}) then {
                // Append "x,y;" to current batch string
                _batch = _batch + (str _posX) + "," + (str _posY) + ";";
                _batchCount = _batchCount + 1;
                _totalCount = _totalCount + 1;

                if (_batchCount >= _BATCH_SIZE) then {
                    "AthenaServer" callExtension ["put", ["treeBatch", _index, _batch]];
                    _batch = "";
                    _batchCount = 0;
                };
            };
        } forEach _tileObjs;

        _tileCount = _tileCount + 1;

        // Yield every few tiles so the game stays responsive
        if (_tileCount % 10 == 0) then {
            sleep 0;
            systemChat format ["Athena: Trees — %1 found (%2 tiles scanned)", _totalCount, _tileCount];
        };
    };
};

// Flush remaining batch
if (_batchCount > 0) then {
    "AthenaServer" callExtension ["put", ["treeBatch", _index, _batch]];
};

"AthenaServer" callExtension ["put", ["treesComplete", _index]];
diag_log format ["Athena Trees: export complete — %1 trees across %2 tiles", _totalCount, _tileCount];

ATHENA_TREES_DONE = true;
systemChat format ["Athena: Trees exported — %1 trees across %2 tiles.", _totalCount, _tileCount];
