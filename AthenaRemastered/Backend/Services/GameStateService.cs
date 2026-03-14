using System.Collections.Concurrent;
using AthenaRemastered.Server.Models;

namespace AthenaRemastered.Server.Services;

/// <summary>
/// Thread-safe in-memory game state. Single shared instance (singleton).
/// The extension posts data here; the SignalR hub reads from here.
/// </summary>
public class GameStateService
{
    private readonly MapCacheService _cache;
    private readonly StaticAthenaCacheService _staticCache;
    private readonly ILogger<GameStateService> _log;

    public GameStateService(MapCacheService cache, StaticAthenaCacheService staticCache, ILogger<GameStateService> log)
    {
        _cache = cache;
        _staticCache = staticCache;
        _log = log;
        // Auto-load last-used world from disk cache so the map renders without the game
        LoadCachedWorld();
    }

    // ── Live state ──────────────────────────────────────────────────────────

    public Mission?  Mission  { get; private set; }
    public WorldInfo? World   { get; private set; }
    public GameTime? GameTime { get; private set; }
    public ServerSettings Settings { get; private set; } = new();

    public event Action<ServerSettings>? OnSettingsChanged;

    private readonly ConcurrentDictionary<string, Group>   _groups   = new();
    private readonly ConcurrentDictionary<string, Unit>    _units    = new();
    private readonly ConcurrentDictionary<string, Vehicle> _vehicles = new();

    private readonly ConcurrentQueue<FiredEvent>  _fired  = new();
    private readonly ConcurrentQueue<KilledEvent> _killed = new();

    // ── Map geometry ─────────────────────────────────────────────────────────

    private readonly object              _geoLock  = new();
    private readonly List<Road>          _roads     = [];
    private readonly List<ForestCell>    _forests   = [];
    private readonly List<MapLocation>   _locations = [];
    private readonly List<MapStructure>  _structures = [];
    private readonly List<ElevationCell> _elevations = [];
    private double                       _forestSampleSize;
    private double                       _elevationSampleSize = 200.0;

    // ── Pending requests: backend → extension → game ─────────────────────────

    private readonly ConcurrentQueue<ExtensionRequest> _requests = new();

    // ── Export status ─────────────────────────────────────────────────────────

    private ExportStatus _exportStatus = new();
    private readonly object _exportStatusLock = new();
    private const int ExportBroadcastInterval = 50; // broadcast every N items

    public ExportStatus GetExportStatus() { lock (_exportStatusLock) return new ExportStatus { Phase = _exportStatus.Phase, RoadCount = _exportStatus.RoadCount, RoadsComplete = _exportStatus.RoadsComplete, ForestCount = _exportStatus.ForestCount, ForestsComplete = _exportStatus.ForestsComplete, LocationCount = _exportStatus.LocationCount, LocationsComplete = _exportStatus.LocationsComplete, StructureCount = _exportStatus.StructureCount, StructuresComplete = _exportStatus.StructuresComplete, ElevationCount = _exportStatus.ElevationCount, ElevationsComplete = _exportStatus.ElevationsComplete }; }

    // ── Events fired when state changes ─────────────────────────────────────

    public event Action<GameFrame>?          OnFrame;
    public event Action<FiredEvent>?         OnFired;
    public event Action<KilledEvent>?        OnKilled;
    public event Action<WorldInfo>?          OnWorldInfo;
    public event Action<List<Road>>?         OnRoadsComplete;
    public event Action<ForestsData>?        OnForestsComplete;
    public event Action<List<MapLocation>>?  OnLocationsComplete;
    public event Action<List<MapStructure>>?  OnStructuresComplete;
    public event Action<ElevationsData>?      OnElevationsComplete;
    public event Action<ExportStatus>?        OnExportStatus;

    // ── PUT handlers (called by the extension endpoint) ──────────────────────

