using Microsoft.AspNetCore.Mvc;
using AthenaRemastered.Server.Services;

namespace AthenaRemastered.Server.Controllers;

/// <summary>
/// Serves pre-computed Athena Desktop map geometry (contours, trees) via REST.
/// Using REST rather than SignalR because individual contour files can exceed
/// SignalR's default 32 KB message size limit; HTTP gzip compression cuts the
/// wire size dramatically for these repetitive JSON arrays.
/// </summary>
[ApiController]
[Route("api/staticmap")]
public class StaticMapController(StaticAthenaCacheService cache) : ControllerBase
{
    /// GET /api/staticmap/{worldName}
    /// Returns metadata: cellSize, worldSize, min/max elevation, available Z levels.
    [HttpGet("{worldName}")]
    public async Task<IActionResult> GetInfo(string worldName)
    {
        var info = await cache.GetMapInfoAsync(worldName);
        if (info == null) return NotFound(new { error = $"No Athena cache found for world '{worldName}'" });
        return Ok(info);
    }

    /// GET /api/staticmap/{worldName}/contours/{z}
    /// Returns one elevation level as compact flat arrays:
    ///   { "z": 20, "major": true, "lines": [[x0,y0,x1,y1,...], ...] }
    /// Each "line" is a flat array of alternating worldX/worldY metre values.
    [HttpGet("{worldName}/contours/{z:int}")]
    public async Task<IActionResult> GetContour(string worldName, int z)
    {
        var level = await cache.GetContourAsync(worldName, z);
        if (level == null) return NotFound(new { error = $"Contour Z={z} not available for '{worldName}'" });

        // Flatten to compact wire format: [[x0,y0,x1,y1,...], ...]
        var lines = level.Polylines.Select(p =>
            p.Points.SelectMany(pt => pt).ToArray()
        ).ToArray();

        return Ok(new { z = level.Z, major = level.IsMajor, lines });
    }

    /// GET /api/staticmap/{worldName}/trees
    /// Returns all tree positions as [[worldX, worldY], ...] in world metres.
    [HttpGet("{worldName}/trees")]
    public async Task<IActionResult> GetTrees(string worldName)
    {
        var trees = await cache.GetTreesAsync(worldName);
        if (trees == null) return NotFound(new { error = $"No trees data for '{worldName}'" });
        return Ok(trees);
    }

    /// GET /api/staticmap/{worldName}/landmask?gridSize=128
    /// Returns a coarse land/ocean mask: { width, height, worldSize, mask (base64 byte array) }
    /// where mask[row*width+col] = 1 (land) or 0 (ocean), row 0 = north (image top).
    [HttpGet("{worldName}/landmask")]
    public async Task<IActionResult> GetLandMask(string worldName, [FromQuery] int gridSize = 128)
    {
        var result = await cache.GetLandMaskAsync(worldName, gridSize);
        if (result == null) return NotFound(new { error = $"No land mask available for '{worldName}'" });
        return Ok(new {
            width     = result.Value.W,
            height    = result.Value.H,
            worldSize = result.Value.WS,
            mask      = Convert.ToBase64String(result.Value.Mask),
        });
    }

    /// GET /api/staticmap/{worldName}/trees-image
    /// Returns a 4096×4096 transparent PNG with every tree as a 3×3 green dot.
    /// Rendered server-side from Trees.txt; cached after first request.
    [HttpGet("{worldName}/trees-image")]
    public async Task<IActionResult> GetTreesImage(string worldName)
    {
        var bytes = await cache.GetTreesImageAsync(worldName);
        if (bytes == null) return NotFound(new { error = $"No trees data for '{worldName}'" });
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return File(bytes, "image/png");
    }

    /// GET /api/staticmap/{worldName}/objects-image
    /// Returns a 4096×4096 transparent PNG with every object (building/fence/etc.)
    /// rendered as a rotated tan rectangle using its Width/Length/Dir.
    /// Rendered server-side from Objects.txt; cached after first request (~5–10 s on first call).
    [HttpGet("{worldName}/objects-image")]
    public async Task<IActionResult> GetObjectsImage(string worldName)
    {
        var bytes = await cache.GetObjectsImageAsync(worldName);
        if (bytes == null) return NotFound(new { error = $"No objects data for '{worldName}'" });
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return File(bytes, "image/png");
    }

    /// GET /api/staticmap/{worldName}/objects-data
    /// Returns raw Objects.txt JSON for vector rendering on the frontend.
    [HttpGet("{worldName}/objects-data")]
    public async Task<IActionResult> GetObjectsData(string worldName)
    {
        var bytes = await cache.GetObjectsDataAsync(worldName);
        if (bytes == null) return NotFound(new { error = $"No objects data for '{worldName}'" });
        return File(bytes, "application/json");
    }
}
