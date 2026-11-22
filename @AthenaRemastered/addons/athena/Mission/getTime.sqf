//setup private vars
private ["_year", "_month", "_day", "_hour", "_minute"];

//break out date
date params ["_year", "_month", "_day", "_hour", "_minute"];

//push time
"AthenaServer" callExtension ["put",
        [
        "time",
        _year,
        _month,
        _day,
        _hour,
        _minute]];
