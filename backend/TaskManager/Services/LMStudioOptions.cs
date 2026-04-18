namespace TaskManager.Services;

/// <summary>
/// Bound from the "LMStudio" section of appsettings.json.
/// </summary>
public class LMStudioOptions
{
    public const string SectionName = "LMStudio";

    public string BaseUrl { get; set; } = "http://127.0.0.1:1234/v1";
    public string NativeUrl { get; set; } = "http://127.0.0.1:1234/api/v0";
    public string Model { get; set; } = "mistralai/mistral-7b-instruct-v0.3";
    public int RequestTimeoutSeconds { get; set; } = 180;

    /// <summary>
    /// Hard cap: a built prompt that exceeds this estimated token count
    /// aborts before hitting the network. Keep well under the loaded
    /// context_length so we never silently truncate.
    /// </summary>
    public int MaxPromptTokens { get; set; } = 3000;
}
