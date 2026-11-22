params ["_victim", "_killer", "_instigator"];

private ["_idVictim", "_idKiller", "_idInstigator"];

_idVictim     = "";
_idKiller     = "";
_idInstigator = "";

if (!(isNil "_victim") && {_victim isKindOf "man"}) then { _idVictim = _victim call BIS_fnc_netID };
if (!(isNil "_killer") && {_killer isKindOf "man"}) then { _idKiller = _killer call BIS_fnc_netID };
if (!(isNil "_instigator") && {_instigator isKindOf "man"}) then { _idInstigator = _instigator call BIS_fnc_netID };

//push killed event to backend
"AthenaServer" callExtension ["put", ["killed", _idVictim, _idKiller, _idInstigator]];
