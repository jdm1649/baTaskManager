using System.ComponentModel.DataAnnotations;

namespace TaskManager.Models;

/// <summary>
/// One completed run of a subtask against an LLM. Stores the exact request
/// we sent, the response we got back, and the runtime stats LM Studio
/// reported. This is the tuning artifact - never mutated after insert.
/// </summary>
public class SubtaskRun
{
    public int Id { get; set; }

    public int SubtaskId { get; set; }
    public Subtask Subtask { get; set; } = null!;

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(200)]
    public string Model { get; set; } = string.Empty;

    /// <summary>JSON array of OpenAI-style chat messages, as sent.</summary>
    [Required]
    public string SentMessagesJson { get; set; } = "[]";

    public double SentTemperature { get; set; }

    public int SentMaxTokens { get; set; }

    public double? SentTopP { get; set; }

    /// <summary>Full assistant reply. Never truncated server-side.</summary>
    public string ResponseContent { get; set; } = string.Empty;

    // Runtime stats reported by LM Studio's /api/v0 response.
    [MaxLength(64)]
    public string? StopReason { get; set; }

    public double? TokensPerSecond { get; set; }

    public double? TimeToFirstToken { get; set; }

    public int? PromptTokens { get; set; }

    public int? CompletionTokens { get; set; }

    public int? TotalTokens { get; set; }

    [MaxLength(64)]
    public string? Quant { get; set; }

    public int? ContextLength { get; set; }

    [MaxLength(200)]
    public string? Runtime { get; set; }

    [MaxLength(4000)]
    public string? UserNotes { get; set; }
}
