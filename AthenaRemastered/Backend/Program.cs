using AthenaRemastered.Server.Hubs;
using AthenaRemastered.Server.Services;

try
{

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot"),
});

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
    var url = "http://localhost:5000";
    Console.WriteLine();
    Console.WriteLine("  ╔══════════════════════════════════════════════╗");
    Console.WriteLine("  ║       ⬡  ATHENA REMASTERED  SERVER         ║");
    Console.WriteLine("  ╠══════════════════════════════════════════════╣");
    Console.WriteLine($"  ║  Open in browser:  {url,-25} ║");
    Console.WriteLine("  ║  Press Ctrl+C to stop the server            ║");
    Console.WriteLine("  ╚══════════════════════════════════════════════╝");
    Console.WriteLine();

    // Auto-open the browser for convenience
    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); }
    catch { /* non-critical — user can open manually */ }
});

app.Run();

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
