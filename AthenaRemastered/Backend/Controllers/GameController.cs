using AthenaRemastered.Server.Models;
using AthenaRemastered.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace AthenaRemastered.Server.Controllers;

/// <summary>
/// All endpoints used exclusively by the AthenaServer C++ extension.
/// Extension POSTs to /api/game/put and GETs /api/game/request.
/// </summary>
[ApiController]
[Route("api/game")]
public class GameController : ControllerBase
{
    private readonly GameStateService _state;
    private readonly ILogger<GameController>  _log;

    public GameController(GameStateService state, ILogger<GameController> log)
    {
        _state = state;
        _log   = log;
    }

    // ── PUT ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Receives a single "put" call from the extension.
    /// Body: { "fn": "mission", "args": ["name","author",...] }
    /// </summary>
    [HttpPost("put")]
    public IActionResult Put([FromBody] ExtensionPutDto dto)
    {
        try
        {
            HandlePut(dto.Fn, dto.Args);
            return Ok();
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error handling put fn={Fn}", dto.Fn);
            return BadRequest(ex.Message);
        }
    }

    private void HandlePut(string fn, List<object> args)
    {
        string S(int i) => args.Count > i ? args[i]?.ToString() ?? "" : "";
        double D(int i) => args.Count > i && double.TryParse(args[i]?.ToString(), System.Globalization.NumberStyles.Any,
                           System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;
        bool   B(int i) => args.Count > i && (args[i] is bool b ? b : bool.TryParse(args[i]?.ToString(), out var bv) && bv);

        switch (fn.ToLowerInvariant())
        {
            case "mission":
                _state.PutMission(S(0), S(1), S(2), S(3), B(4), S(5), S(6));
                break;

            case "time":
                _state.PutTime((int)D(0), (int)D(1), (int)D(2), (int)D(3), (int)D(4));
                break;

            case "group":
                _state.PutGroup(S(0), S(1), S(2), D(3), D(4), S(5));
                break;

            case "unit":
                _state.PutUnit(S(0), S(1), S(2), S(3), S(4), S(5), S(6),
                               S(7), S(8), S(9), S(10), S(11), S(12),
                               B(13), S(14), S(15), S(16));
                break;

            case "vehicle":
            {
                var crew = new List<CrewMember>();
                if (args.Count > 2 && args[2] is System.Text.Json.JsonElement je
                    && je.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var item in je.EnumerateArray())
                    {
                        var arr = item.EnumerateArray().ToList();
                        if (arr.Count >= 2)
                            crew.Add(new CrewMember
                            {
                                UnitId = arr[0].GetString() ?? "",
                                Role   = arr[1].GetString() ?? ""
                            });
                    }
                }
                _state.PutVehicle(S(0), S(1), crew);
                break;
            }

            case "updateunit":
                _state.PutUpdateUnit(S(0), S(1), S(2), D(3), D(4), D(5), D(6), D(7));
                break;

            case "updatevehicle":
                _state.PutUpdateVehicle(S(0), D(1), D(2), D(3), D(4), D(5));
                break;

            case "updateend":
                _state.PutUpdateEnd();
                break;

            case "fired":
                _state.PutFired(S(0), S(1), S(2), S(3), S(4), S(5), S(6), S(7));
                break;

            case "killed":
                _state.PutKilled(S(0), S(1), S(2));
                break;

            // World/map geometry
            case "world":
                // args: nameDisplay, nameWorld, author, sizeWorld, forestMin,
                //       offsetX, offsetY, zoom1..zoom3 (15 values), centerX, centerY
                _state.PutWorldInfo(S(0), S(1), S(2), D(3), D(4), D(5), D(6), D(22), D(23));
                break;

            case "road":
                // args: index, id, type, foot, bridge, connections(str),
                //       posX,posY,posZ, pos1X,pos1Y,pos1Z, pos2X,pos2Y,pos2Z, dir, l, w
                _state.PutRoad(
                    id: S(1), type: S(2), foot: B(3), bridge: B(4),
                    posX: D(6), posY: D(7),
                    beg1X: D(9),  beg1Y: D(10),
                    end2X: D(12), end2Y: D(13),
                    width: D(17), length: D(16), dir: D(15));
                break;

            case "roadscomplete":
                _state.PutRoadsComplete();
                break;

            case "forest":
                // args: index, y, x, level  (note: Y before X in SQF)
                _state.PutForestCell(x: D(2), y: D(1), level: (int)D(3));
                break;

            case "forestscomplete":
                _state.PutForestsComplete();
                break;

            case "location":
                // args: type(class), rectangular(bool), text(name), w, l, dir, posX, posY
                _state.PutLocation(
                    type: S(0), name: S(2),
                    posX: D(6), posY: D(7),
                    dir: D(5), sizeX: D(3), sizeY: D(4));
                break;

            case "locationscomplete":
                _state.PutLocationsComplete();
                break;

            // Remaining world exports — log only (elevations not rendered yet)
            case "elevation":
                // args: index, x, y, z
                _state.PutElevation(D(1), D(2), D(3));
                break;

            case "elevationscomplete":
                _state.PutElevationsComplete();
                break;

            case "vehicleclass":
            case "vehicleclassescomplete":
            case "weaponclass":
            case "weaponclassescomplete":
            case "locationclass":
            case "locationclassescomplete":
                _log.LogDebug("World data: {Fn} ({Count} args)", fn, args.Count);
                break;

            // Structures
            case "structure":
                // args: index, id, model, modelPath, type, posX, posY, posZ, dir, w, l, h, bp[]
                _state.PutStructure(
                    id:     S(2), type: S(5), model: S(3),
                    posX:   D(6), posY: D(7), dir:  D(9),
                    width:  D(10), length: D(11), height: D(12));
                break;

            case "structurescomplete":
                _state.PutStructuresComplete();
                break;

            // Server admin settings (sent from Arma mission params via DLL)
            case "settings":
                // args: showEast, showGuer, showCiv
                _state.UpdateSettings(new ServerSettings
                {
                    ShowEast = B(0),
                    ShowGuer = B(1),
                    ShowCiv  = B(2),
                });
                break;

            default:
                _log.LogWarning("Unknown put fn: {Fn}", fn);
                break;
        }
    }

