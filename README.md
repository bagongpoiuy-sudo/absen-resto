# AbsenQR

Aplikasi absensi QR berbasis React + PostgreSQL dengan backend Node.js/Express.

## Struktur

- `src/` - frontend React + TypeScript
- `server/` - backend Express API
- `sql/schema.sql` - schema PostgreSQL untuk TablePlus atau client lain
- `server/.env.example` - contoh variabel lingkungan

## Instalasi

1. Pastikan Node.js sudah terpasang.
2. Jalankan:
   ```bash
   npm install
   ```

## Konfigurasi database

1. Siapkan database PostgreSQL.
2. Salin `server/.env.example` menjadi `.env` di folder root.
3. Edit `DATABASE_URL` sesuai koneksi PostgreSQL Anda, misalnya:
   ```text
   DATABASE_URL=postgres://username:password@localhost:5432/absen_restodb
   JWT_SECRET=replace_with_a_secure_secret
   PORT=4000
   ```
4. Import atau jalankan SQL schema di `sql/schema.sql` menggunakan TablePlus.

## Menjalankan aplikasi

### Backend

Di terminal project:
```bash
npm run dev:server
```

### Frontend

Di terminal lain:
```bash
npm run dev
```

Frontend akan otomatis mem-proxy request API ke backend `http://localhost:4000`.

## Endpoint utama

- `POST /api/auth/register` - registrasi user baru
- `POST /api/auth/login` - login username/password
- `GET /api/auth/me` - validasi session
- `GET /api/profiles` - ambil daftar profil
- `GET /api/attendance` - ambil data absensi
- `POST /api/attendance` - tambah absensi
- `PUT /api/attendance/:id` - edit absensi
- `GET /api/work-settings` - ambil pengaturan kerja
- `POST /api/work-settings` - simpan pengaturan kerja

## Catatan

- Aplikasi frontend sudah berubah untuk tidak lagi menggunakan Supabase.
- Login menggunakan `username` dan `password`, bukan email.
- Gunakan TablePlus untuk menjalankan `sql/schema.sql` jika ingin mengelola database secara visual.

## Troubleshoot

- Jika token JWT tidak valid, hapus `localStorage` browser dan ulang login.
- Jika ada error koneksi database, periksa `DATABASE_URL` di `.env`.
