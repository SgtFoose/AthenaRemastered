private ["_name", "_function", "_data"];

diag_log "Athena Init: script started";

//check for dedicated server
if (!hasInterface) exitWith { diag_log "Athena Init: no interface, exiting"; };

//Only run in a real mission. This script is a postInit function, so Arma also
//runs it in the Eden editor and in the main menu's background scene. There it
//connected to the backend and triggered a full world export of the editor or
//menu world (seen live on Stratis in Eden and on Malden in the main menu,
//2026-11-22), which stalled the game and showed a map although no mission
//was being played.
//Diagnostics for verifying the checks in the RPT: is3DEN, the main menu
//display (IDD 0) and the mission display (IDD 46).
diag_log format ["Athena Init: context is3DEN=%1 mainMenu=%2 missionDisplay=%3 missionName=%4",
	is3DEN, !isNull (findDisplay 0), !isNull (findDisplay 46), missionName];
//Eden editor: editing, not playing (an editor preview does play the mission, and is3DEN is false there).
if (is3DEN) exitWith { diag_log "Athena Init: Eden editor, not starting"; };
//Main menu background scene vs. a real mission: wait for the mission display
//(RscDisplayMission, IDD 46), which only exists while a mission is being played
//(singleplayer, editor preview, multiplayer client). The main menu's background
//scene never gets it, so there this script just waits harmlessly until the scene
//ends.
//v1.2.0 instead exited when the main menu display (IDD 0) was open. That display
//is still open while a real mission initialises (postInit runs before IDD 46
//exists), so Athena never started in any mission (RPT, Malden, 2026-11-22:
//"context is3DEN=false mainMenu=true missionDisplay=false missionName=Editor...").
if (isNull (findDisplay 46)) then { diag_log "Athena Init: waiting for the mission display (IDD 46)"; };
waitUntil { sleep 0.5; !isNull (findDisplay 46) };
//Safety net in case a background scene does create IDD 46: the menu scenes are
//named like "introExp" / "Malden_intro" and run with the main menu display open.
if (!isNull (findDisplay 0) && {((toLower missionName) find "intro") >= 0}) exitWith {
	diag_log format ["Athena Init: main menu background scene (%1), not starting", missionName];
};
diag_log format ["Athena Init: mission display found, starting (mainMenu=%1 missionName=%2)", !isNull (findDisplay 0), missionName];

//check for player
diag_log "Athena Init: waiting for player...";
waitUntil {!isNull player};
diag_log "Athena Init: player found";

//we maintain a list of available scopes
//1 - Player
//2 - Units in Player Group (including player)
//4 - Units on Player Side (including player)
//8 - Player + Group Leaders on Player Side
//16 - All Units (including player)
//32 - Player + Group Leaders on All Sides
//64 - Specific Units (No automated collection of units, manually supplied by mission editor/scripters)

//set scope variables
player setVariable ["ATHENA_SCOPES", 63, true]; //this is the sum of the scopes you want to be available to the player
player setVariable ["ATHENA_SCOPE", 16, true]; //this is the selected scope
player setVariable ["ATHENA_SCOPE_UNITS", [], false];
player setVariable ["ATHENA_SCOPE_GROUPS", [], false];
player setVariable ["ATHENA_SCOPE_VEHICLES", [], false];

//set whether or not the player is athena 'enabled'
player setVariable ["ATHENA_ENABLED", true, true];

//sleep
sleep 1;

//wait for the Athena backend server to be reachable before starting any data flow.
//Without this, callExtension HTTP calls block/timeout and freeze Arma's scheduler.
private _serverReady = false;
private _attempts = 0;
diag_log "Athena Init: starting handshake loop";
while {!_serverReady} do {
	_attempts = _attempts + 1;
	//Use ping here so we do not consume backend request-queue items before monitorRequests starts.
	private _response = "AthenaServer" callExtension ["ping", []];
	diag_log format ["Athena Init: handshake attempt=%1 pingResponse=%2", _attempts, _response];
	private _rc = _response param [1, -999];
	private _pingOk = ((_rc == 0) || {str _rc == "0"}) && {(_response param [0, ""]) != ""};

	//If ping is unavailable (older DLL), fall back to a lightweight PUT probe.
	//This checks backend reachability without consuming request-queue items.
	if (!_pingOk) then {
		private _probe = "AthenaServer" callExtension ["put", ["healthcheck"]];
		private _prc = _probe param [1, -999];
		private _probeOk = (_prc == 0) || {str _prc == "0"};
		diag_log format ["Athena Init: handshake fallback probe response=%1", _probe];
		if (_probeOk) then {
			_serverReady = true;
			diag_log "Athena Init: handshake succeeded via fallback probe";
		};
	};

	if (_pingOk) then {
		_serverReady = true;
		diag_log "Athena Init: handshake succeeded";
	} else {
		if (_attempts == 5) then {
			systemChat "Athena: Extension handshake still failing. If BattlEye is enabled, it may be blocking AthenaServer_x64.dll.";
			hint parseText "<t size='1.1' color='#FF8800'>Athena Remastered</t><br/>Extension handshake failed.<br/>If BattlEye is enabled, it may be blocking AthenaServer_x64.dll.<br/>Check Arma RPT for: BattlEye: Blocked loading of file ...\\AthenaServer_x64.dll";
		};
		if (_attempts == 1) then {
			systemChat "Athena: Waiting for backend server (http://localhost:5000)...";
			hint parseText "<t size='1.1' color='#FF8800'>Athena Remastered</t><br/>Waiting for backend server...<br/>Start the server and it will connect automatically.";
		};
		if (_attempts mod 10 == 0) then {
			systemChat format ["Athena: Still waiting for backend server... (attempt %1)", _attempts];
		};
		sleep 2;
	};
};

systemChat "Athena: Backend server connected!";
hint parseText "<t size='1.1' color='#00FF80'>Athena Remastered</t><br/>Backend server connected!";
sleep 1;

diag_log "Athena Init: calling ATH_fnc_Mission";
//start athena extension process
[] call ATH_fnc_Mission;

diag_log "Athena Init: calling ATH_fnc_SendSettings";
//send server admin settings to backend
[] call ATH_fnc_SendSettings;

diag_log "Athena Init: spawning monitor scripts";
//start routines
[] execVM "\athena\monitorScope.sqf";
[] execVM "\athena\monitorRequests.sqf";
[] execVM "\athena\monitorArma.sqf";
[] execVM "\athena\loopEvents.sqf";

diag_log "Athena Init: all scripts launched";
