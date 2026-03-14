private ["_clients", "_frameID", "_frameTime", "_frameUpdates"];

//It all starts with units
//1. Collect units to track by checking scope
//              Running separately and populated ATHENA_SCOPE_UNITS player variable
//2. Collect groups those units belong to
//3. Collect vehicles those units occupy

//Create the EachFrame handler
_eachFrameID = addMissionEventHandler ["EachFrame",{
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
