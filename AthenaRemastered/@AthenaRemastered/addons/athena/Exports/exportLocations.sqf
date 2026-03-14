private ["_types", "_class", "_font", "_name", "_size", "_sizeText", "_style", "_texture", "_textureArray"];

//alert user
systemChat "Athena: Exporting locations";

//populate vars
_types = ((configFile >> "cfgLocationTypes") call BIS_fnc_getCfgSubClasses);

//iterate through types
{
        _class = _x;
        _font = ((configFile >> "cfgLocationTypes" >> _x >> "font") call BIS_fnc_getCfgData);
        _name = ((configFile >> "cfgLocationTypes" >> _x >> "name") call BIS_fnc_getCfgData);
        _size = ((configFile >> "cfgLocationTypes" >> _x >> "size") call BIS_fnc_getCfgData);
        _sizeText = ((configFile >> "cfgLocationTypes" >> _x >> "textSize") call BIS_fnc_getCfgData);
        _style = ((configFile >> "cfgLocationTypes" >> _x >> "drawStyle") call BIS_fnc_getCfgData);
        _texture = ((configFile >> "cfgLocationTypes" >> _x >> "texture") call BIS_fnc_getCfgData);

        //check for nils
        if (isNil "_font")     then { _font = ""; };
        if (isNil "_name")     then { _name = ""; };
        if (isNil "_size")     then { _size = 0; };
        if (isNil "_style")    then { _style = ""; };
        if (isNil "_texture")  then { _texture = ""; };

        //shorten texture path to filename without extension
        if (_texture != "") then {
                _textureArray = _texture splitString "\";
                reverse _textureArray;
                _texture = _textureArray select 0;
                _texture = (_texture splitString ".") select 0;
        };

        //push info
        "AthenaServer" callExtension ["put",
                [
                "locationClass",
                _class,
                _font,
                _name,
                _size,
                _sizeText,
                _style,
                _texture
                ]
        ];
} forEach _types;

//notify extension that process has completed
"AthenaServer" callExtension ["put", ["locationClassesComplete"]];

//Notify the user that we're finished
systemChat "Athena: Locations export complete";
