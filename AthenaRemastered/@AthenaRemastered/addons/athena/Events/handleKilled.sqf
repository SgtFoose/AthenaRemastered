params ["_victim", "_killer", "_instigator"];

private ["_nameVictim", "_nameKiller", "_nameInstigator"];

_nameVictim    = "";
_nameKiller    = "";
_nameInstigator = "";

if(!(isNil "_victim")    && {_victim    isKindOf "man"}) then { _nameVictim    = name _victim };
if(!(isNil "_killer")    && {_killer    isKindOf "man"}) then { _nameKiller    = name _killer };
if(!(isNil "_instigator")&& {_instigator isKindOf "man"}) then { _nameInstigator = name _instigator };

//push killed event to backend
"AthenaServer" callExtension ["put", ["killed", _nameVictim, _nameKiller, _nameInstigator]];
