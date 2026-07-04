import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TaskInsert = Pick<Task, 'title'> &
  Partial<Pick<Task, 'description' | 'status'>>;

export type TaskUpdate = Partial<Pick<Task, 'title' | 'description' | 'status'>>;
