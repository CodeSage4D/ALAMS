"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, AlertTriangle, LogOut, ChevronRight, Award, TrendingUp, Monitor, User, BookOpen,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface AttendanceSummary {
  totalSessions: number;
  presentCount: number;
  partialCount: number;
  absentCount: number;
  attendancePercentage: number;
  totalPracticalHours: number;
}

interface AttendanceRecord {
  id: string;
  checkIn: string;
  checkOut: string | null;
  status: string;
  duration: number | null;
  practicalHours: number | null;
  date: string;
  subject: { name: string; code: string } | null;
  faculty: { fullName: string } | null;
  session: {
    computer: {
      pcNumber: string;
      deviceName: string;
      lab: { name: string };
    } | null;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PRESENT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    LATE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    PARTIAL: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    ABSENT: "bg-red-500/15 text-red-400 border-red-500/30",
    EXCUSED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    MANUAL_OVERRIDE: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  };
  const cls = styles[status] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-[#0d1117] border border-white/5 rounded-2xl p-5 flex items-start space-x-4 hover:border-white/10 transition">
      <div className={`p-2.5 rounded-xl ${color}`}><Icon size={20} /></div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-black text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<Record<string, string> | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  useEffect(() => {
    const token = localStorage.getItem("student_token");
    const raw = localStorage.getItem("student_user");
    if (!token || !raw) { router.push("/login"); return; }
    setUser(JSON.parse(raw));
    loadAttendance(token);
  }, [router]);

  async function loadAttendance(token: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/v1/student/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load attendance data.");
      const data = await res.json();
      setSummary(data.summary);
      setRecords(data.records);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("student_token");
    localStorage.removeItem("student_user");
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060913] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm">Loading academic records...</p>
        </div>
      </div>
    );
  }

  const pct = summary?.attendancePercentage ?? 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const ringColor = pct >= 75 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  const pctColor = pct >= 75 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-[#060913] text-white">
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#060913]/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-black text-[#060913] text-sm">A</div>
            <div>
              <p className="text-sm font-black tracking-wide">AURXON ALAMS</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Student Portal</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">
              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <User size={12} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{user?.fullName ?? "Student"}</p>
                <p className="text-[10px] text-gray-500">{user?.enrollmentNumber}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold transition"
            >
              <LogOut size={13} /><span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center space-x-3">
            <AlertTriangle size={16} /><span>{error}</span>
          </div>
        )}

        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/15 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white mb-1">
              Welcome back, <span className="text-emerald-400">{user?.fullName?.split(" ")[0] ?? "Student"}</span>
            </h1>
            <p className="text-gray-400 text-sm">
              Enrollment: <span className="text-white font-mono font-bold">{user?.enrollmentNumber}</span>
            </p>
          </div>
          <div className="hidden md:block">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
                <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle cx="65" cy="65" r={r} fill="none" stroke={ringColor} strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black ${pctColor}`}>{pct}%</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Attendance</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex space-x-2 bg-white/3 border border-white/5 rounded-xl p-1 w-fit">
          {(["overview", "history"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition capitalize ${activeTab === tab ? "bg-emerald-500 text-[#060913]" : "text-gray-400 hover:text-white"}`}>
              {tab === "overview" ? "Overview" : "Session History"}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard icon={TrendingUp} label="Attendance" value={`${summary.attendancePercentage}%`}
                sub={pct >= 75 ? "Meets 75% minimum" : "Below 75% threshold"}
                color={pct >= 75 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"} />
              <MetricCard icon={BookOpen} label="Total Sessions" value={summary.totalSessions}
                sub="Lab practicals attended" color="bg-blue-500/15 text-blue-400" />
              <MetricCard icon={Award} label="Practical Hours" value={`${summary.totalPracticalHours}h`}
                sub="Credited lab time" color="bg-purple-500/15 text-purple-400" />
              <MetricCard icon={Clock} label="Absences" value={summary.absentCount}
                sub={`${summary.partialCount} partial sessions`} color="bg-orange-500/15 text-orange-400" />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-[#0d1117] border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Breakdown</h3>
                {[
                  { label: "Present", count: summary.presentCount, color: "bg-emerald-500" },
                  { label: "Partial",  count: summary.partialCount,  color: "bg-amber-500"  },
                  { label: "Absent",   count: summary.absentCount,   color: "bg-red-500"    },
                ].map(item => {
                  const p = summary.totalSessions ? Math.round((item.count / summary.totalSessions) * 100) : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{item.label}</span>
                        <span className="text-white font-bold">{item.count} ({p}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-[#0d1117] border border-white/5 rounded-2xl p-5 md:col-span-2">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Recent Sessions</h3>
                <div className="space-y-3">
                  {records.slice(0, 5).map(rec => (
                    <div key={rec.id} className="flex items-center justify-between py-2 border-b border-white/3 last:border-0">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                          <Monitor size={14} className="text-gray-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{rec.subject?.name ?? "Free Session"}</p>
                          <p className="text-[10px] text-gray-500">
                            {rec.session?.computer?.lab?.name ?? "Lab"} &middot; {rec.session?.computer?.pcNumber ?? "PC"} &middot;{" "}
                            {new Date(rec.checkIn).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-gray-500">{rec.practicalHours ?? 0}h</span>
                        <StatusBadge status={rec.status} />
                      </div>
                    </div>
                  ))}
                  {records.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-6">No session history yet.</p>
                  )}
                </div>
                {records.length > 5 && (
                  <button onClick={() => setActiveTab("history")}
                    className="mt-4 text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 transition">
                    <span>View all {records.length} sessions</span>
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>

            {pct < 75 && (
              <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-xl flex items-start space-x-3">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-amber-400 text-sm font-bold">Attendance Below Minimum Threshold</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">
                    NAAC regulations require a minimum 75% attendance for practical credit eligibility.
                    Current: <strong>{pct}%</strong>. Please attend upcoming lab sessions.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-[#0d1117] border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h2 className="font-bold text-white">Complete Session History</h2>
              <span className="text-xs text-gray-500">{records.length} sessions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/2 border-b border-white/5 text-gray-500 text-xs font-bold uppercase tracking-wider">
                    {["Date","Subject","Faculty","Lab / PC","Check-in","Check-out","Duration","Hours","Status"].map(h => (
                      <th key={h} className="px-5 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/3">
                  {records.map(rec => (
                    <tr key={rec.id} className="hover:bg-white/2 transition">
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {new Date(rec.checkIn).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-white text-xs">{rec.subject?.name ?? "—"}</p>
                        {rec.subject?.code && <p className="text-gray-500 text-[10px] font-mono">{rec.subject.code}</p>}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{rec.faculty?.fullName ?? "—"}</td>
                      <td className="px-5 py-3">
                        <p className="text-white text-xs font-medium">{rec.session?.computer?.lab?.name ?? "—"}</p>
                        <p className="text-gray-500 text-[10px]">{rec.session?.computer?.pcNumber ?? ""}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs font-mono">
                        {new Date(rec.checkIn).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono">
                        {rec.checkOut
                          ? <span className="text-gray-400">{new Date(rec.checkOut).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}</span>
                          : <span className="text-emerald-400">Active</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{rec.duration != null ? `${rec.duration} min` : "—"}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{rec.practicalHours != null ? `${rec.practicalHours}h` : "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={rec.status} /></td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-500 text-sm">No attendance records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      <footer className="border-t border-white/5 mt-12 py-4">
        <p className="text-center text-xs text-gray-600">
          AURXON ALAMS Student Portal v1.0.0 &mdash; Records are read-only. Contact faculty for corrections.
        </p>
      </footer>
    </div>
  );
}