    public void PutMission(string name, string author, string world,
                           string desc, bool isMulti, string player, string steamId)
    {
        Mission = new Mission
        {
            Name = name, Author = author, World = world,
            Description = desc, IsMulti = isMulti,
            Player = player, SteamId = steamId
        };
        // New mission — clear old state including geometry
        _groups.Clear(); _units.Clear(); _vehicles.Clear();
        lock (_geoLock) { _roads.Clear(); _forests.Clear(); _locations.Clear(); _structures.Clear(); _elevations.Clear(); }
        lock (_exportStatusLock) { _exportStatus = new ExportStatus(); }
        OnExportStatus?.Invoke(GetExportStatus());
        World = null;
        // Auto-trigger world export so the frontend gets the map background
        EnqueueRequest(new ExtensionRequest { Command = "world", Client = "server", Data = [] });
    }

    public void PutTime(int year, int month, int day, int hour, int minute)
    {
        GameTime = new GameTime { Year = year, Month = month, Day = day, Hour = hour, Minute = minute };
    }

    public void PutGroup(string id, string leaderId, string name, double wpX, double wpY, string wpType = "")
    {
        _groups[id] = new Group { Id = id, LeaderId = leaderId, Name = name, WpX = wpX, WpY = wpY, WpType = wpType };
    }

    public void PutUnit(string id, string groupId, string leaderId, string vehicleId,
                        string playerName, string sessionId, string steamId,
                        string name, string faction, string side, string team, string type,
                        string rank, bool hasMediKit,
                        string wpPrimary, string wpSecondary, string wpHandgun)
    {
        var existing = _units.GetValueOrDefault(id) ?? new Unit { Id = id };
        existing.GroupId = groupId; existing.LeaderId = leaderId; existing.VehicleId = vehicleId;
        existing.PlayerName = playerName; existing.SessionId = sessionId; existing.SteamId = steamId;
        existing.Name = name; existing.Faction = faction; existing.Side = side;
        existing.Team = team; existing.Type = type; existing.Rank = rank;
        existing.HasMediKit = hasMediKit;
        existing.WeaponPrimary = wpPrimary; existing.WeaponSecondary = wpSecondary;
        existing.WeaponHandgun = wpHandgun;
        _units[id] = existing;
    }

    public void PutVehicle(string id, string cls, List<CrewMember> crew)
    {
        var existing = _vehicles.GetValueOrDefault(id) ?? new Vehicle { Id = id };
        existing.Class = cls; existing.Crew = crew;
        _vehicles[id] = existing;
    }

    public void PutUpdateUnit(string id, string groupId, string vehicleId,
                              double x, double y, double z, double dir, double speed)
    {
        if (_units.TryGetValue(id, out var u))
        {
            u.GroupId = groupId; u.VehicleId = vehicleId;
            u.PosX = x; u.PosY = y; u.PosZ = z;
            u.Dir = dir; u.Speed = speed;
        }
    }

    public void PutUpdateVehicle(string id, double x, double y, double z, double dir, double speed)
    {
        if (_vehicles.TryGetValue(id, out var v))
        {
            v.PosX = x; v.PosY = y; v.PosZ = z;
            v.Dir = dir; v.Speed = speed;
        }
    }

    public void PutUpdateEnd()
    {
        // Build snapshot and broadcast
        var frame = BuildFrame();
        OnFrame?.Invoke(frame);
    }

    public void PutFired(string unitId, string vehicleId, string weapon,
                         string muzzle, string mode, string ammo, string magazine, string projectile)
    {
        var e = new FiredEvent
        {
            UnitId = unitId, VehicleId = vehicleId, Weapon = weapon,
            Muzzle = muzzle, Mode = mode, Ammo = ammo,
            Magazine = magazine, Projectile = projectile
        };
        _fired.Enqueue(e);
        OnFired?.Invoke(e);
    }

    public void PutKilled(string victim, string killer, string instigator)
    {
        var e = new KilledEvent { Victim = victim, Killer = killer, Instigator = instigator };
        _killed.Enqueue(e);
        OnKilled?.Invoke(e);
    }

    // ── World / geometry PUT handlers ────────────────────────────────────────

