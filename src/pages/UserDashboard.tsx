import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, Attendance, WorkSettings } from '../lib/supabase';
import {
  LogOut, QrCode, CheckCircle2, Clock, AlertCircle, Calendar,
  User, Building2, Briefcase, Hash, TrendingUp, ChevronDown,
} from 'lucide-react';
import QRCode from 'qrcode';

const STATUS_CONFIG = {
  hadir: { label: 'Hadir', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30', icon: CheckCircle2 },
  telat: { label: 'Telat', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30', icon: Clock },
  izin: { label: 'Izin', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30', icon: AlertCircle },
};

export default function UserDashboard() {
  const { profile, signOut } = useAuth();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [workSettings, setWorkSettings] = useState<WorkSettings | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!profile) return;

    const [attRes, wsRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', profile.id).order('date', { ascending: false }).limit(30),
      supabase.from('work_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (attRes.data) {
      setAttendances(attRes.data);
      const tod = attRes.data.find(a => a.date === today) ?? null;
      setTodayAttendance(tod);
    }
    if (wsRes.data) setWorkSettings(wsRes.data);
  }, [profile, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!profile) return;
    const qrData = JSON.stringify({ nik: profile.nik, name: profile.full_name, user_id: profile.id });
    QRCode.toDataURL(qrData, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(url => setQrDataUrl(url));
  }, [profile]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('attendance-user-' + profile.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `user_id=eq.${profile.id}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, loadData]);

  const stats = {
    hadir: attendances.filter(a => a.status === 'hadir').length,
    telat: attendances.filter(a => a.status === 'telat').length,
    izin: attendances.filter(a => a.status === 'izin').length,
    total: attendances.length,
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (d: Date) =>
    d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const formatCheckIn = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

  const attendanceRate = stats.total > 0
    ? Math.round(((stats.hadir + stats.telat) / stats.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-slate-700/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/30">
              {profile?.full_name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-tight">{profile?.full_name}</p>
              <p className="text-slate-400 text-xs">{profile?.position || 'Karyawan'}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Live Clock */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 shadow-xl shadow-blue-500/20">
          <p className="text-blue-200 text-sm mb-1">{formatDate(currentTime)}</p>
          <p className="text-white text-4xl font-bold tracking-tight font-mono">{formatTime(currentTime)}</p>
          {workSettings && (
            <p className="text-blue-200 text-xs mt-2">
              Jam Kerja: {workSettings.work_start.slice(0, 5)} – {workSettings.work_end.slice(0, 5)} &middot; Toleransi Telat: {workSettings.late_threshold_minutes} menit
            </p>
          )}
        </div>

        {/* Today Status */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Status Hari Ini</h2>
            <span className="text-slate-400 text-xs">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          {todayAttendance ? (
            <div className="flex items-center gap-3">
              {(() => {
                const cfg = STATUS_CONFIG[todayAttendance.status];
                const Icon = cfg.icon;
                return (
                  <>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.bg} flex-1`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                      <div>
                        <p className={`font-bold text-sm ${cfg.color}`}>{cfg.label}</p>
                        <p className="text-slate-400 text-xs">Pukul {formatCheckIn(todayAttendance.check_in_time)}</p>
                      </div>
                    </div>
                    {todayAttendance.note && (
                      <div className="bg-slate-700/50 rounded-xl px-3 py-2 flex-1">
                        <p className="text-slate-400 text-xs">Keterangan</p>
                        <p className="text-white text-xs mt-0.5">{todayAttendance.note}</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-700/30 rounded-xl p-3 border border-dashed border-slate-600/50">
              <QrCode className="w-5 h-5 text-slate-400" />
              <p className="text-slate-400 text-sm">Belum absen hari ini. Tunjukkan QR code kamu ke admin.</p>
            </div>
          )}
        </div>

        {/* QR Code Button */}
        <button
          onClick={() => setShowQR(true)}
          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all active:scale-95"
        >
          <QrCode className="w-5 h-5" />
          Tampilkan QR Code Saya
        </button>

        {/* Stats Grid */}
        <div>
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Rekap 30 Hari Terakhir
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 col-span-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs">Tingkat Kehadiran</span>
                <span className="text-white text-sm font-bold">{attendanceRate}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full transition-all duration-700"
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0%</span>
                <span>{stats.hadir + stats.telat} dari {stats.total} hari</span>
                <span>100%</span>
              </div>
            </div>
            {[
              { label: 'Hadir', count: stats.hadir, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/20' },
              { label: 'Telat', count: stats.telat, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-500/20' },
              { label: 'Izin', count: stats.izin, color: 'text-blue-400', bg: 'from-blue-500/10 to-blue-500/5', border: 'border-blue-500/20' },
              { label: 'Total', count: stats.total, color: 'text-slate-300', bg: 'from-slate-700/50 to-slate-700/30', border: 'border-slate-600/30' },
            ].map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.bg} border ${s.border} rounded-2xl p-4`}>
                <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-slate-400 text-sm mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Profile Info */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-400" /> Data Karyawan
          </h2>
          <div className="space-y-2.5">
            {[
              { icon: Hash, label: 'NIK', value: profile?.nik },
              { icon: User, label: 'Nama', value: profile?.full_name },
              { icon: Building2, label: 'Departemen', value: profile?.department },
              { icon: Briefcase, label: 'Jabatan', value: profile?.position },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 py-2 border-b border-slate-700/30 last:border-0">
                <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-slate-400 text-xs w-24 flex-shrink-0">{label}</span>
                <span className="text-white text-sm font-medium truncate">{value || '-'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance History */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Riwayat Kehadiran
          </h2>
          {attendances.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Belum ada data kehadiran.</p>
          ) : (
            <div className="space-y-2">
              {attendances.map(a => {
                const cfg = STATUS_CONFIG[a.status];
                const Icon = cfg.icon;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} border`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium">
                        {new Date(a.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {a.note && <p className="text-slate-500 text-xs truncate">{a.note}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      {a.check_in_time && (
                        <p className="text-slate-500 text-xs">{formatCheckIn(a.check_in_time)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* QR Modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">QR Code Absensi</h3>
              <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-white transition-colors">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white rounded-2xl p-4 flex items-center justify-center mb-4">
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-60 h-60" />}
            </div>
            <div className="text-center space-y-1">
              <p className="text-white font-semibold">{profile?.full_name}</p>
              <p className="text-slate-400 text-sm">NIK: {profile?.nik}</p>
              <p className="text-slate-400 text-sm">{profile?.department} &middot; {profile?.position}</p>
            </div>
            <p className="text-slate-500 text-xs text-center mt-4">Tunjukkan QR code ini ke admin untuk absen</p>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
