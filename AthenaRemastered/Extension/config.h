#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <queue>
#include <mutex>
#include <thread>
#include <atomic>
#include <sstream>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

// ─────────────────────────────────────────────────────────────────────────────
//  Version (bump every release alongside Frontend, Backend, and mod.cpp)
// ─────────────────────────────────────────────────────────────────────────────
#define ATHENA_VERSION "1.1.1"

// ─────────────────────────────────────────────────────────────────────────────
//  Arma 3 extension callback type (registered via RVExtensionRegisterCallback)
// ─────────────────────────────────────────────────────────────────────────────
typedef void (*ArmaCallback)(const char* name, const char* function, const char* data);

// ─────────────────────────────────────────────────────────────────────────────
//  Configuration (override via AthenaServerSettings.txt next to DLL)
// ─────────────────────────────────────────────────────────────────────────────
struct Config {
    std::wstring host  = L"127.0.0.1"; // Use IP to avoid DNS/IPv6 delays
    int          port  = 5000;         // ASP.NET backend port
    bool         debug = false;
};
