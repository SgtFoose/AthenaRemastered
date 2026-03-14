#pragma once
#include <string>
#include <vector>
#include <sstream>

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal JSON builder — enough for our fixed message shapes.
//  We avoid nlohmann/json to keep the extension dependency-free.
// ─────────────────────────────────────────────────────────────────────────────

namespace Json {

// Escape a string value for JSON embedding
inline std::string Escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 2);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;      break;
        }
    }
    return out;
}

// Arma 3 passes string values in callExtension arg arrays WITH surrounding
// double-quotes (e.g. args[0] == "\"mission\""). Strip them before use.
inline std::string StripArmaStr(const std::string& s) {
    if (s.size() >= 2 && s.front() == '"' && s.back() == '"')
        return s.substr(1, s.size() - 2);
    return s;
}

// Build the JSON body for POST /api/game/put
// fn: "mission", "group", "unit", etc. (may arrive with surrounding Arma quotes)
// args: raw string values from Arma (may arrive with surrounding Arma quotes)
inline std::string BuildPut(const std::string& fn,
                             const std::vector<std::string>& args)
{
    std::ostringstream oss;
    oss << "{\"fn\":\"" << Escape(StripArmaStr(fn)) << "\",\"args\":[";
    for (size_t i = 0; i < args.size(); ++i) {
        if (i) oss << ',';
        std::string val = StripArmaStr(args[i]);
        // Try numeric — if it parses cleanly, emit without quotes
        bool isNum = !val.empty();
        for (char c : val)
            if (!isdigit(c) && c != '.' && c != '-') { isNum = false; break; }
        if (isNum && !val.empty())
            oss << val;
        else
            oss << '"' << Escape(val) << '"';
    }
    oss << "]}";
    return oss.str();
}

} // namespace Json
