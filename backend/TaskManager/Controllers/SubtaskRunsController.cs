using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.Data;
using TaskManager.Models;
using TaskManager.Services;

namespace TaskManager.Controllers;

[ApiController]
public class SubtaskRunsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly LMStudioClient _lm;
    private readonly ILogger<SubtaskRunsController> _logger;

    public SubtaskRunsController(AppDbContext db, LMStudioClient lm, ILogger<SubtaskRunsController> logger)
    {
        _db = db;
        _lm = lm;
        _logger = logger;
    }

    [HttpGet("api/subtasks/{subtaskId}/runs")]
    public async Task<ActionResult<List<SubtaskRunResponse>>> ListForSubtask(int subtaskId)
    {
        var exists = await _db.Subtasks.AnyAsync(s => s.Id == subtaskId);
        if (!exists) return NotFound();

        var runs = await _db.SubtaskRuns
            .Where(r => r.SubtaskId == subtaskId)
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();
        return runs.Select(SubtaskRunResponse.FromEntity).ToList();
    }

    [HttpPost("api/subtasks/{subtaskId}/runs")]
    public async Task<ActionResult<SubtaskRunResponse>> Run(int subtaskId, RunSubtaskRequest request, CancellationToken ct)
    {
        var subtask = await _db.Subtasks
            .Include(s => s.TaskItem)
            .FirstOrDefaultAsync(s => s.Id == subtaskId, ct);
        if (subtask is null) return NotFound();

        var taskText = (subtask.TaskItem.Description ?? subtask.TaskItem.Title).Trim();
        var prompt = BuildPrompt(subtask.Question, taskText);

        var messages = new List<LMStudioChatMessage>
        {
            new() { Role = "user", Content = prompt },
        };

        if (IsPromptOverBudget(prompt, _lm.Options.MaxPromptTokens, out var estimated))
        {
            return BadRequest(new
            {
                error = "prompt-over-budget",
                estimatedTokens = estimated,
                maxPromptTokens = _lm.Options.MaxPromptTokens,
                message = $"Built prompt is ~{estimated} tokens, exceeding the {_lm.Options.MaxPromptTokens} budget. Shorten the task or the subtask question, or raise LMStudio:MaxPromptTokens.",
            });
        }

        LMStudioChatResult chatResult;
        try
        {
            chatResult = await _lm.ChatAsync(
                messages,
                subtask.Temperature,
                subtask.MaxTokens,
                subtask.TopP,
                ct);
        }
        catch (LMStudioException ex)
        {
            _logger.LogWarning(ex, "LM Studio call failed for subtask {SubtaskId}", subtaskId);
            return StatusCode(502, new { error = "lmstudio-failure", message = ex.Message });
        }

        var run = new SubtaskRun
        {
            SubtaskId = subtask.Id,
            StartedAt = DateTime.UtcNow,
            Model = _lm.Options.Model,
            SentMessagesJson = JsonSerializer.Serialize(messages),
            SentTemperature = subtask.Temperature,
            SentMaxTokens = subtask.MaxTokens,
            SentTopP = subtask.TopP,
            ResponseContent = chatResult.Content,
            StopReason = chatResult.StopReason,
            TokensPerSecond = chatResult.TokensPerSecond,
            TimeToFirstToken = chatResult.TimeToFirstToken,
            PromptTokens = chatResult.PromptTokens,
            CompletionTokens = chatResult.CompletionTokens,
            TotalTokens = chatResult.TotalTokens,
            Quant = chatResult.Quant,
            ContextLength = chatResult.ContextLength,
            Runtime = chatResult.Runtime,
            UserNotes = request.UserNotes,
        };
        _db.SubtaskRuns.Add(run);
        await _db.SaveChangesAsync(ct);

        return SubtaskRunResponse.FromEntity(run);
    }

    private static string BuildPrompt(string question, string taskText) =>
        $"{question.Trim()}\n\nTASK:\n{taskText.Trim()}";

    /// <summary>
    /// Pessimistic char-based token estimate: matches the Python CLI guard
    /// at ~3 chars/token. We'd rather abort early on a borderline prompt
    /// than silently truncate.
    /// </summary>
    private static bool IsPromptOverBudget(string text, int maxTokens, out int estimated)
    {
        estimated = Math.Max(1, text.Length / 3);
        return estimated > maxTokens;
    }
}
