import express from 'express';
import cors from 'cors'; // Pastikan package 'cors' diinstal: npm install cors
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

dotenv.config();

const app = express();

// --- KONFIGURASI CORS EKSPLISIT ---
const allowedOrigins = [
  'http://localhost:3000', // Sesuaikan dengan port development frontend Anda jika perlu
  'https://absen-resto.vercel.app', // Production frontend Anda
  // Tambahkan origin lain jika diperlukan, seperti Postman ('http://localhost')
];

const corsOptions = {
  origin: function (origin, callback) {
    // Izinkan requests tanpa origin (misalnya dari curl atau Postman desktop)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true, // Jika Anda menggunakan cookie/session
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], // Tambahkan header lain jika perlu
};

// --- 2. PASANG MIDDLEWARE CORS & OPTIONS SEBELUM SEMUA ROUTE ---
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ⚠️ HARUS DI SINI — SEBELUM express.json() DAN ROUTE

app.use(cors(corsOptions));
// ------------------------------------

// Tangani preflight OPTIONS untuk semua rute
app.options('*', cors(corsOptions));

app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }, // tambah ini jika diperlukan oleh hosting DB
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-for-production'; // Gunakan secret yang kuat di production
const PORT = Number(process.env.PORT || 4000);

// Fungsi query untuk menangani kesalahan database
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error("Database Query Error:", err.message);
    // Melempar error agar bisa ditangani oleh blok try-catch di handler rute
    throw err;
  }
};

const createJwt = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Token tidak ditemukan.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { rows } = await query(
      `SELECT p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       FROM profiles p
       JOIN users u ON u.id = p.id
       WHERE p.id = $1`,
      [userId]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Pengguna tidak ditemukan.' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token tidak valid.' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token telah kadaluarsa.' });
    }
    // Untuk error lainnya
    return res.status(401).json({ success: false, message: 'Unauthorized: Gagal memverifikasi token.' });
  }
};


// Rute Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, full_name, nik, department, position } = req.body;

  if (!username || !password || !full_name || !nik || !department || !position) {
    return res.status(400).json({ success: false, message: 'Semua bidang wajib diisi.' });
  }

  try {
    // Cek duplikat username
    const { rows: usernameRows } = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameRows[0]) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan.' });
    }

    // Cek duplikat NIK
    const { rows: nikRows } = await query('SELECT id FROM profiles WHERE nik = $1', [nik]);
    if (nikRows[0]) {
      return res.status(400).json({ success: false, message: 'NIK sudah terdaftar.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Simpan user
    const userResult = await query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, passwordHash]
    );

    const userId = userResult.rows[0].id;

    // Simpan profile
    await query(
      `INSERT INTO profiles (id, full_name, nik, department, position, role)
       VALUES ($1, $2, $3, $4, $5, 'user')`,
      [userId, full_name, nik, department, position]
    );

    // Ambil data profil lengkap
    const profileResult = await query(
      `SELECT p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       FROM profiles p
       JOIN users u ON u.id = p.id
       WHERE p.id = $1`,
      [userId]
    );

    const token = createJwt(userId);
    return res.status(201).json({ success: true, data: { token, profile: profileResult.rows[0] } });
  } catch (error) {
    console.error('REGISTER ERROR:', error.message);
    // Tangani error constraint atau database lainnya jika perlu
    return res.status(500).json({ success: false, message: 'Gagal mendaftarkan pengguna.' });
  }
});


// Rute Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  try {
    const { rows } = await query(
      `SELECT u.id, u.password_hash, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       FROM users u
       JOIN profiles p ON p.id = u.id
       WHERE u.username = $1`,
      [username]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const profile = {
      id: user.id,
      username,
      full_name: user.full_name,
      nik: user.nik,
      department: user.department,
      position: user.position,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    const token = createJwt(user.id);
    return res.json({ success: true, data: { token, profile } });
  } catch (error) {
    console.error('LOGIN ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal login.' });
  }
});


// Rute Get Profile Saya
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  // Middleware authMiddleware sudah memastikan req.user tersedia
  return res.json({ success: true, data: { profile: req.user } });
});


