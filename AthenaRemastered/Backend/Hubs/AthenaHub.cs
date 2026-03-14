using AthenaRemastered.Server.Models;
using AthenaRemastered.Server.Services;
using Microsoft.AspNetCore.SignalR;

namespace AthenaRemastered.Server.Hubs;

/// <summary>
/// SignalR hub. Each browser client connects here and receives:
///   - "Frame"  → full GameFrame snapshot every update cycle
///   - "Fired"  → FiredEvent as it happens
///   - "Killed" → KilledEvent as it happens
/// Clients can also call server methods to trigger world exports.
/// </summary>
public class AthenaHub : Hub
{
    private readonly GameStateService _state;
    private readonly ILogger<AthenaHub> _log;

    public AthenaHub(GameStateService state, ILogger<AthenaHub> log)
    {
        _state = state;
        _log   = log;
    }

    // Called when a new browser connects — send lightweight state immediately.
    // Bulk geometry (roads/forests/locations/structures/elevations) is fetched
    // by the frontend via REST endpoints instead of pushing through SignalR,
    // which is more reliable for large payloads (roads can be 6 MB+).
    public override async Task OnConnectedAsync()
    {
        try
        {
            var frame = _state.GetCurrentFrame();
            await Clients.Caller.SendAsync("Frame", frame);
            await Clients.Caller.SendAsync("ServerSettings", _state.Settings);
            await Clients.Caller.SendAsync("ExportStatus", _state.GetExportStatus());

            if (_state.World != null)
                await Clients.Caller.SendAsync("WorldInfo", _state.World);

            _log.LogInformation("Client connected (frame sent, world={World})",
                _state.World?.NameWorld ?? "(none)");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error in OnConnectedAsync");
        }

        await base.OnConnectedAsync();
    }

    // Frontend calls this to queue a request back into Arma via the extension
    public Task RequestWorldExport(string command, string client, List<object> data)
    {
        _state.EnqueueRequest(new ExtensionRequest
        {
            Command = command,
            Client  = client,
            Data    = data
        });
        return Task.CompletedTask;
    }
}
