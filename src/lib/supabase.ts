export type Profile = {
  id: string;
  username: string;
  full_name: string;
  nik: string;
  department: string;
  position: string;
  role: 'admin' | 'user';
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
