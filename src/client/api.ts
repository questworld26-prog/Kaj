import type { Task, Project, SwimlaneGroup, CalendarEvent } from '../shared/types.js';

const API_BASE = '/api';

export async function getHealth(): Promise<{ status: string; memory_rss_mb: number }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  return res.json();
}

export async function createProject(name: string, color: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create project');
  return res.json();
}

export async function reorderProjects(projectIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_ids: projectIds }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to reorder projects');
}

export async function getBoard(): Promise<SwimlaneGroup[]> {
  const res = await fetch(`${API_BASE}/board`);
  return res.json();
}

export async function getTasks(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  return res.json();
}

export async function createTask(input: Partial<Task>): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create task');
  return res.json();
}

export async function updateTask(id: string, input: Partial<Task>): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to update task');
  return res.json();
}

export async function completeTask(id: string): Promise<{ completed_task: Task; next_task: Task | null }> {
  const res = await fetch(`${API_BASE}/tasks/${id}/complete`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to complete task');
  return res.json();
}

export async function reopenTask(id: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${id}/reopen`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to reopen task');
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete task');
}

export async function getCompleted(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/completed`);
  return res.json();
}

export async function getUnscheduled(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/unscheduled`);
  return res.json();
}

export async function getCalendar(start: string, end: string): Promise<CalendarEvent[]> {
  const res = await fetch(`${API_BASE}/calendar?start=${start}&end=${end}`);
  return res.json();
}

export function subscribeToLiveEvents(onMutation: () => void): () => void {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};
  
  const es = new EventSource('/events');
  es.addEventListener('mutation', () => {
    onMutation();
  });

  return () => {
    es.close();
  };
}
