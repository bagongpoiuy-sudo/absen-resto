import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  nik: string;
  department: string;
  position: string;
  role: 'admin' | 'user';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Attendance = {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  status: 'hadir' | 'telat' | 'izin';
  note: string;
  scanned_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
};

export type WorkSettings = {
  id: string;
  work_start: string;
  work_end: string;
  late_threshold_minutes: number;
  updated_by: string | null;
  updated_at: string;
};
