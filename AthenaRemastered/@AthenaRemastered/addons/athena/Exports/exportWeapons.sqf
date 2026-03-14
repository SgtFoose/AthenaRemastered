private ["_types", "_class", "_author", "_base", "_description", "_name", "_type"];

//Tell user we're exporting
systemChat "Athena: Exporting weapons";

//Retrieve weapons (type 1=rifle, 2=handgun, 4=launcher)
_types = "(getNumber (_x >> 'type') in [1,2,4])" configClasses (configFile >> "CfgWeapons");

{
        _class       = configName _x;
        _author      = (_x >> "author") call BIS_fnc_getCfgData;
        _base        = (_x >> "baseWeapon") call BIS_fnc_getCfgData;
        _description = (_x >> "descriptionShort") call BIS_fnc_getCfgData;
        _name        = (_x >> "displayName") call BIS_fnc_getCfgData;
        _type        = (_x >> "type") call BIS_fnc_getCfgData;

        if (isNil "_author")      then { _author = ""; };
        if (isNil "_base")        then { _base = ""; };
        if (isNil "_description") then { _description = ""; };
        if (isNil "_name")        then { _name = ""; };
        if (isNil "_type")        then { _type = ""; };

        "AthenaServer" callExtension ["put",
                [
                "weaponClass",
                _class,
                _author,
                _base,
                _description,
                _name,
                _type
                ]
        ];
} forEach _types;

//notify extension that process has completed
"AthenaServer" callExtension ["put", ["weaponClassesComplete"]];

systemChat "Athena: Weapons export complete";
