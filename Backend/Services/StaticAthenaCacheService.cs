using System.Text.Json;
using System.Text.RegularExpressions;
using AthenaRemastered.Server.Models;
using SkiaSharp;

namespace AthenaRemastered.Server.Services;

/// <summary>
/// Lazily loads pre-computed world geometry from the original Athena Desktop
/// cache at %USERPROFILE%\Documents\Athena\Maps\{worldName}\.
///
/// Files produced by Athena Desktop:
///   Map.txt          — JSON: { WorldSize, WorldCell, MaxZ, MinZ, ... }
///   Height\Z{n}.txt  — JSON: { Z, PointGroups: [["gx,gy",...], ...] }
///                            grid coords × WorldCell = world metres
///   Trees.txt        — JSON: [{ CanvasX, CanvasY }, ...]
///                            CanvasX = worldX, CanvasY = worldSize - worldY
///
/// Contour levels are parsed on-demand and cached per level so we don't load
/// 15+ MB of contours into RAM at startup.
/// </summary>
public class StaticAthenaCacheService
{
    private readonly ILogger<StaticAthenaCacheService> _log;

    // meta cache — tiny, one per world
    private readonly Dictionary<string, StaticMapInfo> _metaCache = new();

    // contour cache — one ContourLevel per (world, z)
    private readonly Dictionary<(string, int), ContourLevel> _contourCache = new();

    // tree cache — per world
    private readonly Dictionary<string, double[][]> _treeCache = new();

    // land mask cache — per world
    private readonly Dictionary<string, (int W, int H, double WS, byte[] Mask)> _landMaskCache = new();

    // pre-rendered PNG image caches — per world
    private readonly Dictionary<string, byte[]> _treesImageCache   = new();
    private readonly Dictionary<string, byte[]> _objectsImageCache = new();

    private readonly SemaphoreSlim _lock = new(1, 1);

