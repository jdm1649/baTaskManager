using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TaskManager.Data;
using TaskManager.Models;

namespace TaskManager.Services;

/// <summary>
/// One-time import: if the DB has no tasks at all, look for
/// <c>agents/tasks/&lt;task_id&gt;/</c> seed folders relative to the repo root
/// and import each into SQLite. Idempotent: skips seeding if any task exists.
///
/// This lets us migrate the Python-CLI-era task data into the UI-era SQLite
/// without losing the work we did in the previous commit.
/// </summary>
public static class AgentSeeder
{
    public static async Task SeedIfEmptyAsync(AppDbContext db, IHostEnvironment env, ILogger logger, CancellationToken ct = default)
    {
        if (await db.Tasks.IgnoreQueryFilters().AnyAsync(ct))
        {
            logger.LogInformation("Seeder: tasks already exist, skipping");
            return;
        }

        var agentsTasksDir = FindAgentsTasksDir(env.ContentRootPath);
        if (agentsTasksDir is null || !Directory.Exists(agentsTasksDir))
        {
            logger.LogInformation("Seeder: no agents/tasks directory found, nothing to import");
            return;
        }

        logger.LogInformation("Seeder: importing from {Dir}", agentsTasksDir);

        foreach (var taskDir in Directory.EnumerateDirectories(agentsTasksDir).OrderBy(d => d))
        {
            try
            {
                await ImportOneTaskAsync(db, taskDir, logger, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Seeder: failed to import {Dir}", taskDir);
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeder: import complete");
    }

    private static async Task ImportOneTaskAsync(AppDbContext db, string taskDir, ILogger logger, CancellationToken ct)
    {
        var taskId = Path.GetFileName(taskDir);
        var taskMd = Path.Combine(taskDir, "task.md");
        if (!File.Exists(taskMd))
        {
            logger.LogInformation("Seeder: {Dir} has no task.md, skipping", taskDir);
            return;
        }

        var taskText = (await File.ReadAllTextAsync(taskMd, ct)).Trim();
        if (taskText.Length == 0)
        {
            logger.LogInformation("Seeder: {Dir}/task.md is empty, skipping", taskDir);
            return;
        }

        // Title: derive from the first line (first sentence up to 120 chars).
        var firstLine = taskText.Split('\n', 2)[0].Trim();
        var title = firstLine.Length <= 120 ? firstLine : firstLine[..117] + "...";

        var now = DateTime.UtcNow;
        var task = new TaskItem
        {
            Title = string.IsNullOrWhiteSpace(title) ? taskId : title,
            Description = taskText,
            Priority = TaskPriority.Medium,
            Status = Models.TaskStatus.Pending,
            Tags = $"seed,{taskId}",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Tasks.Add(task);
        await db.SaveChangesAsync(ct);

        var subtasksDir = Path.Combine(taskDir, "subtasks");
        if (!Directory.Exists(subtasksDir)) return;

        foreach (var subFile in Directory.EnumerateFiles(subtasksDir, "*.json").OrderBy(f => f))
        {
            var json = await File.ReadAllTextAsync(subFile, ct);
            SeedSubtaskFile? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<SeedSubtaskFile>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Seeder: could not parse {File}", subFile);
                continue;
            }
            if (parsed is null || string.IsNullOrWhiteSpace(parsed.Kind) || string.IsNullOrWhiteSpace(parsed.Question))
            {
                logger.LogWarning("Seeder: {File} is missing kind/question", subFile);
                continue;
            }

            if (!TryMapKind(parsed.Kind, out var kind))
            {
                logger.LogWarning("Seeder: {File} has unknown kind '{Kind}'", subFile, parsed.Kind);
                continue;
            }

            var subtask = new Subtask
            {
                TaskItemId = task.Id,
                Kind = kind,
                Order = parsed.Order > 0 ? parsed.Order : 1,
                Question = parsed.Question,
                Temperature = parsed.ModelSettings?.Temperature ?? 0.0,
                MaxTokens = parsed.ModelSettings?.MaxTokens ?? 256,
                TopP = parsed.ModelSettings?.TopP,
                Notes = parsed.Notes,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.Subtasks.Add(subtask);
        }
    }

    private static bool TryMapKind(string raw, out SubtaskKind kind)
    {
        // Python uses snake_case kinds; our enum is PascalCase. Map both.
        var normalized = raw.Trim().Replace("_", "").Replace("-", "");
        return Enum.TryParse(normalized, ignoreCase: true, out kind);
    }

    private static string? FindAgentsTasksDir(string contentRoot)
    {
        // Backend runs from backend/TaskManager/. Walk up until we find
        // a sibling "agents/tasks" folder.
        var dir = new DirectoryInfo(contentRoot);
        for (int i = 0; i < 5 && dir is not null; i++, dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "agents", "tasks");
            if (Directory.Exists(candidate)) return candidate;
        }
        return null;
    }

    private class SeedSubtaskFile
    {
        [JsonPropertyName("kind")] public string? Kind { get; set; }
        [JsonPropertyName("order")] public int Order { get; set; }
        [JsonPropertyName("question")] public string? Question { get; set; }
        [JsonPropertyName("model_settings")] public SeedModelSettings? ModelSettings { get; set; }
        [JsonPropertyName("notes")] public string? Notes { get; set; }
    }

    private class SeedModelSettings
    {
        [JsonPropertyName("temperature")] public double Temperature { get; set; }
        [JsonPropertyName("max_tokens")] public int MaxTokens { get; set; }
        [JsonPropertyName("top_p")] public double? TopP { get; set; }
    }
}
