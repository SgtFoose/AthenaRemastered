private ["_markers", "_markersF"];
private ["_brush", "_color", "_shape", "_type", "_text", "_alpha", "_dir", "_posx", "_posy", "_posz", "_sizex", "_sizey"];

//Vars
_markers  = [];
_markersF = [];

//Iterate through all known map markers
{
        _brush = markerbrush _x;
        _color = markercolor _x;
        _shape = markershape _x;
        _type = markertype _x;
        _text = markertext _x;
        _alpha = markeralpha _x;
        _dir = markerdir _x;
        (getMarkerPos _x) params ["_posx", "_posy", "_posz"];
        (getMarkerSize _x) params ["_sizex", "_sizey"];

        if(toLower(_text) find "str_" != -1) then {
                _text = localize _text;
        };

        _markers pushBack _x;
        _markersF pushBack (format ['{"brush":"%1","color":"%2","shape":"%3","type":"%4","name":"%5","text":"%6","alpha":"%7","dir":"%8","posx":"%9","posy":"%10","posz":"%11","sizex":"%12","sizey":"%13"}',
                _brush, _color, _shape, _type, _x, _text, _alpha, _dir, _posx, _posy, _posz, _sizex, _sizey]);
} forEach allMapMarkers;

[_markers, _markersF];