    public static readonly string AthenaBase = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "Athena", "Maps");

    public StaticAthenaCacheService(ILogger<StaticAthenaCacheService> log) => _log = log;

    // ── Public API ───────────────────────────────────────────────────────────

    /// Returns metadata for a world, or null if no Athena cache folder exists.
    public async Task<StaticMapInfo?> GetMapInfoAsync(string worldName)
    {
        var key = worldName.ToLowerInvariant();
        if (_metaCache.TryGetValue(key, out var hit)) return hit;

        await _lock.WaitAsync();
        try
        {
            if (_metaCache.TryGetValue(key, out hit)) return hit;

            var dir = FindWorldDir(worldName);
            if (dir == null) { _log.LogInformation("No Athena cache for '{World}'", worldName); return null; }

            var info = await ReadMapInfoAsync(dir, worldName);
            _metaCache[key] = info;
            _log.LogInformation("Athena cache for '{World}': {File}", worldName, dir);
            return info;
        }
        finally { _lock.Release(); }
    }

    /// Returns one contour level (parsed + cached), or null if not available.
    public async Task<ContourLevel?> GetContourAsync(string worldName, int z)
    {
        var key = (worldName.ToLowerInvariant(), z);
        if (_contourCache.TryGetValue(key, out var hit)) return hit;

        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.AvailableZ.Contains(z)) return null;

        await _lock.WaitAsync();
        try
        {
            if (_contourCache.TryGetValue(key, out hit)) return hit;

            var file = Path.Combine(FindWorldDir(worldName)!, "Height", $"Z{z}.txt");
            var level = await ParseContourFileAsync(file, z, info.CellSize, info.WorldSize);
            _contourCache[key] = level;
            return level;
        }
        finally { _lock.Release(); }
    }

    /// Returns a coarse land/ocean mask derived from scanline-rasterising the Z=0 (sea-level)
    /// coastline contour.  gridSize×gridSize cells, 0=ocean, 1=land.
    /// Returns null when no Athena cache exists or the world has no Z=0 contour.
    public async Task<(int W, int H, double WS, byte[] Mask)?> GetLandMaskAsync(
        string worldName, int gridSize = 128)
    {
        var key = worldName.ToLowerInvariant();
        if (_landMaskCache.TryGetValue(key, out var hit)) return hit;

        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.AvailableZ.Contains(0)) return null;

        var z0 = await GetContourAsync(worldName, 0);
        if (z0 == null || z0.Polylines.Count == 0) return null;

        await _lock.WaitAsync();
        try
        {
            if (_landMaskCache.TryGetValue(key, out hit)) return hit;

            int W = gridSize, H = gridSize;
            double ws = info.WorldSize;
            double cellW = ws / W;
            double cellH = ws / H;
            var mask = new byte[W * H];  // 0=ocean, 1=land

            // Pre-flatten all Z=0 coastline segments to avoid repeated allocation
            var segments = new List<(double x1, double y1, double x2, double y2)>(
                z0.Polylines.Sum(p => Math.Max(0, p.Points.Count - 1)));
            foreach (var poly in z0.Polylines)
            {
                var pts = poly.Points;
                for (int i = 0; i < pts.Count - 1; i++)
                    segments.Add((pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
            }

            // Scan-line rasterisation.  PNG row 0 = image top = map north (y near worldSize).
            // Starting from x=0 (left edge) = ocean → even-odd crossings determine land/ocean.
            for (int row = 0; row < H; row++)
            {
                double y = ws - (row + 0.5) * cellH;  // flip: image top ↔ map north

                // Collect X intersections of coastline at scan-line y
                var intersections = new List<double>();
                foreach (var (x1, y1, x2, y2) in segments)
                {
                    if ((y1 <= y && y < y2) || (y2 <= y && y < y1))
                    {
                        double t = (y - y1) / (y2 - y1);
                        intersections.Add(x1 + t * (x2 - x1));
                    }
                }
                intersections.Sort();

                // Scan left-to-right; odd intersection count to the left = inside = land
                int ix = 0;
                for (int col = 0; col < W; col++)
                {
                    double x = (col + 0.5) * cellW;
                    while (ix < intersections.Count && intersections[ix] < x) ix++;
                    if (ix % 2 == 1) mask[row * W + col] = 1;
                }
            }

            var result = (W, H, ws, mask);
            _landMaskCache[key] = result;
            _log.LogInformation("Built {W}×{H} land mask for '{World}'", W, H, worldName);
            return result;
        }
        finally { _lock.Release(); }
    }

    /// Returns all tree positions as flat [[worldX, worldY]] pairs, or null.
    public async Task<double[][]?> GetTreesAsync(string worldName)
    {
        var key = worldName.ToLowerInvariant();
        if (_treeCache.TryGetValue(key, out var hit)) return hit;

        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.HasTrees) return null;

        await _lock.WaitAsync();
        try
        {
            if (_treeCache.TryGetValue(key, out hit)) return hit;

            var file = Path.Combine(FindWorldDir(worldName)!, "Trees.txt");
            var trees = await ParseTreesAsync(file, info.WorldSize);
            _treeCache[key] = trees;
            _log.LogInformation("  Loaded {Count} trees for '{World}'", trees.Length, worldName);
            return trees;
        }
        finally { _lock.Release(); }
    }

    /// Renders Trees.txt to a transparent 4096×4096 PNG and caches it.  Returns null if no data.
    public async Task<byte[]?> GetTreesImageAsync(string worldName)
    {
        var key = worldName.ToLowerInvariant();
        if (_treesImageCache.TryGetValue(key, out var cached)) return cached;

        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.HasTrees) return null;

        var file  = Path.Combine(FindWorldDir(worldName)!, "Trees.txt");
        var bytes = await RenderTreesImageAsync(file, info.WorldSize);

        await _lock.WaitAsync();
        try { _treesImageCache[key] = bytes; }
        finally { _lock.Release(); }
        return bytes;
    }

    /// Renders Objects.txt to a transparent 4096×4096 PNG and caches it.  Returns null if no data.
    public async Task<byte[]?> GetObjectsImageAsync(string worldName)
    {
        var key = worldName.ToLowerInvariant();
        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.HasObjects) return null;

        var file  = Path.Combine(FindWorldDir(worldName)!, "Objects.txt");
        var bytes = await RenderObjectsImageAsync(file, info.WorldSize);
        return bytes;
    }

    /// Returns raw Objects.txt content as a byte array (already JSON).
    /// The frontend renders these as vector shapes for infinite sharpness.
    public async Task<byte[]?> GetObjectsDataAsync(string worldName)
    {
        var info = await GetMapInfoAsync(worldName);
        if (info == null || !info.HasObjects) return null;
        var file = Path.Combine(FindWorldDir(worldName)!, "Objects.txt");
        if (!File.Exists(file)) return null;
        return await File.ReadAllBytesAsync(file);
    }

    // ── Image renderers ──────────────────────────────────────────────────────

    private static async Task<byte[]> RenderTreesImageAsync(string file, double worldSize)
    {
        const int IMG = 6144;
        float scale = IMG / (float)worldSize;

        var imgInfo = new SKImageInfo(IMG, IMG, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(imgInfo);
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);

        using var paint = new SKPaint
        {
            Color       = new SKColor(188, 222, 180, 255),  // #BCDEB4 fill (Bus light)
            IsAntialias = false,
            Style       = SKPaintStyle.Fill,
        };

        try
        {
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (!el.TryGetProperty("CanvasX", out var cx)) continue;
                if (!el.TryGetProperty("CanvasY", out var cy)) continue;
                float px = cx.GetSingle() * scale;
                float py = cy.GetSingle() * scale;
                // Trees.txt only stores positions (no species/size metadata), so we
                // approximate small/large circles with a deterministic split.
                int hx = (int)(px * 10f);
                int hy = (int)(py * 10f);
                int h  = (hx * 73856093) ^ (hy * 19349663);
                float radius = ((h & 7) == 0) ? 1.4f : 0.8f; // ~12.5% large markers
                canvas.DrawCircle(px, py, radius, paint);
            }
        }
        catch { /* return whatever we have */ }

        using var image = surface.Snapshot();
        using var data  = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private sealed record ObjEntry(string Model, double CanvasX, double CanvasY, double Width, double Length, double Dir);

    private static bool IsLinearObject(string model, double minDim, double aspect)
    {
        if (minDim < 1.2 || aspect >= 5.0) return true;
        var m = model.ToLowerInvariant();
        return m.Contains("fence") || m.Contains("wall") || m.Contains("wire") ||
               m.Contains("barrier") || m.Contains("pipe") || m.Contains("pole") ||
               m.Contains("rail") || m.Contains("net_") || m.Contains("net-") ||
               m.Contains("columnwire") || m.Contains("powerline");
    }

    private static bool IsBuildingObject(string model, double area)
    {
        var m = model.ToLowerInvariant();
        if (m.Contains("house") || m.Contains("shed") || m.Contains("garage") ||
            m.Contains("church") || m.Contains("shop") || m.Contains("hangar") ||
            m.Contains("hospital") || m.Contains("terminal") || m.Contains("office") ||
            m.Contains("barracks") || m.Contains("tower") || m.Contains("warehouse"))
            return true;
        return area >= 55.0;
    }

    private static async Task<byte[]> RenderObjectsImageAsync(string file, double worldSize)
    {
        const int IMG = 6144;
        float scale = IMG / (float)worldSize;

        // Parse
        var objects = new List<ObjEntry>(120_000);
        try
        {
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                    JsonElement p;
                string model = el.TryGetProperty("Model", out p) ? (p.GetString() ?? string.Empty) : string.Empty;
                double cx  = el.TryGetProperty("CanvasX", out p) ? p.GetDouble() : 0;
                double cy  = el.TryGetProperty("CanvasY", out p)     ? p.GetDouble() : 0;
                double w   = el.TryGetProperty("Width",   out p)     ? GetDouble(p)  : 2;
                double h   = el.TryGetProperty("Length",  out p)     ? GetDouble(p)  : 2;
                double dir = el.TryGetProperty("Dir",     out p)     ? GetDouble(p)  : 0;
                objects.Add(new ObjEntry(model, cx, cy, w, h, dir));
            }
        }
        catch { /* render whatever we have */ }

        // ── Runway detection ─────────────────────────────────────────────
        // Bus's trick: find runway_edgelight_blue objects, cluster by proximity
        // (multiple airports), compute convex hull per cluster, fill grey.
        var edgeLights = objects
            .Where(o => o.Model.Contains("runway_edgelight_blue", StringComparison.OrdinalIgnoreCase))
            .Select(o => (o.CanvasX, o.CanvasY))
            .ToList();
        var runwayHulls = ClusterAndHull(edgeLights, clusterRadius: 100.0);

        // Render
        var imgInfo = new SKImageInfo(IMG, IMG, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(imgInfo);
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);

        // Draw runway surfaces FIRST (underneath everything else)
        if (runwayHulls.Count > 0)
        {
            using var runwayPaint = new SKPaint
            {
                Color       = new SKColor(160, 160, 160, 255),  // #A0A0A0 grey tarmac
                IsAntialias = true,
                Style       = SKPaintStyle.Fill,
            };
            foreach (var hull in runwayHulls)
            {
                using var path = new SKPath();
                path.MoveTo((float)(hull[0].X * scale), (float)(hull[0].Y * scale));
                for (int i = 1; i < hull.Count; i++)
                    path.LineTo((float)(hull[i].X * scale), (float)(hull[i].Y * scale));
                path.Close();
                canvas.DrawPath(path, runwayPaint);
            }
        }

        // Paint setup — model-aware split between infrastructure lines and building footprints.
        var lineHalo   = new SKColor(176, 188, 200, 120);
        var strokeGrey = new SKColor(78, 90, 106, 238);
        var fillGrey   = new SKColor(108, 120, 134, 180);
        using var lineUnderPaint = new SKPaint
        {
            Color       = lineHalo,
            IsAntialias = true,
            Style       = SKPaintStyle.Stroke,
            StrokeWidth = 1.9f,
            StrokeCap   = SKStrokeCap.Round,
        };
        using var linePaint = new SKPaint
        {
            Color       = strokeGrey,
            IsAntialias = true,
            Style       = SKPaintStyle.Stroke,
            StrokeWidth = 1.1f,
            StrokeCap   = SKStrokeCap.Round,
        };
        using var buildingFillPaint = new SKPaint
        {
            Color       = fillGrey,
            IsAntialias = true,
            Style       = SKPaintStyle.Fill,
        };
        using var buildingStrokePaint = new SKPaint
        {
            Color       = strokeGrey,
            IsAntialias = true,
            Style       = SKPaintStyle.Stroke,
            StrokeWidth = 1.1f,
            StrokeJoin  = SKStrokeJoin.Miter,
        };

        foreach (var obj in objects)
        {
            float cx = MathF.Round((float)(obj.CanvasX * scale)) + 0.5f;
            float cy = MathF.Round((float)(obj.CanvasY * scale)) + 0.5f;
            // Slightly shrink footprint to prevent adjacent objects visually fusing into blocks.
            float pw = (float)(obj.Width  * scale * 0.88);
            float ph = (float)(obj.Length * scale * 0.88);

            double minDim = Math.Min(obj.Width, obj.Length);
            double maxDim = Math.Max(obj.Width, obj.Length);
            double area   = obj.Width * obj.Length;
            double aspect = maxDim / Math.Max(minDim, 0.01);

            bool isLine = IsLinearObject(obj.Model, minDim, aspect);
            bool isBuilding = !isLine && IsBuildingObject(obj.Model, area);

            canvas.Save();
            canvas.Translate(cx, cy);
            if (obj.Dir != 0) canvas.RotateDegrees((float)obj.Dir);

            if (isLine)
            {
                float major = obj.Width >= obj.Length ? pw : ph;
                float halfLong = Math.Max(0.5f, major / 2f);
                if (obj.Width >= obj.Length)
                {
                    canvas.DrawLine(-halfLong, 0, halfLong, 0, lineUnderPaint);
                    canvas.DrawLine(-halfLong, 0, halfLong, 0, linePaint);
                }
                else
                {
                    canvas.DrawLine(0, -halfLong, 0, halfLong, lineUnderPaint);
                    canvas.DrawLine(0, -halfLong, 0, halfLong, linePaint);
                }
            }
            else if (isBuilding)
            {
                float bw = Math.Max(1.2f, pw);
                float bh = Math.Max(1.2f, ph);
                var rect = new SKRect(-bw / 2, -bh / 2, bw / 2, bh / 2);
                canvas.DrawRect(rect, buildingFillPaint);
                canvas.DrawRect(rect, buildingStrokePaint);
            }
            else
            {
                float ow = Math.Max(1.0f, pw);
                float oh = Math.Max(1.0f, ph);
                canvas.DrawRect(new SKRect(-ow / 2, -oh / 2, ow / 2, oh / 2), buildingStrokePaint);
            }

            canvas.Restore();
        }

        using var image = surface.Snapshot();
        using var data  = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static double GetDouble(JsonElement el) =>
        el.ValueKind == JsonValueKind.Number ? el.GetDouble() :
        el.ValueKind == JsonValueKind.String && double.TryParse(el.GetString(),
            System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;

    // ── Runway clustering + convex hull ──────────────────────────────────────

    private readonly record struct Point2D(double X, double Y);

    /// Clusters points by proximity (flood-fill, O(n²) — fine for ~300 edge lights)
    /// and returns a convex hull for each cluster.
    private static List<List<Point2D>> ClusterAndHull(
        List<(double X, double Y)> points, double clusterRadius)
    {
        if (points.Count == 0) return [];

        var r2 = clusterRadius * clusterRadius;
        int n = points.Count;
        var visited = new bool[n];
        var clusters = new List<List<Point2D>>();

        for (int i = 0; i < n; i++)
        {
            if (visited[i]) continue;
            visited[i] = true;
            var cluster = new List<Point2D> { new(points[i].X, points[i].Y) };
            var queue = new Queue<int>();
            queue.Enqueue(i);

            while (queue.Count > 0)
            {
                int ci = queue.Dequeue();
                var (cx, cy) = points[ci];
                for (int j = 0; j < n; j++)
                {
                    if (visited[j]) continue;
                    double dx = points[j].X - cx;
                    double dy = points[j].Y - cy;
                    if (dx * dx + dy * dy <= r2)
                    {
                        visited[j] = true;
                        cluster.Add(new(points[j].X, points[j].Y));
                        queue.Enqueue(j);
                    }
                }
            }

            if (cluster.Count >= 3)
                clusters.Add(ConvexHull(cluster));
        }

        return clusters;
    }

    /// Andrew's monotone chain convex hull algorithm — O(n log n).
    private static List<Point2D> ConvexHull(List<Point2D> pts)
    {
        pts.Sort((a, b) => a.X != b.X ? a.X.CompareTo(b.X) : a.Y.CompareTo(b.Y));
        int n = pts.Count;
        if (n < 3) return pts;

        var hull = new Point2D[2 * n];
        int k = 0;

        // Lower hull
        for (int i = 0; i < n; i++)
        {
            while (k >= 2 && Cross(hull[k - 2], hull[k - 1], pts[i]) <= 0) k--;
            hull[k++] = pts[i];
        }

        // Upper hull
        int lower = k + 1;
        for (int i = n - 2; i >= 0; i--)
        {
            while (k >= lower && Cross(hull[k - 2], hull[k - 1], pts[i]) <= 0) k--;
            hull[k++] = pts[i];
        }

        return hull[..(k - 1)].ToList();  // exclude duplicate last point
    }

    private static double Cross(Point2D o, Point2D a, Point2D b) =>
        (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);

    // ── Discovery ────────────────────────────────────────────────────────────

    public string? FindWorldDir(string worldName)
    {
        if (!Directory.Exists(AthenaBase)) return null;
        var exact = Path.Combine(AthenaBase, worldName);
        if (Directory.Exists(exact)) return exact;
        return Directory.EnumerateDirectories(AthenaBase)
            .FirstOrDefault(d => string.Equals(Path.GetFileName(d), worldName,
                StringComparison.OrdinalIgnoreCase));
    }

    // ── Parsers ──────────────────────────────────────────────────────────────

    private static readonly Regex ZRegex = new(@"Z(-?\d+)\.txt$", RegexOptions.IgnoreCase);

    private async Task<StaticMapInfo> ReadMapInfoAsync(string dir, string worldName)
    {
        var info = new StaticMapInfo { WorldName = worldName, CellSize = 8 };

        var mapFile = Path.Combine(dir, "Map.txt");
        if (File.Exists(mapFile))
        {
            try
            {
                using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(mapFile));
                var r = doc.RootElement;
                if (r.TryGetProperty("WorldCell",  out var wc)) info.CellSize  = wc.GetInt32();
                if (r.TryGetProperty("WorldSize",  out var ws)) info.WorldSize  = ws.GetDouble();
                if (r.TryGetProperty("MaxZ",       out var mxz)) info.MaxZ     = mxz.GetInt32();
                if (r.TryGetProperty("MinZ",       out var mnz)) info.MinZ     = mnz.GetInt32();
            }
            catch (Exception ex) { _log.LogWarning(ex, "Failed to parse Map.txt for '{World}'", worldName); }
        }

        // Enumerate available contour elevations from Height\Z*.txt filenames
        var heightDir = Path.Combine(dir, "Height");
        if (Directory.Exists(heightDir))
        {
            info.AvailableZ = Directory.GetFiles(heightDir, "Z*.txt")
                .Select(f => ZRegex.Match(Path.GetFileName(f)))
                .Where(m => m.Success)
                .Select(m => int.Parse(m.Groups[1].Value))
                .OrderBy(z => z)
                .ToList();
        }

        info.HasTrees   = File.Exists(Path.Combine(dir, "Trees.txt"));
        info.HasObjects = File.Exists(Path.Combine(dir, "Objects.txt"));
        return info;
    }

    private async Task<ContourLevel> ParseContourFileAsync(string file, int z, int cellSize, double worldSize)
    {
        var level = new ContourLevel { Z = z, IsMajor = z == 0 || z % 20 == 0 };

        try
        {
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
            if (!doc.RootElement.TryGetProperty("PointGroups", out var groups))
                return level;

            foreach (var group in groups.EnumerateArray())
            {
                var poly = new ContourPolyline();
                foreach (var pt in group.EnumerateArray())
                {
                    var s = pt.GetString();
                    if (s == null) continue;
                    var comma = s.IndexOf(',');
                    if (comma < 0) continue;
                    if (double.TryParse(s.AsSpan(0, comma),       out var gx) &&
                        double.TryParse(s.AsSpan(comma + 1),      out var gy))
                    {
                        // Height/Z*.txt uses grid Y from canvas-space (top-down). Convert to
                        // world-space Y (south-up) so contours align with runtime map exports.
                        var wx = gx * cellSize;
                        var wy = worldSize - (gy * cellSize);
                        poly.Points.Add([wx, wy]);
                    }
                }
                if (poly.Points.Count >= 2) level.Polylines.Add(poly);
            }
        }
        catch (Exception ex) { _log.LogWarning(ex, "Failed to parse contour file {File}", file); }

        return level;
    }

    private sealed record AthenaTreeRaw(double CanvasX, double CanvasY);

    private async Task<double[][]> ParseTreesAsync(string file, double worldSize)
    {
        try
        {
            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return [];

            var list = new List<double[]>(doc.RootElement.GetArrayLength());
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (!el.TryGetProperty("CanvasX", out var cx)) continue;
                if (!el.TryGetProperty("CanvasY", out var cy)) continue;
                double wx = cx.GetDouble();
                double wy = worldSize - cy.GetDouble();   // un-flip the Y axis
                list.Add([wx, wy]);
            }
            return [..list];
        }
        catch (Exception ex) { _log.LogWarning(ex, "Failed to parse Trees.txt"); return []; }
    }
}

/// Metadata returned from the /api/staticmap/{world} endpoint
public class StaticMapInfo
{
    public string      WorldName  { get; set; } = "";
    public double      WorldSize  { get; set; }
    public int         CellSize   { get; set; }   // metres per grid cell
    public int         MaxZ       { get; set; }
    public int         MinZ       { get; set; }
    public List<int>   AvailableZ { get; set; } = [];
    public bool        HasTrees   { get; set; }
    public bool        HasObjects { get; set; }
}
