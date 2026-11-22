private ["_clients", "_frameID", "_frameTime", "_frameUpdates"];

//It all starts with units
//1. Collect units to track by checking scope
//              Running separately and populated ATHENA_SCOPE_UNITS player variable
//2. Collect groups those units belong to
//3. Collect vehicles those units occupy

// Live position updates, throttled to a fixed rate.
// Every update makes one blocking callExtension (an HTTP request to the local
// server) per tracked unit and vehicle, on Arma's main thread. Before 1.2.1 this
// ran on EVERY frame: at 60 FPS with 50 units that is ~3000 blocking calls per
// second, a big FPS cost (community report on the Workshop, 2026-11-22). Bus's
// original Athena relay polled 4 times per second, which is plenty for a map.
// Mission makers can override the interval (seconds) with
//   missionNamespace setVariable ["ATHENA_UPDATE_INTERVAL", 0.5];
ATH_nextUpdateTick = 0;

//Create the EachFrame handler (cheap check every frame, real work at most ~4x per second)
_eachFrameID = addMissionEventHandler ["EachFrame",{
        // Throttle: leave until the next update is due. exitWith at the top level
        // of the handler code leaves the whole handler for this frame.
        if (diag_tickTime < ATH_nextUpdateTick) exitWith {};
        ATH_nextUpdateTick = diag_tickTime + (missionNamespace getVariable ["ATHENA_UPDATE_INTERVAL", 0.25]);

        //send current time
        [] call ATH_fnc_MissionTime;

        //send updates
        [] call ATH_fnc_MissionUpdates;

        //push update end message (triggers backend to package data received since last update as a 'frame')
        "AthenaServer" callExtension ["put", ["updateend"]];
}];

//enter loop
while { true } do {
        //collect groups
        [] call ATH_fnc_MissionGroups;

        //collect units
        [] call ATH_fnc_MissionUnits;

        //collect vehicles
        [] call ATH_fnc_MissionVehicles;

        //sleep
        sleep 1;
};