    public void PutWorldInfo(string nameDisplay, string nameWorld, string author,
        double sizeWorld, double forestMin, double offsetX, double offsetY,
        double centerX, double centerY)
    {
        World = new WorldInfo
        {
            NameDisplay = nameDisplay, NameWorld = nameWorld, Author = author,
            Size        = sizeWorld,  ForestMin = forestMin,
            OffsetX     = offsetX,    OffsetY   = offsetY,
            CenterX     = centerX,    CenterY   = centerY,
        };
        OnWorldInfo?.Invoke(World);

        lock (_geoLock) { _roads.Clear(); _forests.Clear(); _locations.Clear(); _structures.Clear(); _elevations.Clear(); }

        // Save last world name so it auto-loads on next backend start
        _cache.SaveLastWorld(nameWorld);

        // ── Check disk cache first — skip Arma exports if map was already exported ──
        if (_cache.HasCache(nameWorld))
        {
            var cachedRoads     = _cache.LoadRoads(nameWorld);
            var cachedForests   = _cache.LoadForests(nameWorld);
            var cachedLocations = _cache.LoadLocations(nameWorld);

            bool hasStructures = _cache.HasStructuresCache(nameWorld);
            bool hasElevations = _cache.HasElevationsCache(nameWorld);
            var cachedStructures = hasStructures ? _cache.LoadStructures(nameWorld) : [];
            var cachedElevations = hasElevations ? _cache.LoadElevations(nameWorld) : new ElevationsData();

            lock (_geoLock)
            {
                _roads.AddRange(cachedRoads);
                _forests.AddRange(cachedForests.Cells);
                _locations.AddRange(cachedLocations);
                _structures.AddRange(cachedStructures);
                _elevations.AddRange(cachedElevations.Cells);
                _forestSampleSize = cachedForests.SampleSize;
                if (cachedElevations.SampleSize > 0) _elevationSampleSize = cachedElevations.SampleSize;
            }

            // Mark export as loaded from cache
            lock (_exportStatusLock)
            {
                _exportStatus = new ExportStatus
                {
                    Phase = (hasStructures && hasElevations) ? "cached" : "exporting",
                    RoadCount = cachedRoads.Count, RoadsComplete = true,
                    ForestCount = cachedForests.Cells.Count, ForestsComplete = true,
                    LocationCount = cachedLocations.Count, LocationsComplete = true,
                    StructureCount = cachedStructures.Count, StructuresComplete = hasStructures,
                    ElevationCount = cachedElevations.Cells.Count, ElevationsComplete = hasElevations,
                };
            }
            OnExportStatus?.Invoke(GetExportStatus());

            // Broadcast cached data to all connected frontends
            OnRoadsComplete?.Invoke(cachedRoads);
            OnForestsComplete?.Invoke(cachedForests);
            OnLocationsComplete?.Invoke(cachedLocations);
            if (hasStructures) OnStructuresComplete?.Invoke(cachedStructures);
            if (hasElevations) OnElevationsComplete?.Invoke(cachedElevations);

            // Queue any missing exports from Arma
            if (!hasStructures)
            {
                var sr = Math.Sqrt(2) * (sizeWorld / 2.0) * 1.05;
                EnqueueRequest(new ExtensionRequest
                {
                    Command = "structures", Client = "server",
                    Data    = new List<object> { 0.0, centerX, centerY, sr }
                });
            }
            if (!hasElevations)
            {
                _elevationSampleSize = 200.0;
                EnqueueRequest(new ExtensionRequest
                {
                    Command = "elevations", Client = "server",
                    Data    = new List<object> { 0.0, 0.0, 0.0, sizeWorld, sizeWorld, _elevationSampleSize }
                });
            }
            return;
        }

        // No cache — queue Arma exports
        double half         = sizeWorld / 2.0;
        double roadRadius   = Math.Sqrt(2) * half * 1.10;
        double sampleSize   = 150.0;
        double sampleRadius = sampleSize / 2.0;
        _forestSampleSize = sampleSize;

        double elevSampleSize = 200.0;
        _elevationSampleSize  = elevSampleSize;

        double structRadius = Math.Sqrt(2) * half * 1.05;

        EnqueueRequest(new ExtensionRequest
        {
            Command = "roads", Client = "server",
            Data    = new List<object> { 0.0, half, half, roadRadius }
        });
        EnqueueRequest(new ExtensionRequest
        {
            Command = "forests", Client = "server",
            Data    = new List<object> { 0.0, 0.0, 0.0, sizeWorld, sizeWorld,
                                         sampleSize, sampleRadius, 1.0, 5.0, 15.0 }
        });
        EnqueueRequest(new ExtensionRequest
        {
            Command = "locations", Client = "server",
            Data    = new List<object>()
        });
        EnqueueRequest(new ExtensionRequest
        {
            Command = "structures", Client = "server",
            Data    = new List<object> { 0.0, centerX, centerY, structRadius }
        });
        EnqueueRequest(new ExtensionRequest
        {
            Command = "elevations", Client = "server",
            Data    = new List<object> { 0.0, 0.0, 0.0, sizeWorld, sizeWorld, elevSampleSize }
        });

        // Mark export as started
        lock (_exportStatusLock) { _exportStatus = new ExportStatus { Phase = "exporting" }; }
        OnExportStatus?.Invoke(GetExportStatus());
    }

