using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.Data;
using TaskManager.Models;

namespace TaskManager.Controllers;

[ApiController]
public class SubtasksController : ControllerBase
{
    private readonly AppDbContext _db;

    public SubtasksController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("api/tasks/{taskId}/subtasks")]
    public async Task<ActionResult<List<SubtaskResponse>>> ListForTask(int taskId)
    {
        var exists = await _db.Tasks.AnyAsync(t => t.Id == taskId);
        if (!exists) return NotFound();

        var subtasks = await _db.Subtasks
            .Where(s => s.TaskItemId == taskId)
            .OrderBy(s => s.Order)
            .ToListAsync();
        return subtasks.Select(SubtaskResponse.FromEntity).ToList();
    }

    [HttpPost("api/tasks/{taskId}/subtasks")]
    public async Task<ActionResult<SubtaskResponse>> Create(int taskId, CreateSubtaskRequest request)
    {
        var task = await _db.Tasks.FindAsync(taskId);
        if (task is null) return NotFound();

        var now = DateTime.UtcNow;
        var subtask = new Subtask
        {
            TaskItemId = taskId,
            Kind = request.Kind,
            Order = request.Order,
            Question = request.Question,
            Temperature = request.Temperature,
            MaxTokens = request.MaxTokens,
            TopP = request.TopP,
            Notes = request.Notes,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Subtasks.Add(subtask);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = subtask.Id }, SubtaskResponse.FromEntity(subtask));
    }

    [HttpGet("api/subtasks/{id}")]
    public async Task<ActionResult<SubtaskResponse>> GetById(int id)
    {
        var s = await _db.Subtasks.FindAsync(id);
        if (s is null) return NotFound();
        return SubtaskResponse.FromEntity(s);
    }

    [HttpPut("api/subtasks/{id}")]
    public async Task<ActionResult<SubtaskResponse>> Update(int id, UpdateSubtaskRequest request)
    {
        var s = await _db.Subtasks.FindAsync(id);
        if (s is null) return NotFound();

        if (request.Kind.HasValue) s.Kind = request.Kind.Value;
        if (request.Order.HasValue) s.Order = request.Order.Value;
        if (request.Question is not null) s.Question = request.Question;
        if (request.Temperature.HasValue) s.Temperature = request.Temperature.Value;
        if (request.MaxTokens.HasValue) s.MaxTokens = request.MaxTokens.Value;
        if (request.TopP.HasValue) s.TopP = request.TopP.Value;
        if (request.Notes is not null) s.Notes = request.Notes;
        s.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return SubtaskResponse.FromEntity(s);
    }

    [HttpDelete("api/subtasks/{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        var s = await _db.Subtasks.FindAsync(id);
        if (s is null) return NotFound();
        _db.Subtasks.Remove(s);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
