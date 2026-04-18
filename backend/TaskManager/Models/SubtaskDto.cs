using System.ComponentModel.DataAnnotations;

namespace TaskManager.Models;

public class CreateSubtaskRequest
{
    [Required]
    public SubtaskKind Kind { get; set; }

    [Range(1, int.MaxValue)]
    public int Order { get; set; } = 1;

    [Required]
    [MaxLength(4000)]
    public string Question { get; set; } = string.Empty;

    [Range(0.0, 2.0)]
    public double Temperature { get; set; } = 0.0;

    [Range(1, 8192)]
    public int MaxTokens { get; set; } = 256;

    [Range(0.0, 1.0)]
    public double? TopP { get; set; }

    [MaxLength(4000)]
    public string? Notes { get; set; }
}

public class UpdateSubtaskRequest
{
    public SubtaskKind? Kind { get; set; }

    [Range(1, int.MaxValue)]
    public int? Order { get; set; }

    [MaxLength(4000)]
    public string? Question { get; set; }

    [Range(0.0, 2.0)]
    public double? Temperature { get; set; }

    [Range(1, 8192)]
    public int? MaxTokens { get; set; }

    [Range(0.0, 1.0)]
    public double? TopP { get; set; }

    [MaxLength(4000)]
    public string? Notes { get; set; }
}

public class SubtaskResponse
{
    public int Id { get; set; }
    public int TaskItemId { get; set; }
    public string Kind { get; set; } = string.Empty;
    public int Order { get; set; }
    public string Question { get; set; } = string.Empty;
    public double Temperature { get; set; }
    public int MaxTokens { get; set; }
    public double? TopP { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static SubtaskResponse FromEntity(Subtask s) => new()
    {
        Id = s.Id,
        TaskItemId = s.TaskItemId,
        Kind = s.Kind.ToString(),
        Order = s.Order,
        Question = s.Question,
        Temperature = s.Temperature,
        MaxTokens = s.MaxTokens,
        TopP = s.TopP,
        Notes = s.Notes,
        CreatedAt = s.CreatedAt,
        UpdatedAt = s.UpdatedAt,
    };
}

public class RunSubtaskRequest
{
    [MaxLength(4000)]
    public string? UserNotes { get; set; }
}

public class SubtaskRunResponse
{
    public int Id { get; set; }
    public int SubtaskId { get; set; }
    public DateTime StartedAt { get; set; }
    public string Model { get; set; } = string.Empty;
    public string SentMessagesJson { get; set; } = "[]";
    public double SentTemperature { get; set; }
    public int SentMaxTokens { get; set; }
    public double? SentTopP { get; set; }
    public string ResponseContent { get; set; } = string.Empty;
    public string? StopReason { get; set; }
    public double? TokensPerSecond { get; set; }
    public double? TimeToFirstToken { get; set; }
    public int? PromptTokens { get; set; }
    public int? CompletionTokens { get; set; }
    public int? TotalTokens { get; set; }
    public string? Quant { get; set; }
    public int? ContextLength { get; set; }
    public string? Runtime { get; set; }
    public string? UserNotes { get; set; }

    public static SubtaskRunResponse FromEntity(SubtaskRun r) => new()
    {
        Id = r.Id,
        SubtaskId = r.SubtaskId,
        StartedAt = r.StartedAt,
        Model = r.Model,
        SentMessagesJson = r.SentMessagesJson,
        SentTemperature = r.SentTemperature,
        SentMaxTokens = r.SentMaxTokens,
        SentTopP = r.SentTopP,
        ResponseContent = r.ResponseContent,
        StopReason = r.StopReason,
        TokensPerSecond = r.TokensPerSecond,
        TimeToFirstToken = r.TimeToFirstToken,
        PromptTokens = r.PromptTokens,
        CompletionTokens = r.CompletionTokens,
        TotalTokens = r.TotalTokens,
        Quant = r.Quant,
        ContextLength = r.ContextLength,
        Runtime = r.Runtime,
        UserNotes = r.UserNotes,
    };
}

public class ModelInfoResponse
{
    public string ConfiguredModel { get; set; } = string.Empty;
    public string? State { get; set; }
    public string? Quant { get; set; }
    public int? LoadedContextLength { get; set; }
    public int? MaxContextLength { get; set; }
    public bool Reachable { get; set; }
    public string? Error { get; set; }
}
