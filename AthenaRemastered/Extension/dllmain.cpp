/*
 * AthenaServer_x64.dll  -  Arma 3 Extension  -  Athena Remastered
 *
 * Implements the Arma 3 callExtension interface:
 *   "AthenaServer" callExtension ["put",  [fn, arg0, arg1, ...]]
 *   "AthenaServer" callExtension ["get",  ["request"]]
 *
 * Both "put" and "get" are fully synchronous -- no background thread needed.
 * Update rate is ~1Hz so the few-ms HTTP overhead per call is acceptable.
 *
 * Build: MSVC x64, /MT, /std:c++17
 * Link:  winhttp.lib, kernel32.lib
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

#include "config.h"
#include "http_client.h"
#include "json_builder.h"

static Config       g_cfg;
static HttpClient*  g_httpPut      = nullptr;  // persistent — reused for all PUT calls (fast road export)
static HttpClient*  g_httpGet      = nullptr;  // persistent — reused for all GET polls
static ArmaCallback g_armaCallback = nullptr;

static void LoadConfig() {
    char dllPath[MAX_PATH] = {};
    HMODULE hm = NULL;
    GetModuleHandleExA(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        (LPCSTR)&LoadConfig, &hm);
    GetModuleFileNameA(hm, dllPath, MAX_PATH);

    std::string path(dllPath);
    auto pos = path.find_last_of("\\/");
    std::string dir = (pos != std::string::npos) ? path.substr(0, pos + 1) : "";

    auto trim = [](std::string s) {
        while (!s.empty() && (s.back() == '\r' || s.back() == '\n' || s.back() == ' '))
            s.pop_back();
        return s;
    };

    std::ifstream f(dir + "AthenaServerSettings.txt");
    std::string line;
    while (std::getline(f, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;
        auto eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(line.substr(0, eq));
        std::string val = trim(line.substr(eq + 1));
        if (key == "host") g_cfg.host = std::wstring(val.begin(), val.end());
        if (key == "port") g_cfg.port = std::stoi(val);
        if (key == "debug") g_cfg.debug = (val == "true" || val == "1");
    }
}

extern "C" {

__declspec(dllexport) void __stdcall RVExtensionVersion(char* output, int outputSize) {
    LoadConfig();
    g_httpPut = new HttpClient(g_cfg);   // persistent — reused for all PUT calls
    g_httpGet = new HttpClient(g_cfg);   // persistent — reused for all GET polls
    strncpy_s(output, outputSize, "AthenaServer " ATHENA_VERSION, _TRUNCATE);
}

__declspec(dllexport) void __stdcall RVExtensionRegisterCallback(ArmaCallback cb) {
    g_armaCallback = cb;
}

__declspec(dllexport) int __stdcall RVExtensionArgs(
    char*        output,
    int          outputSize,
    const char*  function,
    const char** args,
    int          argCount)
{
    output[0] = '\0';
    if (!function) return -1;

    std::string fn(function);

    // "ping" — returns "host:port" so you can verify config was loaded correctly
    if (fn == "ping") {
        std::string host;
        host.reserve(g_cfg.host.size());
        for (wchar_t wc : g_cfg.host) host += static_cast<char>(wc);
        std::string result = host + ":" + std::to_string(g_cfg.port);
        strncpy_s(output, outputSize, result.c_str(), _TRUNCATE);
        return 0;
    }

    // "echo" — returns the JSON body that "put" would send, without sending it
    if (fn == "echo") {
        if (argCount < 1) return -1;
        std::string subFn(args[0] ? args[0] : "");
        std::vector<std::string> subArgs;
        for (int i = 1; i < argCount; ++i)
            subArgs.emplace_back(args[i] ? args[i] : "");
        std::string body = Json::BuildPut(subFn, subArgs);
        strncpy_s(output, outputSize, body.c_str(), _TRUNCATE);
        return 0;
    }

    // "puttest" — does PUT then immediately GETs /api/game/state; returns state JSON
    if (fn == "puttest") {
        if (argCount < 1) return -1;
        std::string subFn(args[0] ? args[0] : "");
        std::vector<std::string> subArgs;
        for (int i = 1; i < argCount; ++i)
            subArgs.emplace_back(args[i] ? args[i] : "");
        std::string body = Json::BuildPut(subFn, subArgs);
        std::string postResponse;
        bool postOk = g_httpPut->Post("/api/game/put", body, &postResponse);
        // Get state immediately after
        std::string state;
        HttpClient httpGet(g_cfg);
        httpGet.Get("/api/game/state", state);
        std::string result = (postOk ? "OK:" : "FAIL:") + state;
        strncpy_s(output, outputSize, result.c_str(), _TRUNCATE);
        return 0;
    }

    if (fn == "put") {
        if (argCount < 1) return -1;
        std::string subFn(args[0] ? args[0] : "");
        std::vector<std::string> subArgs;
        for (int i = 1; i < argCount; ++i)
            subArgs.emplace_back(args[i] ? args[i] : "");

        std::string body = Json::BuildPut(subFn, subArgs);
        std::string postResp;
        bool ok = g_httpPut->Post("/api/game/put", body, &postResp);
        if (!ok) {
            // Return WinHTTP error so we can see it from Arma debug console
            DWORD err = GetLastError();
            char buf[64];
            sprintf_s(buf, "ERR:POST_FAILED(%lu)", err);
            strncpy_s(output, outputSize, buf, _TRUNCATE);
            return 1;
        }
        return 0;
    }

    if (fn == "get") {
        if (!g_httpGet) return -1;
        std::string body;
        if (g_httpGet->Get("/api/game/request", body)) {
            if (!body.empty() && body != "null")
                strncpy_s(output, outputSize, body.c_str(), _TRUNCATE);
            return 0;  // HTTP succeeded (even if queue was empty)
        }
        return 1;  // HTTP failed — server unreachable
    }

    return -1;
}

} // extern "C"

BOOL APIENTRY DllMain(HMODULE, DWORD, LPVOID) {
    return TRUE;
}