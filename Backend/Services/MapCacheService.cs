using System.Text.Json;
using AthenaRemastered.Server.Models;

namespace AthenaRemastered.Server.Services;

/// <summary>
/// Persists map geometry (roads, trees, forests, locations, structures,
/// elevations) to disk so Arma doesn't need to re-export a world every
/// session. <c>GameStateService.PutWorldInfo()</c> checks this cache when a
/// mission reports its world and only asks the extension for missing parts.
///
/// Location: <c>%USERPROFILE%\Documents\AthenaRemastered\MapCache\{world}\</c>
/// (override with the <c>ATHENA_MAPCACHE_DIR</c> environment variable).
/// Before 1.2.0 the cache lived in <c>MapCache\</c> beside the server EXE, so
/// every new install folder, test build or Workshop update started empty and
/// triggered a full re-export. Files from that legacy folder are copied over
/// once at startup (existing files in the new location are never overwritten).
/// </summary>
public class MapCacheService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>Environment variable that overrides the cache root (tests, portable setups).</summary>
    public const string CacheDirEnvVar = "ATHENA_MAPCACHE_DIR";

    /// <summary>
    /// Root folder of the map cache. Resolved once: the env override, else
    /// Documents\AthenaRemastered\MapCache (stable across EXE locations, like
    /// Athena Desktop's Documents\Athena\Maps).
    /// </summary>
    public static readonly string CacheRoot = ResolveCacheRoot();

    /// <summary>Pre-1.2.0 cache location beside the server EXE (migration source only).</summary>
    private static string LegacyCacheRoot => Path.Combine(AppContext.BaseDirectory, "MapCache");

    private static string ResolveCacheRoot()
    {
        var overrideDir = Environment.GetEnvironmentVariable(CacheDirEnvVar);
        if (!string.IsNullOrWhiteSpace(overrideDir)) return Path.GetFullPath(overrideDir.Trim());
        var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        // Documents can be unavailable (e.g. service account); fall back to the EXE folder.
        return string.IsNullOrEmpty(docs)
            ? LegacyCacheRoot
            : Path.Combine(docs, "AthenaRemastered", "MapCache");
    }

    private readonly ILogger<MapCacheService> _log;

    /// <summary>
    /// Creates the service and migrates a legacy EXE-side cache (see class summary).
    /// Side effects: creates <see cref="CacheRoot"/>, copies legacy files, logs both paths.
    /// </summary>
    public MapCacheService(ILogger<MapCacheService> log)
    {
        _log = log;
        _log.LogInformation("Map cache folder: {Root}", CacheRoot);
        MigrateLegacyCache();
    }

    /// <summary>
    /// Copies files from the old EXE-side MapCache into <see cref="CacheRoot"/>,
    /// skipping files that already exist there. The legacy folder is left in
    /// place (harmless, and a rollback to an older build keeps working).
    /// </summary>
    private void MigrateLegacyCache()
    {
        var legacy = LegacyCacheRoot;
        if (!Directory.Exists(legacy)) return;
        if (string.Equals(Path.GetFullPath(legacy).TrimEnd('\\', '/'), CacheRoot.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase)) return;
        int copied = 0;
        try
        {
            foreach (var src in Directory.EnumerateFiles(legacy, "*", SearchOption.AllDirectories))
            {
                var dst = Path.Combine(CacheRoot, Path.GetRelativePath(legacy, src));
                if (File.Exists(dst)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
                File.Copy(src, dst);
                copied++;
            }
            if (copied > 0)
                _log.LogInformation("Migrated {Count} map cache file(s) from {Legacy}", copied, legacy);
        }
        catch (Exception ex)
        {
            // Never block startup: worst case the world is exported once more.
            _log.LogWarning(ex, "Map cache migration from {Legacy} failed after {Count} file(s)", legacy, copied);
        }
    }

    private static string CacheDir(string worldName) =>
        Path.Combine(CacheRoot, worldName.ToLowerInvariant());

    // ── Check ────────────────────────────────────────────────────────────────

    public bool HasCache(string worldName)
    {
        var dir = CacheDir(worldName);
        return File.Exists(Path.Combine(dir, "roads.json"))
            && File.Exists(Path.Combine(dir, "trees.json"))
            && File.Exists(Path.Combine(dir, "forests.json"))
            && File.Exists(Path.Combine(dir, "locations.json"));
    }

    public bool HasStructuresCache(string worldName)
        => File.Exists(Path.Combine(CacheDir(worldName), "structures.json"));

    public bool HasElevationsCache(string worldName)
        => File.Exists(Path.Combine(CacheDir(worldName), "elevations.json"));

    public bool HasTreesCache(string worldName)
        => File.Exists(Path.Combine(CacheDir(worldName), "trees.json"));

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

    public List<TreePoint> LoadTrees(string worldName)
        => Load<List<TreePoint>>(worldName, "trees.json") ?? [];

    // ── Clear ────────────────────────────────────────────────────────────────

    public void ClearWorldCache(string worldName)
    {
        var dir = CacheDir(worldName);
        if (!Directory.Exists(dir)) return;
        try
        {
            Directory.Delete(dir, recursive: true);
        }
        catch
        {
            // Best-effort: if files are temporarily locked, remove known cache files.
            TryDelete(Path.Combine(dir, "roads.json"));
            TryDelete(Path.Combine(dir, "forests.json"));
            TryDelete(Path.Combine(dir, "locations.json"));
            TryDelete(Path.Combine(dir, "structures.json"));
            TryDelete(Path.Combine(dir, "elevations.json"));
            TryDelete(Path.Combine(dir, "trees.json"));
        }
    }

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

    public void SaveTrees(string worldName, List<TreePoint> trees)
        => Save(worldName, "trees.json", trees);

    // ── Last-world persistence ───────────────────────────────────────────

    private static string LastWorldFile =>
        Path.Combine(CacheRoot, "last-world.txt");

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
        var root = CacheRoot;
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

    private static void TryDelete(string path)
    {
        if (!File.Exists(path)) return;
        try { File.Delete(path); } catch { }
    }
}
