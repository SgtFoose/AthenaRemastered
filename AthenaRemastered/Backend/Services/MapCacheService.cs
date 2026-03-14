using System.Text.Json;
using AthenaRemastered.Server.Models;

namespace AthenaRemastered.Server.Services;

/// <summary>
/// Persists map geometry (roads, forests, locations) to disk so Arma
/// doesn't need to re-export them every session. Cache lives under
/// MapCache/{worldName}/ beside the backend executable.
/// </summary>
public class MapCacheService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static string CacheDir(string worldName) =>
        Path.Combine(AppContext.BaseDirectory, "MapCache", worldName.ToLowerInvariant());

    // ── Check ────────────────────────────────────────────────────────────────

    public bool HasCache(string worldName)
    {
        var dir = CacheDir(worldName);
        return File.Exists(Path.Combine(dir, "roads.json"))
            && File.Exists(Path.Combine(dir, "forests.json"))
            && File.Exists(Path.Combine(dir, "locations.json"));
    }

    public bool HasStructuresCache(string worldName)
        => File.Exists(Path.Combine(CacheDir(worldName), "structures.json"));

    public bool HasElevationsCache(string worldName)
        => File.Exists(Path.Combine(CacheDir(worldName), "elevations.json"));

    // ── Load ─────────────────────────────────────────────────────────────────

    public List<Road> LoadRoads(string worldName)
        => Load<List<Road>>(worldName, "roads.json") ?? [];

    public ForestsData LoadForests(string worldName)
        => Load<ForestsData>(worldName, "forests.json") ?? new ForestsData();

    public List<MapLocation> LoadLocations(string worldName)
        => Load<List<MapLocation>>(worldName, "locations.json") ?? [];

    public List<MapStructure> LoadStructures(string worldName)
        => Load<List<MapStructure>>(worldName, "structures.json") ?? [];

    public ElevationsData LoadElevations(string worldName)
        => Load<ElevationsData>(worldName, "elevations.json") ?? new ElevationsData();

    // ── Save ─────────────────────────────────────────────────────────────────

    public void SaveRoads(string worldName, List<Road> roads)
        => Save(worldName, "roads.json", roads);

    public void SaveForests(string worldName, ForestsData forests)
        => Save(worldName, "forests.json", forests);

    public void SaveLocations(string worldName, List<MapLocation> locations)
        => Save(worldName, "locations.json", locations);

    public void SaveStructures(string worldName, List<MapStructure> structures)
        => Save(worldName, "structures.json", structures);

    public void SaveElevations(string worldName, ElevationsData elevations)
        => Save(worldName, "elevations.json", elevations);

    // ── Last-world persistence ───────────────────────────────────────────

    private static string LastWorldFile =>
        Path.Combine(AppContext.BaseDirectory, "MapCache", "last-world.txt");

    public void SaveLastWorld(string worldName)
    {
        var dir = Path.GetDirectoryName(LastWorldFile)!;
        Directory.CreateDirectory(dir);
        File.WriteAllText(LastWorldFile, worldName);
    }

    public string? LoadLastWorld()
    {
        if (!File.Exists(LastWorldFile)) return null;
        var name = File.ReadAllText(LastWorldFile).Trim();
        return string.IsNullOrEmpty(name) ? null : name;
    }

    /// <summary>
    /// Fallback: find any cached world directory when last-world.txt doesn't exist yet.
    /// </summary>
    public string? FindAnyCachedWorld()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "MapCache");
        if (!Directory.Exists(root)) return null;
        return Directory.EnumerateDirectories(root)
            .Select(Path.GetFileName)
            .FirstOrDefault(d => d != null && HasCache(d));
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private static T? Load<T>(string worldName, string fileName)
    {
        var path = Path.Combine(CacheDir(worldName), fileName);
        if (!File.Exists(path)) return default;
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<T>(json, JsonOpts);
    }

    private static void Save<T>(string worldName, string fileName, T data)
    {
        var dir = CacheDir(worldName);
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(data, JsonOpts);
        File.WriteAllText(Path.Combine(dir, fileName), json);
    }
}
