using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace TaskManager.Services;

/// <summary>
/// Thin client over LM Studio's native /api/v0 endpoint.
///
/// We deliberately use the native endpoint (not /v1) because its response
/// carries stats we need for model tuning:
///   - stats.stop_reason (eosFound / maxTokensReached / userStopped)
///   - stats.tokens_per_second, stats.time_to_first_token
///   - model_info.quant, model_info.context_length
///   - runtime.name / runtime.version
/// </summary>
public class LMStudioClient
{
    private readonly HttpClient _http;
    private readonly LMStudioOptions _options;
    private readonly ILogger<LMStudioClient> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LMStudioClient(HttpClient http, IOptions<LMStudioOptions> options, ILogger<LMStudioClient> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
        _http.Timeout = TimeSpan.FromSeconds(_options.RequestTimeoutSeconds);
    }

    public LMStudioOptions Options => _options;

    /// <summary>
    /// Ask LM Studio for the list of models it knows about. Returns an empty
    /// list on any transport error (callers decide how loudly to surface it).
    /// </summary>
    public async Task<IReadOnlyList<LMStudioModelInfo>> ListModelsAsync(CancellationToken ct = default)
    {
        try
        {
            var url = $"{_options.NativeUrl.TrimEnd('/')}/models";
            var resp = await _http.GetFromJsonAsync<LMStudioModelListEnvelope>(url, JsonOpts, ct);
            return resp?.Data ?? new List<LMStudioModelInfo>();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LMStudio ListModels failed");
            return new List<LMStudioModelInfo>();
        }
    }

    public async Task<LMStudioModelInfo?> FindModelAsync(string modelId, CancellationToken ct = default)
    {
        var models = await ListModelsAsync(ct);
        return models.FirstOrDefault(m => string.Equals(m.Id, modelId, StringComparison.Ordinal));
    }

    /// <summary>
    /// Non-streaming chat completion via /api/v0/chat/completions.
    /// Returns the assistant text plus every runtime stat LM Studio reports.
    /// Throws <see cref="LMStudioException"/> on HTTP or parse failures.
    /// </summary>
    public async Task<LMStudioChatResult> ChatAsync(
        IEnumerable<LMStudioChatMessage> messages,
        double temperature,
        int maxTokens,
        double? topP,
        CancellationToken ct = default)
    {
        var body = new LMStudioChatRequest
        {
            Model = _options.Model,
            Messages = messages.ToList(),
            Temperature = temperature,
            MaxTokens = maxTokens,
            TopP = topP,
        };

        var url = $"{_options.NativeUrl.TrimEnd('/')}/chat/completions";

        HttpResponseMessage resp;
        try
        {
            resp = await _http.PostAsJsonAsync(url, body, JsonOpts, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new LMStudioException($"POST {url} failed: {ex.Message}", ex);
        }

        if (!resp.IsSuccessStatusCode)
        {
            var detail = await resp.Content.ReadAsStringAsync(ct);
            throw new LMStudioException($"POST {url} returned {(int)resp.StatusCode} {resp.ReasonPhrase}: {detail}");
        }

        LMStudioChatResponse? parsed;
        try
        {
            parsed = await resp.Content.ReadFromJsonAsync<LMStudioChatResponse>(JsonOpts, ct);
        }
        catch (Exception ex)
        {
            throw new LMStudioException($"Failed to parse response from {url}: {ex.Message}", ex);
        }

        if (parsed?.Choices is null || parsed.Choices.Count == 0)
        {
            throw new LMStudioException("LM Studio response had no choices");
        }

        var content = parsed.Choices[0].Message?.Content ?? string.Empty;

        return new LMStudioChatResult
        {
            Content = content,
            StopReason = parsed.Stats?.StopReason,
            TokensPerSecond = parsed.Stats?.TokensPerSecond,
            TimeToFirstToken = parsed.Stats?.TimeToFirstToken,
            PromptTokens = parsed.Usage?.PromptTokens,
            CompletionTokens = parsed.Usage?.CompletionTokens,
            TotalTokens = parsed.Usage?.TotalTokens,
            Quant = parsed.ModelInfo?.Quant,
            ContextLength = parsed.ModelInfo?.ContextLength,
            Runtime = parsed.Runtime is { Name: not null }
                ? $"{parsed.Runtime.Name} v{parsed.Runtime.Version}"
                : null,
        };
    }
}

public class LMStudioException : Exception
{
    public LMStudioException(string message) : base(message) { }
    public LMStudioException(string message, Exception inner) : base(message, inner) { }
}

public class LMStudioChatMessage
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "user";

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public class LMStudioChatResult
{
    public string Content { get; set; } = string.Empty;
    public string? StopReason { get; set; }
    public double? TokensPerSecond { get; set; }
    public double? TimeToFirstToken { get; set; }
    public int? PromptTokens { get; set; }
    public int? CompletionTokens { get; set; }
    public int? TotalTokens { get; set; }
    public string? Quant { get; set; }
    public int? ContextLength { get; set; }
    public string? Runtime { get; set; }
}

// ---------- wire types ----------

internal class LMStudioChatRequest
{
    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("messages")]
    public List<LMStudioChatMessage> Messages { get; set; } = new();

