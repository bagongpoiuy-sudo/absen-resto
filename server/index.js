import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

dotenv.config();

const app = express();
// Konfigurasi CORS Dinamis & Fleksibel
app.use(cors({
  origin: function (origin, callback) {
    // Mengizinkan semua origin (termasuk localhost, vercel, postman, dll)
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }, // tambah ini
});
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const PORT = Number(process.env.PORT || 4000);

const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error("Database Query Error:", err.message);
    throw err; // Lempar error agar ditangkap oleh try-catch di rute API
  }
};

const createJwt = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const { rows } = await query(
      `select p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       from profiles p
       join users u on u.id = p.id
       where p.id = $1`,
      [userId]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  const { username, password, full_name, nik, department, position } = req.body;
  if (!username || !password || !full_name || !nik || !department || !position) {
    return res.status(400).json({ success: false, message: 'Semua bidang harus diisi.' });
  }

  try {
    const { rows: usernameRows } = await query('select id from users where username = $1', [username]);
    if (usernameRows[0]) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan.' });
    }

    const { rows: nikRows } = await query('select id from profiles where nik = $1', [nik]);
    if (nikRows[0]) {
      return res.status(400).json({ success: false, message: 'NIK sudah terdaftar.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await query(
      'insert into users (username, password_hash) values ($1, $2) returning id, username',
      [username, passwordHash]
    );

    const userId = userResult.rows[0].id;
    await query(
      `insert into profiles (id, full_name, nik, department, position, role)
       values ($1, $2, $3, $4, $5, 'user')`,
      [userId, full_name, nik, department, position]
    );

    const profileResult = await query(
      `select p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       from profiles p
       join users u on u.id = p.id
       where p.id = $1`,
      [userId]
    );

    const token = createJwt(userId);
    return res.json({ success: true, data: { token, profile: profileResult.rows[0] } });
  } catch (error) {
    console.error('REGISTER ERROR:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password diperlukan.' });
  }

  try {
    const { rows } = await query(
      `select u.id, u.password_hash, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
       from users u
       join profiles p on p.id = u.id
       where u.username = $1`,
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
    console.error(error);
    return res.status(500).json({ success: false, message: 'Gagal login.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  return res.json({ success: true, data: { profile: req.user } });
});

app.get('/api/profiles', authMiddleware, async (req, res) => {
  const { role } = req.query;
  const conditions = [];
  const params = [];

  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }

  const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const { rows } = await query(
    `select p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
     from profiles p
     join users u on u.id = p.id
     ${whereClause}
     order by p.full_name`,
    params
  );
  return res.json({ success: true, data: rows });
});

app.get('/api/profiles/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `select p.id, u.username, p.full_name, p.nik, p.department, p.position, p.role, p.created_at, p.updated_at
     from profiles p
     join users u on u.id = p.id
     where p.id = $1`,
    [id]
  );
  if (!rows[0]) {
    return res.status(404).json({ success: false, message: 'Profil tidak ditemukan.' });
  }
  return res.json({ success: true, data: rows[0] });
});

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

  const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const { rows } = await query(
    `select a.*, json_build_object(
      'id', p.id,
      'username', u.username,
      'full_name', p.full_name,
      'nik', p.nik,
      'department', p.department,
      'position', p.position,
      'role', p.role,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) as profiles
    from attendance a
    left join profiles p on p.id = a.user_id
    left join users u on u.id = p.id
    ${whereClause}
    order by a.date desc, a.created_at desc`,
    params
  );
  return res.json({ success: true, data: rows });
});

app.post('/api/attendance', authMiddleware, async (req, res) => {
  const { user_id, date, check_in_time, status, note, scanned_by } = req.body;
  if (!user_id || !date || !check_in_time || !status) {
    return res.status(400).json({ success: false, message: 'Data absensi tidak lengkap.' });
  }

  try {
    const { rows } = await query(
      `insert into attendance (user_id, date, check_in_time, status, note, scanned_by)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [user_id, date, check_in_time, status, note || '', scanned_by || null]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan absensi.' });
  }
});

app.put('/api/attendance/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status absensi diperlukan.' });
  }

  const { rows } = await query(
    `update attendance set status = $1, note = $2, updated_at = now() where id = $3 returning *`,
    [status, note || '', id]
  );
  if (!rows[0]) {
    return res.status(404).json({ success: false, message: 'Data absensi tidak ditemukan.' });
  }
  return res.json({ success: true, data: rows[0] });
});

app.get('/api/work-settings', authMiddleware, async (req, res) => {
  const { rows } = await query(`select * from work_settings order by updated_at desc limit 1`, []);
  return res.json({ success: true, data: rows[0] || null });
});

app.post('/api/work-settings', authMiddleware, async (req, res) => {
  const { work_start, work_end, late_threshold_minutes } = req.body;
  if (!work_start || !work_end || typeof late_threshold_minutes !== 'number') {
    return res.status(400).json({ success: false, message: 'Data pengaturan tidak lengkap.' });
  }

  const existing = await query('select id from work_settings order by updated_at desc limit 1', []);
  if (existing.rows[0]) {
    const { rows } = await query(
      `update work_settings set work_start = $1, work_end = $2, late_threshold_minutes = $3, updated_by = $4, updated_at = now() where id = $5 returning *`,
      [work_start, work_end, late_threshold_minutes, req.user.id, existing.rows[0].id]
    );
    return res.json({ success: true, data: rows[0] });
  }

  const { rows } = await query(
    `insert into work_settings (work_start, work_end, late_threshold_minutes, updated_by)
     values ($1, $2, $3, $4) returning *`,
    [work_start, work_end, late_threshold_minutes, req.user.id]
  );
  return res.json({ success: true, data: rows[0] });
});

app.listen(PORT, () => {
  console.log(`Backend API berjalan di http://localhost:${PORT}`);
});