    public void PutRoad(string id, string type, bool foot, bool bridge,
        double posX, double posY,
        double beg1X, double beg1Y, double end2X, double end2Y,
        double width, double length, double dir)
    {
        int count;
        lock (_geoLock)
        {
            _roads.Add(new Road
            {
                Id = id, Type = type, Foot = foot, Bridge = bridge,
                PosX = posX, PosY = posY,
                Beg1X = beg1X, Beg1Y = beg1Y, End2X = end2X, End2Y = end2Y,
                Width = width, Length = length, Dir = dir
            });
            count = _roads.Count;
        }
        if (count % ExportBroadcastInterval == 0)
        {
            lock (_exportStatusLock) { _exportStatus.RoadCount = count; }
            OnExportStatus?.Invoke(GetExportStatus());
        }
    }

    public void PutRoadsComplete()
    {
        List<Road> snapshot;
        lock (_geoLock) snapshot = [.._roads];
        lock (_exportStatusLock)
        {
            _exportStatus.RoadCount = snapshot.Count;
            _exportStatus.RoadsComplete = true;
            CheckAllExportsComplete();
        }
        OnExportStatus?.Invoke(GetExportStatus());
        if (World != null) _cache.SaveRoads(World.NameWorld, snapshot);
        OnRoadsComplete?.Invoke(snapshot);
    }

    public void PutForestCell(double x, double y, int level)
    {
        if (level <= 0) return;   // level 0 = no trees; skip
        int count;
        lock (_geoLock)
        {
            _forests.Add(new ForestCell { X = x, Y = y, Level = level });
            count = _forests.Count;
        }
        if (count % ExportBroadcastInterval == 0)
        {
            lock (_exportStatusLock) { _exportStatus.ForestCount = count; }
            OnExportStatus?.Invoke(GetExportStatus());
        }
    }

    public void PutForestsComplete()
    {
        List<ForestCell> snapshot;
        lock (_geoLock) snapshot = [.._forests];
        lock (_exportStatusLock)
        {
            _exportStatus.ForestCount = snapshot.Count;
            _exportStatus.ForestsComplete = true;
            CheckAllExportsComplete();
        }
        OnExportStatus?.Invoke(GetExportStatus());
        var data = new ForestsData { SampleSize = _forestSampleSize, Cells = snapshot };
        if (World != null) _cache.SaveForests(World.NameWorld, data);
        OnForestsComplete?.Invoke(data);
    }

