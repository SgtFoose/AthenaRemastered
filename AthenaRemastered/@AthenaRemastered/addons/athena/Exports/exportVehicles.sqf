private ["_categorys", "_classes", "_author", "_class", "_category", "_categoryDisplay", "_displayName", "_mapSize"];

//alert user
systemChat "Athena: Exporting vehicles";

//categories to export are passed as _this
_categorys = _this;

//iterate through categories
{
        _category = _x;
        _categoryDisplay = (_category splitString "_") select 1;

        //Retrieve vehicles in this editor sub-category
        _classes = "(getText (_x >> 'editorSubcategory') == _category)" configClasses (configFile >> "CfgVehicles");

        {
                _class       = configName _x;
                _author      = (_x >> "author") call BIS_fnc_getCfgData;
                _displayName = (_x >> "displayName") call BIS_fnc_getCfgData;
                _mapSize     = (_x >> "mapSize") call BIS_fnc_getCfgData;

                if (isNil "_author")      then { _author = ""; };
                if (isNil "_displayName") then { _displayName = ""; };
                if (isNil "_mapSize")     then { _mapSize = 0; };

                "AthenaServer" callExtension ["put",
                        [
                        "vehicleClass",
                        _class,
                        _author,
                        _categoryDisplay,
                        _displayName,
                        _mapSize
                        ]
                ];
        } forEach _classes;
} forEach _categorys;

//notify extension that process has completed
"AthenaServer" callExtension ["put", ["vehicleClassesComplete"]];

systemChat "Athena: Vehicle export complete";
