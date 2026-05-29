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

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const apiFetch = async <T>(path: string, init: RequestInit = {}) => {
  const token = localStorage.getItem('absenqr_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

// SESUDAH
const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://absen-resto-production.up.railway.app'}/api${path}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Terjadi kesalahan saat memanggil server.');
  }

  return payload as ApiResponse<T>;
};

export async function login(username: string, password: string) {
  const payload = await apiFetch<{ profile: Profile; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem('absenqr_token', payload.data!.token);
  return payload.data!.profile;
}

export async function register(data: {
  username: string;
  password: string;
  full_name: string;
  nik: string;
  department: string;
  position: string;
}) {
  const payload = await apiFetch<{ profile: Profile; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  localStorage.setItem('absenqr_token', payload.data!.token);
  return payload.data!.profile;
}

export async function getMe() {
  const payload = await apiFetch<{ profile: Profile }>('/auth/me');
  return payload.data!.profile;
}

export async function getProfileById(id: string) {
  const payload = await apiFetch<Profile>(`/profiles/${encodeURIComponent(id)}`);
  return payload.data!;
}

export async function getProfiles(role?: string) {
  const path = role ? `/profiles?role=${encodeURIComponent(role)}` : '/profiles';
  const payload = await apiFetch<Profile[]>(path);
  return payload.data!;
}

export async function getAttendances(userId: string) {
  const payload = await apiFetch<Attendance[]>(`/attendance?userId=${encodeURIComponent(userId)}`);
  return payload.data!;
}

export async function getAttendancesByDate(date: string) {
  const payload = await apiFetch<Attendance[]>(`/attendance?date=${encodeURIComponent(date)}`);
  return payload.data!;
}

export async function getAttendanceForUser(userId: string, date: string) {
  const payload = await apiFetch<Attendance[]>(
    `/attendance?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`
  );
  return payload.data!;
}

export async function getWorkSettings() {
  const payload = await apiFetch<WorkSettings>('/work-settings');
  return payload.data!;
}

export async function createAttendance(payloadData: {
  user_id: string;
  date: string;
  check_in_time: string;
  status: 'hadir' | 'telat' | 'izin';
  note: string;
  scanned_by: string;
}) {
  const payload = await apiFetch<Attendance>('/attendance', {
    method: 'POST',
    body: JSON.stringify(payloadData),
  });
  return payload.data!;
}

export async function updateAttendance(id: string, data: { status: 'telat' | 'izin'; note: string }) {
  const payload = await apiFetch<Attendance>(`/attendance/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return payload.data!;
}

export async function saveWorkSettings(data: {
  work_start: string;
  work_end: string;
  late_threshold_minutes: number;
}) {
  const payload = await apiFetch<WorkSettings>('/work-settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return payload.data!;
}

export function signOut() {
  localStorage.removeItem('absenqr_token');
}
