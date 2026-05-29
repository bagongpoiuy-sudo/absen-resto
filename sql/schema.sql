-- Database schema for AbsenQR without Supabase
-- Run this SQL in TablePlus or any PostgreSQL client.

create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references users(id) on delete cascade,
  full_name text not null,
  nik text not null unique,
  department text not null,
  position text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  check_in_time timestamptz,
  status text not null check (status in ('hadir', 'telat', 'izin')),
  note text default '',
  scanned_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table work_settings (
  id uuid primary key default gen_random_uuid(),
  work_start time not null,
  work_end time not null,
  late_threshold_minutes integer not null default 15,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

-- Contoh akun admin (ganti passwordnya setelah import):
-- insert into users (username, password_hash) values ('admin', '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
-- insert into profiles (id, full_name, nik, department, position, role) values ((select id from users where username='admin'), 'Admin', '000000000', 'IT', 'Administrator', 'admin');
