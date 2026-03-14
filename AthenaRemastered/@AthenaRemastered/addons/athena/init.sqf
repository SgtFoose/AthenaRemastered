private ["_name", "_function", "_data"];

//check for dedicated server
if (!hasInterface) exitWith {};

//check for player
waitUntil {!isNull player};

//we maintain a list of available scopes
//1 - Player
//2 - Units in Player Group (including player)
//4 - Units on Player Side (including player)
//8 - Player + Group Leaders on Player Side
//16 - All Units (including player)
//32 - Player + Group Leaders on All Sides
//64 - Specific Units (No automated collection of units, manually supplied by mission editor/scripters)

//set scope variables
player setVariable ["ATHENA_SCOPES", 15, true]; //this is the sum of the scopes you want to be available to the player
player setVariable ["ATHENA_SCOPE", 4, true]; //this is the selected scope
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
while {!_serverReady} do {
	_attempts = _attempts + 1;
	private _response = "AthenaServer" callExtension ["get", ["request"]];
	//callExtension returns ["content", returnCode, callCode]
	//returnCode 0 = success; non-zero or exception = server not reachable
	if ((_response select 1) == 0) then {
		_serverReady = true;
	} else {
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

//start athena extension process
[] call ATH_fnc_Mission;

//send server admin settings to backend
[] call ATH_fnc_SendSettings;

//start routines
[] execVM "\athena\monitorScope.sqf";
[] execVM "\athena\monitorRequests.sqf";
[] execVM "\athena\monitorArma.sqf";
[] execVM "\athena\loopEvents.sqf";
