#pragma once
#include "config.h"
#include <string>
#include <vector>
#include <sstream>

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal WinHTTP helper — sends HTTP POST/GET to localhost.
//  No external dependencies; uses only Windows-built-in WinHTTP.
//
//  IMPORTANT: Session and connection handles are created ONCE on construction
//  and reused for every request.  Creating a new WinHttpOpen + WinHttpConnect
//  on every callExtension "put road" call (30 000+ times for Altis) costs
//  ~100 ms each due to TCP setup, totalling ~1 hour.  With persistent handles,
//  subsequent requests reuse the existing TCP connection via HTTP/1.1 keep-alive
//  and cost <2 ms each.
//
//  Thread safety: each HttpClient instance must be used by only one SQF call
//  type (put OR get, not both).  dllmain.cpp creates g_httpPut and g_httpGet
//  as separate instances so there is no concurrent access to any one instance.
// ─────────────────────────────────────────────────────────────────────────────

class HttpClient {
public:
    explicit HttpClient(const Config& cfg) : m_cfg(cfg) {
        m_hSession = WinHttpOpen(L"AthenaServer/1.0",
                                 WINHTTP_ACCESS_TYPE_NO_PROXY,
                                 WINHTTP_NO_PROXY_NAME,
                                 WINHTTP_NO_PROXY_BYPASS, 0);
        if (m_hSession)
            m_hConnect = WinHttpConnect(m_hSession, m_cfg.host.c_str(),
                                        static_cast<INTERNET_PORT>(m_cfg.port), 0);
    }

    ~HttpClient() {
        if (m_hConnect) WinHttpCloseHandle(m_hConnect);
        if (m_hSession) WinHttpCloseHandle(m_hSession);
    }

    // Non-copyable — handles can't be duplicated
    HttpClient(const HttpClient&)            = delete;
    HttpClient& operator=(const HttpClient&) = delete;

    // POST JSON body. Returns true on HTTP 2xx. Optionally fills responseBody.
    bool Post(const std::string& path, const std::string& jsonBody,
              std::string* responseBody = nullptr) {
        return Request(L"POST", path, jsonBody, responseBody);
    }

    // GET url path. Fills responseBody. Returns true on HTTP 200.
    bool Get(const std::string& path, std::string& responseBody) {
        return Request(L"GET", path, "", &responseBody);
    }

private:
    const Config& m_cfg;
    HINTERNET     m_hSession = nullptr;
    HINTERNET     m_hConnect = nullptr;

    bool Request(const std::wstring& method, const std::string& path,
                 const std::string& body, std::string* outBody = nullptr)
    {
        if (!m_hSession || !m_hConnect) return false;

        bool ok = false;
        std::wstring wpath(path.begin(), path.end());
        HINTERNET hRequest = WinHttpOpenRequest(m_hConnect, method.c_str(), wpath.c_str(),
                                                NULL, WINHTTP_NO_REFERER,
                                                WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
        if (!hRequest) return false;

        LPCWSTR headers = method == L"POST"
            ? L"Content-Type: application/json\r\n"
            : WINHTTP_NO_ADDITIONAL_HEADERS;

        BOOL sent = WinHttpSendRequest(
            hRequest, headers, (DWORD)-1,
            body.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)body.c_str(),
            (DWORD)body.size(), (DWORD)body.size(), 0);

        if (sent && WinHttpReceiveResponse(hRequest, NULL)) {
            DWORD status = 0, statusSize = sizeof(status);
            WinHttpQueryHeaders(hRequest,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize,
                WINHTTP_NO_HEADER_INDEX);
            ok = (status >= 200 && status < 300);

            if (ok && outBody) {
                DWORD avail = 0;
                while (WinHttpQueryDataAvailable(hRequest, &avail) && avail > 0) {
                    std::vector<char> buf(avail + 1, 0);
                    DWORD read = 0;
                    if (WinHttpReadData(hRequest, buf.data(), avail, &read))
                        outBody->append(buf.data(), read);
                }
            }
        }

        WinHttpCloseHandle(hRequest);
        return ok;
    }
};
