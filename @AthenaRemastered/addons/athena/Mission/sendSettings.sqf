// Athena Remastered — Send server admin settings to the backend.
// Reads mission parameters (description.ext Params) set by the server admin in mission lobby.
//
// Mission makers: add these params to your description.ext:
//
// class Params {
//     class ATH_showEast {
//         title = "Athena: Show EAST (OPFOR)";
//         values[] = {0, 1};
//         texts[] = {"Disabled", "Enabled"};
//         default = 0;
//     };
//     class ATH_showGuer {
//         title = "Athena: Show GUER (INDFOR)";
//         values[] = {0, 1};
//         texts[] = {"Disabled", "Enabled"};
//         default = 0;
//     };
//     class ATH_showCiv {
//         title = "Athena: Show CIV (Civilians)";
//         values[] = {0, 1};
//         texts[] = {"Disabled", "Enabled"};
//         default = 0;
//     };
// };

private ["_showEast", "_showGuer", "_showCiv"];

// Read mission parameters — default to 1 (enabled/show) if not defined by the mission
_showEast = 1;
_showGuer = 1;
_showCiv  = 1;

// Override from mission params only if the param class is defined in description.ext
if (isClass (missionConfigFile >> "Params" >> "ATH_showEast")) then { _showEast = "ATH_showEast" call BIS_fnc_getParamValue; };
if (isClass (missionConfigFile >> "Params" >> "ATH_showGuer")) then { _showGuer = "ATH_showGuer" call BIS_fnc_getParamValue; };
if (isClass (missionConfigFile >> "Params" >> "ATH_showCiv"))  then { _showCiv  = "ATH_showCiv"  call BIS_fnc_getParamValue; };

// Send to backend via DLL
"AthenaServer" callExtension ["put", [
    "settings",
    str (_showEast > 0),
    str (_showGuer > 0),
    str (_showCiv > 0)
]];
