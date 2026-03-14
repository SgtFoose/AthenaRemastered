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

// Read mission parameters — defaults to 0 (disabled) if not defined
_showEast = "ATH_showEast" call BIS_fnc_getParamValue;
_showGuer = "ATH_showGuer" call BIS_fnc_getParamValue;
_showCiv  = "ATH_showCiv"  call BIS_fnc_getParamValue;

// Fallback to 0 if param is not defined
if (isNil "_showEast") then { _showEast = 0; };
if (isNil "_showGuer") then { _showGuer = 0; };
if (isNil "_showCiv")  then { _showCiv  = 0; };

// Send to backend via DLL
"AthenaServer" callExtension ["put", [
    "settings",
    str (_showEast > 0),
    str (_showGuer > 0),
    str (_showCiv > 0)
]];