    public void PutLocation(string type, string name, double posX, double posY,
        double dir, double sizeX, double sizeY)
    {
        int count;
        lock (_geoLock)
        {
            _locations.Add(new MapLocation
            {
                Type = type, Name = name,
                PosX = posX, PosY = posY,
                Dir  = dir,  SizeX = sizeX, SizeY = sizeY
            });
            count = _locations.Count;
        }
        if (count % ExportBroadcastInterval == 0)
        {
            lock (_exportStatusLock) { _exportStatus.LocationCount = count; }
            OnExportStatus?.Invoke(GetExportStatus());
        }
    }

    public void PutLocationsComplete()
    {
        List<MapLocation> snapshot;
        lock (_geoLock) snapshot = [.._locations];
        lock (_exportStatusLock)
        {
            _exportStatus.LocationCount = snapshot.Count;
            _exportStatus.LocationsComplete = true;
            CheckAllExportsComplete();
        }
        OnExportStatus?.Invoke(GetExportStatus());
        if (World != null) _cache.SaveLocations(World.NameWorld, snapshot);
        OnLocationsComplete?.Invoke(snapshot);
    }

    public void PutStructure(string id, string type, string model,
        double posX, double posY, double dir,
        double width, double length, double height)
    {
        int count;
        lock (_geoLock)
        {
            _structures.Add(new MapStructure
            {
                Id = id, Type = type, Model = model,
                PosX = posX, PosY = posY, Dir = dir,
                Width = width, Length = length, Height = height
            });
            count = _structures.Count;
        }
        if (count % ExportBroadcastInterval == 0)
        {
            lock (_exportStatusLock) { _exportStatus.StructureCount = count; }
            OnExportStatus?.Invoke(GetExportStatus());
        }
    }

    public void PutStructuresComplete()
    {
        List<MapStructure> snapshot;
        lock (_geoLock) snapshot = [.._structures];
        lock (_exportStatusLock)
        {
            _exportStatus.StructureCount = snapshot.Count;
            _exportStatus.StructuresComplete = true;
            CheckAllExportsComplete();
        }
        OnExportStatus?.Invoke(GetExportStatus());
        if (World != null) _cache.SaveStructures(World.NameWorld, snapshot);
        OnStructuresComplete?.Invoke(snapshot);
    }

    public void PutElevation(double x, double y, double z)
    {
        int count;
        lock (_geoLock)
        {
            _elevations.Add(new ElevationCell { X = x, Y = y, Z = z });
            count = _elevations.Count;
        }
        if (count % ExportBroadcastInterval == 0)
        {
            lock (_exportStatusLock) { _exportStatus.ElevationCount = count; }
            OnExportStatus?.Invoke(GetExportStatus());
        }
    }

    public void PutElevationsComplete()
    {
        ElevationsData data;
        lock (_geoLock)
            data = new ElevationsData
            {
                SampleSize = _elevationSampleSize,
                WorldSize  = World?.Size ?? 0,
                Cells      = [.._elevations]
            };
        lock (_exportStatusLock)
        {
            _exportStatus.ElevationCount = data.Cells.Count;
            _exportStatus.ElevationsComplete = true;
            CheckAllExportsComplete();
        }
        OnExportStatus?.Invoke(GetExportStatus());
        if (World != null) _cache.SaveElevations(World.NameWorld, data);
        OnElevationsComplete?.Invoke(data);
    }

    /// <summary>Must be called while holding _exportStatusLock.</summary>
    private void CheckAllExportsComplete()
    {
        if (_exportStatus.RoadsComplete && _exportStatus.ForestsComplete
            && _exportStatus.LocationsComplete && _exportStatus.StructuresComplete
            && _exportStatus.ElevationsComplete)
            _exportStatus.Phase = "complete";
    }

