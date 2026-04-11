import type { TaskItem, TaskStatusType } from '../types/task';

interface TaskCardProps {
  task: TaskItem;
  onStatusChange: (id: number, status: TaskStatusType) => void;
  onDelete: (id: number) => void;
}

const priorityConfig: Record<string, { bg: string; color: string; border: string }> = {
  Low: { bg: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' },
  Medium: { bg: 'rgba(132, 204, 22, 0.12)', color: '#a3e635', border: 'rgba(132, 204, 22, 0.3)' },
  High: { bg: 'rgba(250, 204, 21, 0.12)', color: '#facc15', border: 'rgba(250, 204, 21, 0.3)' },
  Urgent: { bg: 'rgba(220, 38, 38, 0.15)', color: '#ef4444', border: 'rgba(220, 38, 38, 0.4)' },
};

const statusLabels: Record<string, string> = {
  Pending: 'To Do',
  InProgress: 'In Progress',
  Completed: 'Done',
  Cancelled: 'Cancelled',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'Completed' || status === 'Cancelled') return false;
  return new Date(dueDate) < new Date();
}

export function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const nextStatus: Record<string, TaskStatusType> = {
    Pending: 'InProgress',
    InProgress: 'Completed',
    Completed: 'Pending',
    Cancelled: 'Pending',
  };

  const actionLabel: Record<string, string> = {
    Pending: 'Start',
    InProgress: 'Complete',
    Completed: 'Reopen',
    Cancelled: 'Reopen',
  };

  return (
    <div className={`task-card ${task.status === 'Completed' ? 'completed' : ''} ${isOverdue(task.dueDate, task.status) ? 'overdue' : ''}`}>
      <div className="task-card-header">
        <span
          className="priority-badge"
          style={{
            backgroundColor: priorityConfig[task.priority].bg,
            color: priorityConfig[task.priority].color,
            border: `1px solid ${priorityConfig[task.priority].border}`,
          }}
        >
          {task.priority}
        </span>
        <span className={`status-badge status-${task.status.toLowerCase()}`}>
          {statusLabels[task.status]}
        </span>
      </div>

      <h3 className="task-title">{task.title}</h3>

      {task.description && (
        <p className="task-description">{task.description}</p>
      )}

      <div className="task-meta">
        {task.dueDate && (
          <span className={`due-date ${isOverdue(task.dueDate, task.status) ? 'overdue-text' : ''}`}>
            Due: {formatDate(task.dueDate)}
          </span>
        )}
        {task.tags && (
          <div className="task-tags">
            {task.tags.split(',').map((tag) => (
              <span key={tag.trim()} className="tag">{tag.trim()}</span>
            ))}
          </div>
        )}
      </div>

      <div className="task-card-actions">
        <button
          className="btn btn-sm btn-action"
          onClick={() => onStatusChange(task.id, nextStatus[task.status])}
        >
          {actionLabel[task.status]}
        </button>
        {task.status !== 'Cancelled' && task.status !== 'Completed' && (
          <button
            className="btn btn-sm btn-cancel"
            onClick={() => onStatusChange(task.id, 'Cancelled')}
          >
            Cancel
          </button>
        )}
        <button
          className="btn btn-sm btn-delete"
          onClick={() => onDelete(task.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
