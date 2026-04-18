using Microsoft.EntityFrameworkCore;
using TaskManager.Models;

namespace TaskManager.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<Subtask> Subtasks => Set<Subtask>();
    public DbSet<SubtaskRun> SubtaskRuns => Set<SubtaskRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.HasQueryFilter(t => !t.IsDeleted);
            entity.HasIndex(t => t.Status);
            entity.HasIndex(t => t.Priority);
            entity.HasIndex(t => t.DueDate);
        });

        modelBuilder.Entity<Subtask>(entity =>
        {
            entity.HasOne(s => s.TaskItem)
                  .WithMany()
                  .HasForeignKey(s => s.TaskItemId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Mirror TaskItem's soft-delete filter so EF's required-FK check
            // stays consistent: subtasks attached to a soft-deleted task are
            // hidden alongside their parent.
            entity.HasQueryFilter(s => !s.TaskItem.IsDeleted);

            entity.HasIndex(s => s.TaskItemId);
            entity.HasIndex(s => new { s.TaskItemId, s.Order });
        });

        modelBuilder.Entity<SubtaskRun>(entity =>
        {
            entity.HasOne(r => r.Subtask)
                  .WithMany(s => s.Runs)
                  .HasForeignKey(r => r.SubtaskId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasQueryFilter(r => !r.Subtask.TaskItem.IsDeleted);

            entity.HasIndex(r => r.SubtaskId);
            entity.HasIndex(r => r.StartedAt);
        });
    }
}
