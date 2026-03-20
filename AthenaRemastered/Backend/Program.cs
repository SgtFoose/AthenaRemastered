using AthenaRemastered.Server.Hubs;
using AthenaRemastered.Server.Services;
using System.Net;
using System.Net.Sockets;

try
{

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot"),
});

if (!HasExplicitListenConfiguration(builder.Configuration))
{
    builder.WebHost.UseUrls("http://0.0.0.0:5000");
}

builder.Services.AddSingleton<MapCacheService>();
builder.Services.AddSingleton<GameStateService>();
builder.Services.AddSingleton<StaticAthenaCacheService>();
builder.Services.AddHostedService<BroadcastService>();
builder.Services.AddSignalR(o =>
{
    o.MaximumReceiveMessageSize = 1024 * 1024;          // 1 MB client→server
    o.MaximumParallelInvocationsPerClient = 2;
});
builder.Services.AddControllers();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.SetIsOriginAllowed(_ => true)   // allow any origin (LAN tablets, localhost, etc.)
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

var app = builder.Build();

app.UseCors();
app.MapControllers();
app.MapHub<AthenaHub>("/hub");

// Serve the built frontend from wwwroot/ (populated by publish script)
app.UseDefaultFiles();   // serves index.html at /
app.UseStaticFiles();    // serves JS/CSS/icons from wwwroot/

// Print user-friendly startup banner after the server is ready
app.Lifetime.ApplicationStarted.Register(() =>
{
    var listenUrls = app.Urls.Count > 0 ? app.Urls.ToArray() : ["http://0.0.0.0:5000"];
    var localUrl = GetLocalBrowserUrl(listenUrls);
    var lanUrls = GetLanConnectionUrls(listenUrls).ToArray();
    var ver = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "?";
    Console.WriteLine();
    Console.WriteLine("  ╔══════════════════════════════════════════════╗");
    Console.WriteLine($"  ║   ⬡  ATHENA REMASTERED  SERVER  v{ver,-9}   ║");
    Console.WriteLine("  ╠══════════════════════════════════════════════╣");
    Console.WriteLine($"  ║  Open on this PC:  {localUrl,-25} ║");
    Console.WriteLine("  ║  Press Ctrl+C to stop the server            ║");
    Console.WriteLine("  ╚══════════════════════════════════════════════╝");
    if (lanUrls.Length > 0)
    {
        Console.WriteLine("  Devices on your network can connect to:");
        foreach (var lanUrl in lanUrls)
        {
            Console.WriteLine($"    {lanUrl}");
        }
        Console.WriteLine();
    }
    Console.WriteLine();

    // Auto-open the browser for convenience
    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(localUrl) { UseShellExecute = true }); }
    catch { /* non-critical — user can open manually */ }
});

app.Run();

bool HasExplicitListenConfiguration(IConfiguration configuration)
{
    return !string.IsNullOrWhiteSpace(configuration["urls"])
        || !string.IsNullOrWhiteSpace(configuration["http_ports"])
        || !string.IsNullOrWhiteSpace(configuration["https_ports"]);
}

string GetLocalBrowserUrl(IEnumerable<string> listenUrls)
{
    foreach (var listenUrl in listenUrls)
    {
        if (!Uri.TryCreate(listenUrl, UriKind.Absolute, out var uri))
        {
            continue;
        }

        return BuildUrl(uri, IsWildcardHost(uri.Host) ? "localhost" : uri.Host);
    }

    return "http://localhost:5000";
}

IEnumerable<string> GetLanConnectionUrls(IEnumerable<string> listenUrls)
{
    var lanAddresses = GetLanIPv4Addresses();
    var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var listenUrl in listenUrls)
    {
        if (!Uri.TryCreate(listenUrl, UriKind.Absolute, out var uri))
        {
            continue;
        }

        if (IsWildcardHost(uri.Host))
        {
            foreach (var lanAddress in lanAddresses)
            {
                urls.Add(BuildUrl(uri, lanAddress.ToString()));
            }

            continue;
        }

        if (IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address))
        {
            continue;
        }

        if (!uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            urls.Add(listenUrl.TrimEnd('/'));
        }
    }

    return urls.OrderBy(url => url, StringComparer.OrdinalIgnoreCase);
}

IEnumerable<IPAddress> GetLanIPv4Addresses()
{
    try
    {
        return Dns.GetHostEntry(Dns.GetHostName())
            .AddressList
            .Where(address => address.AddressFamily == AddressFamily.InterNetwork)
            .Where(address => !IPAddress.IsLoopback(address))
            .Where(address => !address.ToString().StartsWith("169.254.", StringComparison.Ordinal))
            .Distinct()
            .OrderBy(address => address.ToString(), StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
    catch
    {
        return [];
    }
}

bool IsWildcardHost(string host)
{
    return host is "0.0.0.0" or "*" or "+" or "::" or "[::]";
}

string BuildUrl(Uri uri, string host)
{
    var path = uri.AbsolutePath == "/" ? string.Empty : uri.AbsolutePath.TrimEnd('/');
    return $"{uri.Scheme}://{host}:{uri.Port}{path}";
}

}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.Error.WriteLine();
    Console.Error.WriteLine("  ═══ ATHENA SERVER FAILED TO START ═══");
    Console.Error.WriteLine($"  {ex.GetType().Name}: {ex.Message}");
    if (ex.InnerException != null)
        Console.Error.WriteLine($"  Inner: {ex.InnerException.Message}");
    Console.ResetColor();
    Console.Error.WriteLine();
    Console.Error.WriteLine("  Common fixes:");
    Console.Error.WriteLine("   - Is another Athena server already running? (port 5000 conflict)");
    Console.Error.WriteLine("   - Try closing other instances and run again.");
    Console.Error.WriteLine();
    Console.Error.WriteLine("  Press Enter to exit ...");
    Console.ReadLine();
    Environment.Exit(1);
}
