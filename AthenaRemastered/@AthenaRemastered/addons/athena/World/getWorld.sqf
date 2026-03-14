private ["_nameDisplay", "_nameWorld", "_author", "_sizeWorld", "_forestMin", "_offsetX", "_offsetY", "_zoom1Format", "_zoom1FormatLength", "_zoom1StepX", "_zoom1StepY", "_zoom1ZoomMax", "_zoom2Format", "_zoom2FormatLength", "_zoom2StepX", "_zoom2StepY", "_zoom2ZoomMax", "_zoom3Format", "_zoom3FormatLength", "_zoom3StepX", "_zoom3StepY", "_zoom3ZoomMax", "_centerX", "_centerY"];

//reset render tracking flags (new world export starting)
ATHENA_ROADS_DONE   = false;
ATHENA_FORESTS_DONE = false;
ATHENA_LOCS_DONE    = false;

//alert user with prominent in-game hint
hint parseText format ["<t size='1.2' color='#FFC200'>Athena Remastered</t><br/>Rendering map for: <t color='#FFFFFF'>%1</t><br/><t size='0.8' color='#AAAAAA'>This may take a few minutes...</t>", worldName];
systemChat format ["Athena: Rendering map geometry for '%1'", worldName];

//get world properties
_nameDisplay = ((configFile >> "cfgWorlds" >> worldName >> "description") call BIS_fnc_getCfgData);
_nameWorld = worldName;
_author = ((configFile >> "cfgWorlds" >> worldName >> "author") call BIS_fnc_getCfgData);
_sizeWorld = worldSize;
_forestMin = ((configFile >> "cfgWorlds" >> worldName >> "minTreesInForestSquare") call BIS_fnc_getCfgData);
_offsetX = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "OffsetX") call BIS_fnc_getCfgData);
_offsetY = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "OffsetY") call BIS_fnc_getCfgData);
_zoom1Format = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom1" >> "format") call BIS_fnc_getCfgData);
_zoom1FormatLength = count((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom1" >> "formatX") call BIS_fnc_getCfgData);
_zoom1StepX = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom1" >> "stepx") call BIS_fnc_getCfgData);
_zoom1StepY = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom1" >> "stepy") call BIS_fnc_getCfgData);
_zoom1ZoomMax = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom1" >> "zoomMax") call BIS_fnc_getCfgData);
_zoom2Format = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom2" >> "format") call BIS_fnc_getCfgData);
_zoom2FormatLength = count((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom2" >> "formatX") call BIS_fnc_getCfgData);
_zoom2StepX = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom2" >> "stepx") call BIS_fnc_getCfgData);
_zoom2StepY = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom2" >> "stepy") call BIS_fnc_getCfgData);
_zoom2ZoomMax = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom2" >> "zoomMax") call BIS_fnc_getCfgData);
_zoom3Format = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom3" >> "format") call BIS_fnc_getCfgData);
_zoom3FormatLength = count((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom3" >> "formatX") call BIS_fnc_getCfgData);
_zoom3StepX = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom3" >> "stepx") call BIS_fnc_getCfgData);
_zoom3StepY = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom3" >> "stepy") call BIS_fnc_getCfgData);
_zoom3ZoomMax = ((configFile >> "cfgWorlds" >> worldName >> "Grid" >> "Zoom3" >> "zoomMax") call BIS_fnc_getCfgData);
_centerX = ((configFile >> "cfgWorlds" >> worldName >> "centerPosition") call BIS_fnc_getCfgData) select 0;
_centerY = ((configFile >> "cfgWorlds" >> worldName >> "centerPosition") call BIS_fnc_getCfgData) select 1;

//push map info
"AthenaServer" callExtension ["put",
        [
        "world",
        _nameDisplay,
        _nameWorld,
        _author,
        _sizeWorld,
        _forestMin,
        _offsetX,
        _offsetY,
        _zoom1Format,
        _zoom1FormatLength,
        _zoom1StepX,
        _zoom1StepY,
        _zoom1ZoomMax,
        _zoom2Format,
        _zoom2FormatLength,
        _zoom2StepX,
        _zoom2StepY,
        _zoom2ZoomMax,
        _zoom3Format,
        _zoom3FormatLength,
        _zoom3StepX,
        _zoom3StepY,
        _zoom3ZoomMax,
        _centerX,
        _centerY
        ]
];