// Rute Get Semua Profil (hanya untuk admin/mentor biasanya)
app.get('/api/profiles', authMiddleware, async (req, res) => {
  const { role } = req.query;
  const conditions = [];
  const params = [];

  if (role) {
    params.push(role);
    conditions.push(`p.role = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const { rows } = await query(
      `SELECT p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       FROM profiles p
       JOIN users u ON u.id = p.id
       ${whereClause}
       ORDER BY p.full_name`,
      params
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('GET PROFILES ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal mengambil daftar profil.' });
  }
});


// Rute Get Profil Spesifik
app.get('/api/profiles/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(
      `SELECT p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       FROM profiles p
       JOIN users u ON u.id = p.id
       WHERE p.id = $1`,
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Profil tidak ditemukan.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('GET PROFILE BY ID ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal mengambil profil.' });
  }
});


// Rute Get Data Absensi
app.get('/api/attendance', authMiddleware, async (req, res) => {
  const { userId, date } = req.query;
  const params = [];
  const conditions = [];

  if (userId) {
    params.push(userId);
    conditions.push(`a.user_id = $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`a.date = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const { rows } = await query(
      `SELECT a.*, json_build_object(
        'id', p.id,
        'username', u.username,
        'full_name', p.full_name,
        'nik', p.nik,
        'department', p.department,
        'position', p.position,
        'role', p.role,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) AS profile_info
      FROM attendance a
      LEFT JOIN profiles p ON p.id = a.user_id
      LEFT JOIN users u ON u.id = p.id
      ${whereClause}
      ORDER BY a.date DESC, a.created_at DESC`,
      params
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('GET ATTENDANCE ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data absensi.' });
  }
});


// Rute Buat Absensi Baru
app.post('/api/attendance', authMiddleware, async (req, res) => {
  const { user_id, date, check_in_time, status, note, scanned_by } = req.body;

  if (!user_id || !date || !check_in_time || !status) {
    return res.status(400).json({ success: false, message: 'Data absensi tidak lengkap.' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO attendance (user_id, date, check_in_time, status, note, scanned_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, date, check_in_time, status, note || '', scanned_by || null]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('CREATE ATTENDANCE ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan data absensi.' });
  }
});


// Rute Update Absensi
app.put('/api/attendance/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status absensi wajib diisi.' });
  }

  try {
    const { rows } = await query(
      `UPDATE attendance SET status = $1, note = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, note || '', id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Data absensi tidak ditemukan.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('UPDATE ATTENDANCE ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui data absensi.' });
  }
});


// Rute Get Pengaturan Jam Kerja
app.get('/api/work-settings', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM work_settings ORDER BY updated_at DESC LIMIT 1`, []);
    return res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    console.error('GET WORK SETTINGS ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan jam kerja.' });
  }
});


// Rute Simpan/Update Pengaturan Jam Kerja
app.post('/api/work-settings', authMiddleware, async (req, res) => {
  const { work_start, work_end, late_threshold_minutes } = req.body;

  if (!work_start || !work_end || typeof late_threshold_minutes !== 'number') {
    return res.status(400).json({ success: false, message: 'Data pengaturan tidak lengkap.' });
  }

  try {
    const existing = await query('SELECT id FROM work_settings ORDER BY updated_at DESC LIMIT 1', []);
    if (existing.rows[0]) {
      const { rows } = await query(
        `UPDATE work_settings SET work_start = $1, work_end = $2, late_threshold_minutes = $3, updated_by = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
        [work_start, work_end, late_threshold_minutes, req.user.id, existing.rows[0].id]
      );
      return res.json({ success: true, data: rows[0] });
    }

    const { rows } = await query(
      `INSERT INTO work_settings (work_start, work_end, late_threshold_minutes, updated_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [work_start, work_end, late_threshold_minutes, req.user.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('SAVE WORK SETTINGS ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan jam kerja.' });
  }
});


// Jalankan server
app.listen(PORT, () => {
  console.log(`Backend API berjalan di http://localhost:${PORT}`);
  console.log(`Origin yang diizinkan untuk CORS:`, allowedOrigins);
});

export default app; // Ekspor app jika Anda menggunakan framework yang membutuhkannya (seperti Vercel)