    // Accessors so AthenaHub can send stored geometry to freshly-connected clients
    public List<Road>           GetRoads()      { lock (_geoLock) return [.._roads];     }
    public ForestsData           GetForests()    { lock (_geoLock) return new ForestsData { SampleSize = _forestSampleSize, Cells = [.._forests] }; }
    public List<MapLocation>     GetLocations()  { lock (_geoLock) return [.._locations]; }
    public List<MapStructure>    GetStructures()  { lock (_geoLock) return [.._structures]; }
    public ElevationsData        GetElevations()  { lock (_geoLock) return new ElevationsData { SampleSize = _elevationSampleSize, WorldSize = World?.Size ?? 0, Cells = [.._elevations] }; }

    // ── Request queue ────────────────────────────────────────────────────────

    public void EnqueueRequest(ExtensionRequest req) => _requests.Enqueue(req);

    public bool TryDequeueRequest(out ExtensionRequest? req) => _requests.TryDequeue(out req);

    public int PendingRequestCount => _requests.Count;

    // ── Server settings ────────────────────────────────────────────────────

    public void UpdateSettings(ServerSettings settings)
    {
        Settings = settings;
        OnSettingsChanged?.Invoke(settings);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private GameFrame BuildFrame() => new()
    {
        Mission  = Mission,
        World    = World,
        Time     = GameTime,
        Groups   = new Dictionary<string, Group>(_groups),
        Units    = new Dictionary<string, Unit>(_units),
        Vehicles = new Dictionary<string, Vehicle>(_vehicles),
    };

    public GameFrame GetCurrentFrame() => BuildFrame();

    /// <summary>
    /// Load cached world data from disk on startup so the map renders without the game.
    /// </summary>
    private void LoadCachedWorld()
    {
        var lastWorld = _cache.LoadLastWorld() ?? _cache.FindAnyCachedWorld();
        if (lastWorld == null || !_cache.HasCache(lastWorld))
        {
            _log.LogInformation("No cached world data found on disk");
            return;
        }

        // Look up worldSize from the static Athena Desktop cache
        var info = _staticCache.GetMapInfoAsync(lastWorld).GetAwaiter().GetResult();
        double worldSize = info?.WorldSize ?? 30720;

        World = new WorldInfo
        {
            NameDisplay = lastWorld,
            NameWorld   = lastWorld,
            Size        = worldSize,
        };

        var cachedRoads     = _cache.LoadRoads(lastWorld);
        var cachedForests   = _cache.LoadForests(lastWorld);
        var cachedLocations = _cache.LoadLocations(lastWorld);
        var cachedStructures = _cache.HasStructuresCache(lastWorld) ? _cache.LoadStructures(lastWorld) : [];
        var cachedElevations = _cache.HasElevationsCache(lastWorld) ? _cache.LoadElevations(lastWorld) : new ElevationsData();

        lock (_geoLock)
        {
            _roads.AddRange(cachedRoads);
            _forests.AddRange(cachedForests.Cells);
            _locations.AddRange(cachedLocations);
            _structures.AddRange(cachedStructures);
            _elevations.AddRange(cachedElevations.Cells);
            _forestSampleSize = cachedForests.SampleSize;
            if (cachedElevations.SampleSize > 0) _elevationSampleSize = cachedElevations.SampleSize;
        }

        // Set export status so frontend knows data is from cache
        lock (_exportStatusLock)
        {
            _exportStatus = new ExportStatus
            {
                Phase            = "cached",
                RoadCount        = cachedRoads.Count,      RoadsComplete      = true,
                ForestCount      = cachedForests.Cells.Count, ForestsComplete = true,
                LocationCount    = cachedLocations.Count,  LocationsComplete  = true,
                StructureCount   = cachedStructures.Count, StructuresComplete = cachedStructures.Count > 0,
                ElevationCount   = cachedElevations.Cells.Count, ElevationsComplete = cachedElevations.Cells.Count > 0,
            };
        }

        _log.LogInformation("Loaded cached world '{World}' (size={Size}): {Roads} roads, {Forests} forests, {Locations} locations, {Structures} structures, {Elevations} elevations",
            lastWorld, worldSize, cachedRoads.Count, cachedForests.Cells.Count, cachedLocations.Count, cachedStructures.Count, cachedElevations.Cells.Count);
    }
}
