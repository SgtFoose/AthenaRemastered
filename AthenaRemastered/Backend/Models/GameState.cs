using System.Collections.Concurrent;

namespace AthenaRemastered.Server.Models;

// ── Mission ──────────────────────────────────────────────────────────────────

public class Mission
{
    public string Name        { get; set; } = "";
    public string Author      { get; set; } = "";
    public string World       { get; set; } = "";
    public string Description { get; set; } = "";
    public bool   IsMulti     { get; set; }
    public string Player      { get; set; } = "";
    public string SteamId     { get; set; } = "";
}

// ── Time ─────────────────────────────────────────────────────────────────────

public class GameTime
{
    public int Year   { get; set; }
    public int Month  { get; set; }
    public int Day    { get; set; }
    public int Hour   { get; set; }
    public int Minute { get; set; }
}

// ── Group ────────────────────────────────────────────────────────────────────

public class Group
{
    public string Id       { get; set; } = "";
    public string LeaderId { get; set; } = "";
    public string Name     { get; set; } = "";
    public double WpX      { get; set; }
    public double WpY      { get; set; }
    public string WpType   { get; set; } = "";
}

// ── Unit ─────────────────────────────────────────────────────────────────────

public class Unit
{
    public string Id              { get; set; } = "";
    public string GroupId         { get; set; } = "";
    public string LeaderId        { get; set; } = "";
    public string VehicleId       { get; set; } = "";
    public string PlayerName      { get; set; } = "";
    public string SessionId       { get; set; } = "";
    public string SteamId         { get; set; } = "";
    public string Name            { get; set; } = "";
    public string Faction         { get; set; } = "";
    public string Side            { get; set; } = "";
    public string Team            { get; set; } = "";
    public string Type            { get; set; } = "";
    public string Rank            { get; set; } = "";
    public bool   HasMediKit      { get; set; }
    public string WeaponPrimary   { get; set; } = "";
    public string WeaponSecondary { get; set; } = "";
    public string WeaponHandgun   { get; set; } = "";

    // live position — updated every frame
    public double PosX  { get; set; }
    public double PosY  { get; set; }
    public double PosZ  { get; set; }
    public double Dir   { get; set; }
    public double Speed { get; set; }
}

// ── Vehicle ──────────────────────────────────────────────────────────────────

public class CrewMember
{
    public string UnitId { get; set; } = "";
    public string Role   { get; set; } = "";
}

public class Vehicle
{
    public string          Id    { get; set; } = "";
    public string          Class { get; set; } = "";
    public List<CrewMember> Crew { get; set; } = [];

    public double PosX  { get; set; }
    public double PosY  { get; set; }
    public double PosZ  { get; set; }
    public double Dir   { get; set; }
    public double Speed { get; set; }
}

// ── Events ───────────────────────────────────────────────────────────────────

public class FiredEvent
{
    public string UnitId     { get; set; } = "";
    public string VehicleId  { get; set; } = "";
    public string Weapon     { get; set; } = "";
    public string Muzzle     { get; set; } = "";
    public string Mode       { get; set; } = "";
    public string Ammo       { get; set; } = "";
    public string Magazine   { get; set; } = "";
    public string Projectile { get; set; } = "";
    public DateTime At       { get; set; } = DateTime.UtcNow;
}

public class KilledEvent
{
    public string Victim     { get; set; } = "";
    public string Killer     { get; set; } = "";
    public string Instigator { get; set; } = "";
    public DateTime At       { get; set; } = DateTime.UtcNow;
}

// ── World ────────────────────────────────────────────────────────────────────

public class WorldInfo
{
    public string NameDisplay { get; set; } = "";
    public string NameWorld   { get; set; } = "";
    public string Author      { get; set; } = "";
    public double Size        { get; set; }
    public double ForestMin   { get; set; }
    public double OffsetX     { get; set; }
    public double OffsetY     { get; set; }
    public double CenterX     { get; set; }
    public double CenterY     { get; set; }
}

// Road segment exported from Arma's nearRoads / getRoadInfo
public class Road
{
    public string Id      { get; set; } = "";   // getObjectId
    public string Type    { get; set; } = "";   // "", "main road", "track", "hide", etc.
    public bool   Foot    { get; set; }
    public bool   Bridge  { get; set; }
    public double PosX    { get; set; }         // object centre X (metres) — from getPosASL
    public double PosY    { get; set; }         // object centre Y (metres) — from getPosASL
    public double Beg1X   { get; set; }         // start X (metres)
    public double Beg1Y   { get; set; }         // start Y (metres)
    public double End2X   { get; set; }         // end X (metres)
    public double End2Y   { get; set; }         // end Y (metres)
    public double Width   { get; set; }         // metres (set for "hide"/runway type)
    public double Length  { get; set; }         // metres (set for "hide"/runway type)
    public double Dir     { get; set; }
}

