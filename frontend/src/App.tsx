import { useState, useEffect, useCallback } from 'react';
import type { TaskItem, TaskStatusType, CreateTaskRequest } from './types/task';
import { fetchTasks, createTask, updateTaskStatus, deleteTask } from './api/tasks';
import { TaskForm } from './components/TaskForm';
import { TaskCard } from './components/TaskCard';
import { TaskFilters } from './components/TaskFilters';
import { TaskDetailModal } from './components/TaskDetailModal';
import './App.css';

function App() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');

  const loadTasks = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTasks({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        search: search || undefined,
        sortBy,
        sortDir: 'desc',
      });
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search, sortBy]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateTask = async (request: CreateTaskRequest) => {
    try {
      await createTask(request);
      setShowForm(false);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleStatusChange = async (id: number, status: TaskStatusType) => {
    try {
      await updateTaskStatus(id, status);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTask(id);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const taskCounts = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'Pending').length,
    inProgress: tasks.filter((t) => t.status === 'InProgress').length,
    completed: tasks.filter((t) => t.status === 'Completed').length,
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Task Manager</h1>
          <p className="subtitle">Stay organized, stay focused</p>
        </div>
        <button className="btn btn-primary btn-add" onClick={() => setShowForm(true)}>
          + New Task
        </button>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{taskCounts.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat">
          <span className="stat-value">{taskCounts.pending}</span>
          <span className="stat-label">To Do</span>
        </div>
        <div className="stat">
          <span className="stat-value">{taskCounts.inProgress}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="stat">
          <span className="stat-value">{taskCounts.completed}</span>
          <span className="stat-label">Done</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <TaskForm onSubmit={handleCreateTask} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {viewingTask && (
        <TaskDetailModal task={viewingTask} onClose={() => setViewingTask(null)} />
      )}

      <main className="main-content">
        <TaskFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />

        {loading ? (
          <div className="loading">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#9745;</div>
            <h2>No tasks yet</h2>
            <p>Create your first task to get started!</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Create Task
            </button>
          </div>
        ) : (
          <div className="task-grid">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onView={setViewingTask}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