    [JsonPropertyName("temperature")]
    public double Temperature { get; set; }

    [JsonPropertyName("max_tokens")]
    public int MaxTokens { get; set; }

    [JsonPropertyName("top_p")]
    public double? TopP { get; set; }
}

internal class LMStudioChatResponse
{
    [JsonPropertyName("choices")]
    public List<LMStudioChatChoice>? Choices { get; set; }

    [JsonPropertyName("usage")]
    public LMStudioUsage? Usage { get; set; }

    [JsonPropertyName("stats")]
    public LMStudioStats? Stats { get; set; }

    [JsonPropertyName("model_info")]
    public LMStudioModelInfoBrief? ModelInfo { get; set; }

    [JsonPropertyName("runtime")]
    public LMStudioRuntimeInfo? Runtime { get; set; }
}

internal class LMStudioChatChoice
{
    [JsonPropertyName("message")]
    public LMStudioChatMessage? Message { get; set; }

    [JsonPropertyName("finish_reason")]
    public string? FinishReason { get; set; }
}

internal class LMStudioUsage
{
    [JsonPropertyName("prompt_tokens")]
    public int? PromptTokens { get; set; }

    [JsonPropertyName("completion_tokens")]
    public int? CompletionTokens { get; set; }

    [JsonPropertyName("total_tokens")]
    public int? TotalTokens { get; set; }
}

internal class LMStudioStats
{
    [JsonPropertyName("stop_reason")]
    public string? StopReason { get; set; }

    [JsonPropertyName("tokens_per_second")]
    public double? TokensPerSecond { get; set; }

    [JsonPropertyName("time_to_first_token")]
    public double? TimeToFirstToken { get; set; }
}

internal class LMStudioModelInfoBrief
{
    [JsonPropertyName("arch")]
    public string? Arch { get; set; }

    [JsonPropertyName("quant")]
    public string? Quant { get; set; }

    [JsonPropertyName("context_length")]
    public int? ContextLength { get; set; }
}

internal class LMStudioRuntimeInfo
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("version")]
    public string? Version { get; set; }
}

public class LMStudioModelInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }

    [JsonPropertyName("quantization")]
    public string? Quantization { get; set; }

    [JsonPropertyName("loaded_context_length")]
    public int? LoadedContextLength { get; set; }

    [JsonPropertyName("max_context_length")]
    public int? MaxContextLength { get; set; }
}

internal class LMStudioModelListEnvelope
{
    [JsonPropertyName("data")]
    public List<LMStudioModelInfo>? Data { get; set; }
}
