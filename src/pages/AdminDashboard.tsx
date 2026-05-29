import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Attendance, Profile, WorkSettings, getProfiles, getAttendancesByDate, getProfileById, getAttendanceForUser, createAttendance, updateAttendance, saveWorkSettings as saveWorkSettingsApi, getWorkSettings } from '../lib/api';
import { LogOut, QrCode, CheckCircle2, Clock, AlertCircle, Calendar, Users, Settings, X, Save, Scan, BarChart3, ChevronRight, UserCheck, Hash, Building2, Briefcase, User as UserIcon, CreditCard as Edit3 } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

type Tab = 'dashboard' | 'rekap' | 'scan' | 'settings';

const STATUS_CONFIG = {
  hadir: { label: 'Hadir', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30', dot: 'bg-emerald-400' },
  telat: { label: 'Telat', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30', dot: 'bg-amber-400' },
  izin: { label: 'Izin', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30', dot: 'bg-blue-400' },
};

type ScannedData = { nik: string; name: string; user_id: string };
type ConfirmModal = { scannedData: ScannedData; profile: Profile; arrivalTime: Date } | null;
type EditModal = { attendance: Attendance; profile: Profile } | null;

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const [todayAttendances, setTodayAttendances] = useState<(Attendance & { profiles: Profile })[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [workSettings, setWorkSettings] = useState<WorkSettings | null>(null);

  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [editModal, setEditModal] = useState<EditModal>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  const [wsForm, setWsForm] = useState({ work_start: '08:00', work_end: '17:00', late_threshold_minutes: 15 });
  const [editForm, setEditForm] = useState({ status: 'izin' as 'telat' | 'izin', note: '' });
  const [rekapDate, setRekapDate] = useState(new Date().toISOString().split('T')[0]);
  const [rekapAttendances, setRekapAttendances] = useState<(Attendance & { profiles: Profile })[]>([]);

  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scanDivId = 'qr-reader';
  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    const [todayRes, profilesRes, wsRes] = await Promise.all([
      getAttendancesByDate(today),
      getProfiles('user'),
      getWorkSettings(),
    ]);

    if (todayRes) setTodayAttendances(todayRes as (Attendance & { profiles: Profile })[]);
    if (profilesRes) setAllProfiles(profilesRes);
    if (wsRes) {
      setWorkSettings(wsRes);
      setWsForm({
        work_start: wsRes.work_start.slice(0, 5),
        work_end: wsRes.work_end.slice(0, 5),
        late_threshold_minutes: wsRes.late_threshold_minutes,
      });
    }
  }, [today]);

  const loadRekapData = useCallback(async () => {
    const data = await getAttendancesByDate(rekapDate);
    if (data) setRekapAttendances(data as (Attendance & { profiles: Profile })[]);
  }, [rekapDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadRekapData(); }, [loadRekapData]);

  useEffect(() => {
    // Direct backend API does not use Supabase realtime channels.
    return undefined;
  }, [loadData, loadRekapData]);

  async function startScanner() {
    setScanError('');
    setScanning(true);
    setTab('scan');
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode(scanDivId);
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            try {
              const data: ScannedData = JSON.parse(decodedText);
              await scanner.stop();
              setScanning(false);

              const fetchedProfile = await getProfileById(data.user_id);

              if (!fetchedProfile) {
                setScanError('Pengguna tidak ditemukan dalam sistem.');
                return;
              }

              const existing = await getAttendanceForUser(data.user_id, today);

              if (existing.length > 0) {
                setScanError(`${fetchedProfile.full_name} sudah absen hari ini (${STATUS_CONFIG[existing[0].status as keyof typeof STATUS_CONFIG].label}).`);
                return;
              }

              setConfirmModal({ scannedData: data, profile: fetchedProfile, arrivalTime: new Date() });
            } catch {
              setScanError('QR code tidak valid.');
            }
          },
          () => {}
        );
      } catch {
        setScanError('Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.');
        setScanning(false);
      }
    }, 300);
  }

  async function stopScanner() {
    if (qrScannerRef.current) {
      try { await qrScannerRef.current.stop(); } catch { /* ignore */ }
      qrScannerRef.current = null;
    }
    setScanning(false);
    setTab('dashboard');
  }

  async function confirmAttendance() {
    if (!confirmModal || !profile) return;
    setSaveLoading(true);
    try {
      const ws = workSettings;
      const arrivalMinutes = confirmModal.arrivalTime.getHours() * 60 + confirmModal.arrivalTime.getMinutes();
      let workStartMinutes = 8 * 60;
      if (ws) {
        const [h, m] = ws.work_start.split(':').map(Number);
        workStartMinutes = h * 60 + m;
      }
      const thresholdMinutes = ws?.late_threshold_minutes ?? 15;
      const status: 'hadir' | 'telat' = arrivalMinutes > workStartMinutes + thresholdMinutes ? 'telat' : 'hadir';

      await createAttendance({
        user_id: confirmModal.scannedData.user_id,
        date: today,
        check_in_time: confirmModal.arrivalTime.toISOString(),
        status,
        note: '',
        scanned_by: profile.id,
      });

      setConfirmModal(null);
      setScanError('');
    } finally {
      setSaveLoading(false);
    }
  }

  async function saveEditAttendance() {
    if (!editModal) return;
    setSaveLoading(true);
    try {
      await updateAttendance(editModal.attendance.id, {
        status: editForm.status,
        note: editForm.note,
      });
      setEditModal(null);
      await loadData();
      await loadRekapData();
    } finally {
      setSaveLoading(false);
    }
  }

  async function saveWorkSettings() {
    setSaveLoading(true);
    try {
      await saveWorkSettingsApi(wsForm);
      await loadData();
    } finally {
      setSaveLoading(false);
    }
  }

  const presentToday = todayAttendances.filter(a => a.status === 'hadir' || a.status === 'telat').length;
  const absentToday = allProfiles.length - todayAttendances.length;
  const lateToday = todayAttendances.filter(a => a.status === 'telat').length;
  const izinToday = todayAttendances.filter(a => a.status === 'izin').length;

  const TABS: { id: Tab; icon: typeof BarChart3; label: string }[] = [
    { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
    { id: 'rekap', icon: Calendar, label: 'Rekap' },
    { id: 'scan', icon: Scan, label: 'Scan QR' },
    { id: 'settings', icon: Settings, label: 'Pengaturan' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-slate-700/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-rose-500/30">
              A
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-tight">{profile?.full_name}</p>
              <p className="text-rose-400 text-xs font-medium">Administrator</p>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 transition-colors text-sm">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* ===== DASHBOARD TAB ===== */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-white text-xl font-bold">Dashboard Admin</h1>
              <p className="text-slate-400 text-sm">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Hadir Hari Ini', count: presentToday, color: 'text-emerald-400', icon: CheckCircle2, bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/20' },
                { label: 'Belum Absen', count: absentToday < 0 ? 0 : absentToday, color: 'text-slate-300', icon: Users, bg: 'from-slate-700/50 to-slate-700/30', border: 'border-slate-600/30' },
                { label: 'Telat', count: lateToday, color: 'text-amber-400', icon: Clock, bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-500/20' },
                { label: 'Izin', count: izinToday, color: 'text-blue-400', icon: AlertCircle, bg: 'from-blue-500/10 to-blue-500/5', border: 'border-blue-500/20' },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className={`bg-gradient-to-br ${s.bg} border ${s.border} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                    <p className="text-slate-400 text-xs mt-1">{s.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Total employees */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Total Karyawan</p>
                  <p className="text-slate-400 text-xs">Terdaftar dalam sistem</p>
                </div>
              </div>
              <p className="text-white text-2xl font-bold">{allProfiles.length}</p>
            </div>

            {/* Scan button */}
            <button
              onClick={startScanner}
              className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 transition-all active:scale-95"
            >
              <Scan className="w-5 h-5" /> Scan QR Karyawan
            </button>

            {/* Today list */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
              <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-400" /> Kehadiran Hari Ini ({todayAttendances.length})
              </h2>
              {todayAttendances.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Belum ada yang absen hari ini.</p>
              ) : (
                <div className="space-y-2">
                  {todayAttendances.map(a => {
                    const cfg = STATUS_CONFIG[a.status];
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                        <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {a.profiles?.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{a.profiles?.full_name}</p>
                          <p className="text-slate-500 text-xs">{a.profiles?.department}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                          {(a.status === 'telat' || a.status === 'izin') && (
                            <button
                              onClick={() => {
                                setEditModal({ attendance: a, profile: a.profiles });
                                setEditForm({ status: a.status as 'telat' | 'izin', note: a.note || '' });
                              }}
                              className="text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== REKAP TAB ===== */}
        {tab === 'rekap' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-white text-xl font-bold">Rekap Kehadiran</h1>
              <p className="text-slate-400 text-sm">Pilih tanggal untuk melihat rekap</p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Tanggal</label>
              <input
                type="date"
                value={rekapDate}
                onChange={e => setRekapDate(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Hadir', count: rekapAttendances.filter(a => a.status === 'hadir').length, color: 'text-emerald-400' },
                { label: 'Telat', count: rekapAttendances.filter(a => a.status === 'telat').length, color: 'text-amber-400' },
                { label: 'Izin', count: rekapAttendances.filter(a => a.status === 'izin').length, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-slate-400 text-xs">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
              <h2 className="text-white font-semibold text-sm mb-3">
                Daftar Hadir ({rekapAttendances.length} orang)
              </h2>
              {rekapAttendances.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Tidak ada data kehadiran pada tanggal ini.</p>
              ) : (
                <div className="space-y-2">
                  {rekapAttendances.map(a => {
                    const cfg = STATUS_CONFIG[a.status];
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-700/30">
                        <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {a.profiles?.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{a.profiles?.full_name}</p>
                          <p className="text-slate-500 text-xs">
                            {a.profiles?.department} &middot; NIK {a.profiles?.nik}
                          </p>
                          {a.note && <p className="text-slate-400 text-xs italic">{a.note}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                          {a.check_in_time && (
                            <p className="text-slate-500 text-xs">
                              {new Date(a.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {(a.status === 'telat' || a.status === 'izin') && (
                            <button
                              onClick={() => {
                                setEditModal({ attendance: a, profile: a.profiles });
                                setEditForm({ status: a.status as 'telat' | 'izin', note: a.note || '' });
                              }}
                              className="text-slate-500 hover:text-slate-300 transition-colors mt-1 flex justify-end"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== SCAN TAB ===== */}
        {tab === 'scan' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-white text-xl font-bold">Scan QR Code</h1>
                <p className="text-slate-400 text-sm">Arahkan kamera ke QR karyawan</p>
              </div>
              {scanning && (
                <button onClick={stopScanner} className="flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors text-sm">
                  <X className="w-4 h-4" /> Batal
                </button>
              )}
            </div>

            {scanError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
              <div id={scanDivId} className="w-full" style={{ minHeight: '300px' }} />
            </div>

            {!scanning && (
              <button
                onClick={startScanner}
                className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
              >
                <Scan className="w-5 h-5" /> Mulai Scan
              </button>
            )}
          </div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {tab === 'settings' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-white text-xl font-bold">Pengaturan</h1>
              <p className="text-slate-400 text-sm">Kelola jam kerja dan konfigurasi sistem</p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" /> Jam Kerja
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Jam Masuk</label>
                  <input
                    type="time"
                    value={wsForm.work_start}
                    onChange={e => setWsForm(p => ({ ...p, work_start: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Jam Pulang</label>
                  <input
                    type="time"
                    value={wsForm.work_end}
                    onChange={e => setWsForm(p => ({ ...p, work_end: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Toleransi Keterlambatan (menit)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={wsForm.late_threshold_minutes}
                  onChange={e => setWsForm(p => ({ ...p, late_threshold_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
              </div>
              <button
                onClick={saveWorkSettings}
                disabled={saveLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <Save className="w-4 h-4" /> {saveLoading ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>

            {/* All employees list */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
              <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" /> Daftar Karyawan ({allProfiles.length})
              </h2>
              {allProfiles.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Belum ada karyawan terdaftar.</p>
              ) : (
                <div className="space-y-2">
                  {allProfiles.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-700/30">
                      <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {p.full_name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{p.full_name}</p>
                        <p className="text-slate-500 text-xs">NIK: {p.nik} &middot; {p.department}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-700/50 z-30">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => t.id === 'scan' ? startScanner() : setTab(t.id)}
                className={`flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                  isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Confirm Attendance Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
                <QrCode className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Konfirmasi Kehadiran</h3>
                <p className="text-slate-400 text-sm">QR berhasil dipindai</p>
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-2xl p-4 space-y-3 mb-5">
              {[
                { icon: UserIcon, label: 'Nama', value: confirmModal.profile.full_name },
                { icon: Hash, label: 'NIK', value: confirmModal.profile.nik },
                { icon: Building2, label: 'Departemen', value: confirmModal.profile.department },
                { icon: Briefcase, label: 'Jabatan', value: confirmModal.profile.position },
                { icon: Clock, label: 'Jam Kedatangan', value: confirmModal.arrivalTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-400 text-xs w-28 flex-shrink-0">{label}</span>
                  <span className="text-white text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmAttendance}
                disabled={saveLoading}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                {saveLoading ? 'Menyimpan...' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Attendance Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold">Edit Keterangan</h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-700/50 rounded-xl">
              <p className="text-white text-sm font-semibold">{editModal.profile.full_name}</p>
              <p className="text-slate-400 text-xs">{editModal.profile.nik} &middot; {editModal.profile.department}</p>
              <p className="text-slate-400 text-xs mt-1">
                {new Date(editModal.attendance.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Status Kehadiran</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['telat', 'izin'] as const).map(s => {
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <button
                        key={s}
                        onClick={() => setEditForm(p => ({ ...p, status: s }))}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                          editForm.status === s
                            ? `${cfg.bg} ${cfg.color}`
                            : 'bg-slate-700/30 border-slate-600/50 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Alasan / Keterangan</label>
                <textarea
                  rows={3}
                  value={editForm.note}
                  onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))}
                  placeholder="Masukkan alasan atau keterangan..."
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={saveEditAttendance}
                disabled={saveLoading}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> {saveLoading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
