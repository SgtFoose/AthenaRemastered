using AthenaRemastered.Server.Services;
using AthenaRemastered.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace AthenaRemastered.Server.Services;

/// <summary>
/// Bridges GameStateService events to SignalR clients.
/// Registered as a hosted service so it wires up on startup. Also runs a
/// periodic check that expires a mission once the game stops sending frames
/// (see <see cref="GameStateService.ExpireStaleMission"/>).
/// </summary>
public class BroadcastService : IHostedService, IDisposable
{
    /// <summary>How often the stale-mission check runs.</summary>
    private static readonly TimeSpan StaleCheckInterval = TimeSpan.FromSeconds(5);

    private readonly GameStateService        _state;
    private readonly IHubContext<AthenaHub>  _hub;
    private Timer? _staleTimer;

    public BroadcastService(GameStateService state, IHubContext<AthenaHub> hub)
    {
        _state = state;
        _hub   = hub;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _state.OnFrame             += frame   => _hub.Clients.All.SendAsync("Frame",     frame);
        _state.OnFired             += e       => _hub.Clients.All.SendAsync("Fired",       e);
        _state.OnFiredImpact       += e       => _hub.Clients.All.SendAsync("FiredImpact",  e);
        _state.OnKilled            += e       => _hub.Clients.All.SendAsync("Killed",    e);
        _state.OnWorldInfo         += wi      => _hub.Clients.All.SendAsync("WorldInfo",  wi);
        _state.OnRoadsComplete     += roads      => _hub.Clients.All.SendAsync("Roads",      roads);
        _state.OnForestsComplete   += forests    => _hub.Clients.All.SendAsync("Forests",    forests);
        _state.OnLocationsComplete += locs       => _hub.Clients.All.SendAsync("Locations",  locs);
        _state.OnStructuresComplete  += structs => _hub.Clients.All.SendAsync("Structures",  structs);
        _state.OnElevationsComplete  += elev    => _hub.Clients.All.SendAsync("Elevations",  elev);
        _state.OnSettingsChanged     += s       => _hub.Clients.All.SendAsync("ServerSettings", s);
        _state.OnExportStatus        += status  => _hub.Clients.All.SendAsync("ExportStatus", status);

        // Expire the live mission when the game closed without a clean shutdown,
        // so browsers return to the welcome screen instead of showing stale units.
        _staleTimer = new Timer(_ => _state.ExpireStaleMission(DateTime.UtcNow), null, StaleCheckInterval, StaleCheckInterval);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _staleTimer?.Change(Timeout.Infinite, Timeout.Infinite);
        return Task.CompletedTask;
    }

    public void Dispose() => _staleTimer?.Dispose();
}
