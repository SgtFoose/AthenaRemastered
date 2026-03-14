/*
 * test_extension.cpp — standalone test harness for AthenaServer_x64.dll
 *
 * Loads the DLL via LoadLibrary and calls RVExtensionArgs exactly as Arma 3
 * would, including Arma-style quoted string args (e.g. "\"mission\"").
 * Prints the returned output buffer so you can verify the fix without Arma.
 *
 * Build (from VS x64 dev prompt):
 *   cl /std:c++17 /EHsc test_extension.cpp /link /out:test_extension.exe
 *
 * Usage:
 *   test_extension.exe <path_to_dll>
 *   test_extension.exe   (defaults to ..\build\AthenaServer_x64.dll)
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <string>

// ── Function pointer types matching the DLL exports ──────────────────────────
typedef void (__stdcall *FnVersion)(char*, int);
typedef void (__stdcall *FnRegisterCallback)(void*);
typedef int  (__stdcall *FnArgs)(char*, int, const char*, const char**, int);

// ── Helper: call RVExtensionArgs and print result ────────────────────────────
static void RunTest(FnArgs fn_args, const char* testName,
                    const char* function, const char** args, int argCount)
{
    char output[4096] = {};
    int  rc = fn_args(output, sizeof(output), function, args, argCount);
    printf("[%s]\n", testName);
    printf("  fn=\"%s\"  argCount=%d\n", function, argCount);
    for (int i = 0; i < argCount; i++)
        printf("  args[%d]=\"%s\"\n", i, args[i]);
    printf("  => output=\"%s\"  rc=%d\n\n", output, rc);
}

int main(int argc, char* argv[])
{
    const char* dllPath = (argc > 1)
        ? argv[1]
        : "..\\build\\AthenaServer_x64.dll";

    printf("Loading: %s\n\n", dllPath);
    HMODULE hDll = LoadLibraryA(dllPath);
    if (!hDll) {
        printf("ERROR: LoadLibrary failed (%lu)\n", GetLastError());
        return 1;
    }

    auto fnVersion  = (FnVersion) GetProcAddress(hDll, "RVExtensionVersion");
    auto fnRegCb    = (FnRegisterCallback) GetProcAddress(hDll, "RVExtensionRegisterCallback");
    auto fnArgs     = (FnArgs)    GetProcAddress(hDll, "RVExtensionArgs");

    if (!fnVersion || !fnArgs) {
        printf("ERROR: Missing exports\n");
        FreeLibrary(hDll);
        return 1;
    }

    // Initialise (loads config)
    char verBuf[64] = {};
    fnVersion(verBuf, sizeof(verBuf));
    printf("Version: %s\n\n", verBuf);

    // ── Test 1: ping — should return host:port ────────────────────────────────
    {
        const char* args[] = {};
        RunTest(fnArgs, "ping", "ping", args, 0);
    }

    // ── Test 2: echo with UNQUOTED args (how we USED to call it) ─────────────
    {
        const char* args[] = { "mission", "MyMission", "Author", "Altis",
                               "Description", "false", "Player1", "12345" };
        RunTest(fnArgs, "echo (unquoted - old style)", "echo", args, 8);
    }

    // ── Test 3: echo with QUOTED args (how Arma actually passes them) ─────────
    {
        const char* args[] = { "\"mission\"", "\"MyMission\"", "\"Author\"",
                               "\"Altis\"", "\"Description\"", "false",
                               "\"Player1\"", "12345" };
        RunTest(fnArgs, "echo (quoted - Arma style)", "echo", args, 8);
    }

    // ── Test 4: echo updateunit (quoted, as Arma sends it) ───────────────────
    {
        const char* args[] = { "\"updateunit\"", "\"1-1-A:1\"", "\"1-1-A\"",
                               "", "100.5", "200.3", "15.0", "90.0", "5.2" };
        RunTest(fnArgs, "echo (quoted updateunit)", "echo", args, 9);
    }

    // ── Test 5: echo time (quoted) ────────────────────────────────────────────
    {
        const char* args[] = { "\"time\"", "2035", "6", "15", "14", "30" };
        RunTest(fnArgs, "echo (quoted time)", "echo", args, 6);
    }

    // ── Test 6: puttest mission (live round-trip to backend) ─────────────────
    printf("--- Live round-trip test (requires backend on 127.0.0.1:5000) ---\n");
    {
        const char* args[] = { "\"mission\"", "\"DLL_TEST\"", "\"TestAuth\"",
                               "\"VR\"", "\"live test\"", "false",
                               "\"Player1\"", "99999" };
        RunTest(fnArgs, "puttest (quoted mission via backend)", "puttest", args, 8);
    }

    FreeLibrary(hDll);
    return 0;
}
