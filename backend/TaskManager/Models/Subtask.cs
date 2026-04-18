using System.ComponentModel.DataAnnotations;

namespace TaskManager.Models;

public enum SubtaskKind
{
    Restate,
    ExpectedBehavior,
    ActualBehavior,
    Categorize,
    FirstDiagnosticStep,
    NextDiagnosticStep,
    ConfirmationPlan
}

public class Subtask
{
    public int Id { get; set; }

    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;

    public SubtaskKind Kind { get; set; }

    public int Order { get; set; }

    [Required]
    [MaxLength(4000)]
    public string Question { get; set; } = string.Empty;

    public double Temperature { get; set; } = 0.0;

    public int MaxTokens { get; set; } = 256;

    public double? TopP { get; set; }

    [MaxLength(4000)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<SubtaskRun> Runs { get; set; } = new List<SubtaskRun>();
}