// Forest density cell on a sampled grid
public class ForestCell
{
    public double X     { get; set; }
    public double Y     { get; set; }
    public int    Level { get; set; }   // 1-3 (0 = no trees; excluded before storing)
}

// Named location (town, village, etc.) from Arma's cfgLocationTypes
public class MapLocation
{
    public string Type  { get; set; } = "";   // cfgLocationType class e.g. "NameCity"
    public string Name  { get; set; } = "";   // location text label
    public double PosX  { get; set; }
    public double PosY  { get; set; }
    public double Dir   { get; set; }
    public double SizeX { get; set; }
    public double SizeY { get; set; }
}

// Terrain structure / building exported from nearestTerrainObjects
public class MapStructure
{
    public string Id       { get; set; } = "";  // getObjectId
    public string Type     { get; set; } = "";  // e.g. "house", "fence", "church"
    public string Model    { get; set; } = "";  // model filename (getModelInfo[0])
    public double PosX     { get; set; }
    public double PosY     { get; set; }
    public double Dir      { get; set; }         // degrees
    public double Width    { get; set; }         // bounding box X (metres)
    public double Length   { get; set; }         // bounding box Y (metres)
    public double Height   { get; set; }         // bounding box Z (metres)
}

// Single terrain height sample
public class ElevationCell
{
    public double X      { get; set; }
    public double Y      { get; set; }
    public double Z      { get; set; }   // height ASL in metres
}

// Wrapper sent to frontend (needs sampleSize to reconstruct the grid)
public class ElevationsData
{
    public double              SampleSize { get; set; }
    public double              WorldSize  { get; set; }
    public List<ElevationCell> Cells      { get; set; } = [];
}

// Wrapper for the forest broadcast (frontend needs sampleSize to draw rectangles)
public class ForestsData
{
    public double           SampleSize { get; set; }
    public List<ForestCell> Cells      { get; set; } = [];
}

// ── Static Athena cache (loaded from %USERPROFILE%\Documents\Athena\Maps\) ───

// A single contour polyline — sequence of [x,y] world-metre pairs
public class ContourPolyline
{
    public List<double[]> Points { get; set; } = [];  // each [worldX, worldY]
}

// All contour polylines for one elevation level
public class ContourLevel
{
    public int                    Z         { get; set; }   // elevation metres ASL
    public bool                   IsMajor   { get; set; }   // every 20m or sea-level
    public List<ContourPolyline>  Polylines { get; set; } = [];
}

// One individual tree position
public class TreePoint
{
    public double X { get; set; }  // world metres
    public double Y { get; set; }
    public string Model { get; set; } = "";
}

// Wrapper broadcast to the frontend
public class StaticMapData
{
    public string              WorldName { get; set; } = "";
    public int                 CellSize  { get; set; }   // metres per grid cell (8 for Altis)
    public List<ContourLevel>  Contours  { get; set; } = [];
    public List<TreePoint>     Trees     { get; set; } = [];
}

// ── Full snapshot pushed to frontend ─────────────────────────────────────────

public class GameFrame
{
    public Mission?                          Mission  { get; set; }
    public WorldInfo?                        World    { get; set; }
    public GameTime?                         Time     { get; set; }
    public Dictionary<string, Group>         Groups   { get; set; } = [];
    public Dictionary<string, Unit>          Units    { get; set; } = [];
    public Dictionary<string, Vehicle>       Vehicles { get; set; } = [];
    public List<FiredEvent>                  Fired    { get; set; } = [];
    public List<KilledEvent>                 Killed   { get; set; } = [];
}

// ── Server admin settings (synced to all connected browsers) ────────────────

public class ServerSettings
{
    public bool ShowEast     { get; set; } = false;
    public bool ShowGuer     { get; set; } = false;
    public bool ShowCiv      { get; set; } = false;
}

// ── Export status (tracks ongoing world-data export progress) ─────────────────

public class ExportStatus
{
    public string Phase              { get; set; } = "idle";  // idle | exporting | cached | complete
    public int    RoadCount          { get; set; }
    public bool   RoadsComplete      { get; set; }
    public int    ForestCount        { get; set; }
    public bool   ForestsComplete    { get; set; }
    public int    LocationCount      { get; set; }
    public bool   LocationsComplete  { get; set; }
    public int    StructureCount     { get; set; }
    public bool   StructuresComplete { get; set; }
    public int    ElevationCount     { get; set; }
    public bool   ElevationsComplete { get; set; }
}

// ── Pending request (backend → extension → game) ─────────────────────────────

public class ExtensionRequest
{
    public string          Command { get; set; } = "";
    public string          Client  { get; set; } = "";
    public List<object>    Data    { get; set; } = [];
}