    // ── GET request (extension polls this) ───────────────────────────────────

    /// <summary>
    /// Extension polls this endpoint to retrieve the next pending request
    /// to forward to the game via callExtension callback or polling.
    /// Returns 204 if queue is empty.
    /// </summary>
    [HttpGet("request")]
    public IActionResult GetRequest()
    {
        if (!_state.TryDequeueRequest(out var req))
            return NoContent();

        // Return as SQF-parseable array string so the game can use parseSimpleArray:
        // ["command","clientId",[arg0,arg1,...]]
        static string SqfValue(object v)
        {
            var s = v?.ToString() ?? "";
            return double.TryParse(s, System.Globalization.NumberStyles.Any,
                                   System.Globalization.CultureInfo.InvariantCulture, out _)
                ? s
                : $"\"{s.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
        }

        var dataItems = string.Join(",", req!.Data.Select(SqfValue));
        var sqf = $"[\"{req.Command}\",\"{req.Client}\",[{dataItems}]]";
        return Content(sqf, "text/plain");
    }

    // ── Frontend-triggered requests ───────────────────────────────────────────

    /// <summary>
    /// Frontend asks the server to trigger a world export.
    /// Server queues the request; extension picks it up and calls back into Arma.
    /// </summary>
    [HttpPost("request/world")]
    public IActionResult RequestWorld([FromBody] WorldRequestDto dto)
    {
        _state.EnqueueRequest(new ExtensionRequest
        {
            Command = dto.Command,
            Client  = dto.Client ?? "",
            Data    = dto.Data   ?? []
        });
        return Accepted();
    }

    /// <summary>Returns current snapshot for a freshly-connected client.</summary>
    [HttpGet("state")]
    public IActionResult GetState() => Ok(_state.GetCurrentFrame());

    // ── Cached geometry REST endpoints (frontend hydrates from these on startup) ──

    [HttpGet("worldinfo")]
    public IActionResult GetWorldInfo() =>
        _state.World != null ? Ok(_state.World) : NoContent();

    [HttpGet("roads")]
    public IActionResult GetRoads()
    {
        var roads = _state.GetRoads();
        return roads.Count > 0 ? Ok(roads) : NoContent();
    }

    [HttpGet("forests")]
    public IActionResult GetForests()
    {
        var forests = _state.GetForests();
        return forests.Cells.Count > 0 ? Ok(forests) : NoContent();
    }

    [HttpGet("locations")]
    public IActionResult GetLocations()
    {
        var locations = _state.GetLocations();
        return locations.Count > 0 ? Ok(locations) : NoContent();
    }

    [HttpGet("structures")]
    public IActionResult GetStructures()
    {
        var structures = _state.GetStructures();
        return structures.Count > 0 ? Ok(structures) : NoContent();
    }

    [HttpGet("elevations")]
    public IActionResult GetElevations()
    {
        var elevations = _state.GetElevations();
        return elevations.Cells.Count > 0 ? Ok(elevations) : NoContent();
    }

    [HttpGet("exportstatus")]
    public IActionResult GetExportStatus() => Ok(_state.GetExportStatus());

    /// <summary>Debug: returns geometry counts without waiting for complete broadcasts.</summary>
    [HttpGet("debug")]
    public IActionResult GetDebug() => Ok(new {
        roadCount      = _state.GetRoads().Count,
        forestCount    = _state.GetForests().Cells.Count,
        locationCount  = _state.GetLocations().Count,
        elevationCount = _state.GetElevations().Cells.Count,
        worldSet       = _state.World != null,
        queueSize      = _state.PendingRequestCount
    });

    /// <summary>Debug: returns first 20 locations of a given type.</summary>
    [HttpGet("debug/locations/{type}")]
    public IActionResult GetLocationsByType(string type) =>
        Ok(_state.GetLocations()
            .Where(l => l.Type.Equals(type, StringComparison.OrdinalIgnoreCase))
            .Take(20));

    /// <summary>Debug: returns location type breakdown.</summary>
    [HttpGet("debug/locationtypes")]
    public IActionResult GetLocationTypes() =>
        Ok(_state.GetLocations()
            .GroupBy(l => l.Type)
            .Select(g => new { type = g.Key, count = g.Count(), sampleName = g.First().Name })
            .OrderByDescending(x => x.count));

    /// <summary>Debug: returns road type breakdown + sample airport tiles.</summary>
    [HttpGet("debug/roadtypes")]
    public IActionResult GetRoadTypes()
    {
        var roads = _state.GetRoads();
        var byType = roads.GroupBy(r => r.Type)
            .Select(g => new { type = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count);
        var hideRoads = roads.Where(r => r.Type.Equals("hide", StringComparison.OrdinalIgnoreCase)).Take(20)
            .Select(r => new { r.Id, r.PosX, r.PosY, r.Width, r.Length, r.Dir, r.Beg1X, r.Beg1Y, r.End2X, r.End2Y });
        return Ok(new { types = byType, sampleHide = hideRoads });
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

public record ExtensionPutDto(string Fn, List<object> Args);
public record WorldRequestDto(string Command, string? Client, List<object>? Data);
