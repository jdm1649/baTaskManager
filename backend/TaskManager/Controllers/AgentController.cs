using Microsoft.AspNetCore.Mvc;
using TaskManager.Models;
using TaskManager.Services;

namespace TaskManager.Controllers;

[ApiController]
[Route("api/agent")]
public class AgentController : ControllerBase
{
    private readonly LMStudioClient _lm;

    public AgentController(LMStudioClient lm)
    {
        _lm = lm;
    }

    [HttpGet("model-info")]
    public async Task<ActionResult<ModelInfoResponse>> ModelInfo(CancellationToken ct)
    {
        var configured = _lm.Options.Model;
        try
        {
            var match = await _lm.FindModelAsync(configured, ct);
            if (match is null)
            {
                return new ModelInfoResponse
                {
                    ConfiguredModel = configured,
                    Reachable = true,
                    Error = "configured model is not listed by LM Studio",
                };
            }
            return new ModelInfoResponse
            {
                ConfiguredModel = configured,
                Reachable = true,
                State = match.State,
                Quant = match.Quantization,
                LoadedContextLength = match.LoadedContextLength,
                MaxContextLength = match.MaxContextLength,
            };
        }
        catch (Exception ex)
        {
            return new ModelInfoResponse
            {
                ConfiguredModel = configured,
                Reachable = false,
                Error = ex.Message,
            };
        }
    }
}
