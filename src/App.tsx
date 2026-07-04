import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase, type Task, type TaskInsert, type TaskStatus, type TaskUpdate } from './lib/supabase';

type View = 'active' | 'trash';

const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; badge: string; icon: typeof Circle }
> = {
  todo: { label: 'To Do', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600', icon: Circle },
  in_progress: { label: 'In Progress', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', icon: Clock },
  done: { label: 'Done', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done'];

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [view, setView] = useState<View>('active');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  // form / modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<TaskStatus>('todo');
  const [saving, setSaving] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let req = supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (view === 'active') {
        req = req.is('deleted_at', null);
      } else {
        req = req.not('deleted_at', 'is', null);
      }
      const { data, error: err } = await req;
      if (err) throw err;
      setTasks((data ?? []) as Task[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const openCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormDescription('');
    setFormStatus('todo');
    setIsModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDescription(task.description ?? '');
    setFormStatus(task.status);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updates: TaskUpdate = {
          title,
          description: formDescription.trim() || null,
          status: formStatus,
        };
        const { error: err } = await supabase.from('tasks').update(updates).eq('id', editingId);
        if (err) throw err;
      } else {
        const insert: TaskInsert = {
          title,
          description: formDescription.trim() || null,
          status: formStatus,
        };
        const { error: err } = await supabase.from('tasks').insert(insert);
        if (err) throw err;
      }
      setIsModalOpen(false);
      setEditingId(null);
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (id: string) => {
    setError(null);
    try {
      // The BEFORE DELETE trigger converts this into a soft delete.
      const { error: err } = await supabase.from('tasks').delete().eq('id', id);
      if (err) throw err;
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task');
    }
  };

  const handleRestore = async (id: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ deleted_at: null })
        .eq('id', id);
      if (err) throw err;
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore task');
    }
  };

  const cycleStatus = async (task: Task) => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    setError(null);
    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ status: next })
        .eq('id', task.id);
      if (err) throw err;
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [tasks, query, statusFilter]);

  const counts = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0 };
    for (const t of tasks) byStatus[t.status] += 1;
    return byStatus;
  }, [tasks]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Task Manager</h1>
              <p className="text-xs text-slate-500">Supabase CRUD with soft delete</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* View tabs */}
        <div className="mb-6 flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {(['active', 'trash'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                view === v
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v === 'active' ? 'Active Tasks' : 'Trash'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {view === 'active' && (
          <>
            {/* Toolbar */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['all', ...STATUS_ORDER] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                      statusFilter === s
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status summary */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              {STATUS_ORDER.map((s) => (
                <div
                  key={s}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                    <span className="text-xs font-medium text-slate-500">
                      {STATUS_META[s].label}
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{counts[s]}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Task list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-sm font-medium text-slate-600">
              {view === 'active'
                ? 'No tasks yet. Create your first one.'
                : 'Trash is empty.'}
            </p>
            {view === 'active' && (
              <button
                onClick={openCreate}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 underline-offset-4 hover:underline"
              >
                <Plus className="h-4 w-4" /> Add a task
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((task) => {
              const meta = STATUS_META[task.status];
              const StatusIcon = meta.icon;
              return (
                <li
                  key={task.id}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {view === 'active' ? (
                      <button
                        onClick={() => cycleStatus(task)}
                        title="Click to cycle status"
                        className="mt-0.5 shrink-0"
                      >
                        <StatusIcon
                          className={`h-5 w-5 ${
                            task.status === 'done'
                              ? 'text-emerald-500'
                              : task.status === 'in_progress'
                                ? 'text-amber-500'
                                : 'text-slate-300'
                          } transition hover:scale-110`}
                        />
                      </button>
                    ) : (
                      <span className="mt-0.5 shrink-0">
                        <Trash2 className="h-5 w-5 text-slate-300" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`truncate text-sm font-semibold ${
                            task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-sm text-slate-500">{task.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Created {formatDate(task.created_at)}</span>
                        <span>·</span>
                        <span>Updated {formatDate(task.updated_at)}</span>
                        {view === 'trash' && task.deleted_at && (
                          <>
                            <span>·</span>
                            <span className="text-red-400">
                              Deleted {formatDate(task.deleted_at)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      {view === 'active' ? (
                        <>
                          <button
                            onClick={() => openEdit(task)}
                            title="Edit"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleSoftDelete(task.id)}
                            title="Delete"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRestore(task.id)}
                          title="Restore"
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editingId ? 'Edit Task' : 'New Task'}
              </h2>
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Title
                </label>
                <input
                  autoFocus
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_ORDER.map((s) => {
                    const m = STATUS_META[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormStatus(s)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          formStatus === s
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
