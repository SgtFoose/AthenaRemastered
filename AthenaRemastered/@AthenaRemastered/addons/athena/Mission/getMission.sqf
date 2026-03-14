private ["_name", "_desc", "_author", "_world", "_player", "_steamID", "_isMulti"];

//initialize map render completion tracking
ATHENA_ROADS_DONE    = false;
ATHENA_FORESTS_DONE  = false;
ATHENA_LOCS_DONE     = false;

systemChat "Athena Remastered: Connected. Requesting map data...";

//mission
_name = getText (missionConfigFile >> "OnLoadName");
_author = getText (missionConfigFile >> "Author");
_world = worldName;
_desc = getText (missionConfigFile >> "OnLoadMission");

//player
_player = profileName;
_steamID = getPlayerUID player;

//state
_isMulti = isMultiplayer;

//push mission
"AthenaServer" callExtension ["put", ["mission", _name, _author, _world, _desc, _isMulti, _player, _steamID]];
