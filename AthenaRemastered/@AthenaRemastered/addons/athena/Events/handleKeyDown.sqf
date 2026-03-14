//Populate passed vars
params ["_ctrl", "_dikCode", "_shiftKey", "_ctrlKey", "_altKey", "_action", "_continue"];

//Preset the values
_action = 0;
_continue = true;

//Check the input actions (User0–User20)
for [{private _i=0}, {_i<21 && _continue}, {_i=_i+1}] do {
        if(inputAction format["User%1", _i] == 1) then { _action = _i; _continue = false; };
};

//Allow continued listening
false;
