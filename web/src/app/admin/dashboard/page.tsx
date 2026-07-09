"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Users, Settings, FolderClosed, 
  AlertTriangle, Play, Square, UserPlus, Plus,
  ShieldCheck, RefreshCw, LogOut, Check, X, FileSpreadsheet,
  BarChart3, BookOpen, Clock
} from "lucide-react";

interface Lab {
  id: string;
  name: string;
  location: string;
  _count?: { computers: number };
}

interface Computer {
  id: string;
  pcNumber: string;
  deviceName: string;
  ipAddress: string;
  macAddress: string;
  fingerprint?: string;
  status: "ONLINE" | "OFFLINE" | "LOCKED" | "IN_USE" | "PENDING";
  fallbackEnabled: boolean;
  lab: { name: string };
  labId: string;
  lastSeen?: string;
  watchdogHeartbeat?: string | null;
  cpuUsage?: number | null;
  ramUsage?: number | null;
  loggedStudent?: string | null;
  policyStatus?: string | null;
}

interface Student {
  id: string;
  enrollmentNumber: string;
  fullName: string;
  isActive: boolean;
}

interface Attendance {
  id: string;
  user: { fullName: string; enrollmentNumber: string };
  session: {
    id: string;
    computer: { pcNumber: string; deviceName: string; lab: { name: string } };
    verificationMethod: string;
    loginTime: string;
    logoutTime: string | null;
    status: string;
  };
  checkIn: string;
  checkOut: string | null;
  status: string;
}

interface SecurityAlert {
  id: string;
  alertType: string;
  alertSeverity: "INFO" | "WARNING" | "CRITICAL";
  details: string;
  alertTime: string;
  resolved: boolean;
  computer?: { pcNumber: string; deviceName: string };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function AdminDashboard() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"monitor" | "students" | "labs" | "attendance" | "alerts" | "analytics" | "faculty" | "sessions" | "inventory">("monitor");
  
  // Data States
  const [labs, setLabs] = useState<Lab[]>([]);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [pendingComputers, setPendingComputers] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [pilotAnalytics, setPilotAnalytics] = useState<any>(null);
  
  // Interaction/Loading States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState(0);

  // Form States
  const [newLabName, setNewLabName] = useState("");
  const [newLabLoc, setNewLabLoc] = useState("");
  
  const [newPcNumber, setNewPcNumber] = useState("");
  const [newPcDeviceName, setNewPcDeviceName] = useState("");
  const [newPcIp, setNewPcIp] = useState("");
  const [newPcMac, setNewPcMac] = useState("");
  const [newPcLabId, setNewPcLabId] = useState("");

  const [newStudEnroll, setNewStudEnroll] = useState("");
  const [newStudName, setNewStudName] = useState("");
  const [newStudPass, setNewStudPass] = useState("");
  const [newStudPin, setNewStudPin] = useState("");

  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [selectedPC, setSelectedPC] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    const user = localStorage.getItem("admin_user");
    if (!token || !user) {
      router.push("/admin/login");
      return;
    }
    setAdminUser(JSON.parse(user));
  }, [router]);

  // Fetch dashboard data
  useEffect(() => {
    if (!adminUser) return;
    const token = localStorage.getItem("admin_token");
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };

        // Concurrent fetching
        const [labsRes, pcRes, pendingRes, studRes, attRes, alertRes, analyticsRes] = await Promise.all([
          fetch(API_URL + "/api/v1/admin/labs", { headers }),
          fetch(API_URL + "/api/v1/admin/computers", { headers }),
          fetch(API_URL + "/api/v1/admin/computers/pending", { headers }),
          fetch(API_URL + "/api/v1/admin/students", { headers }),
          fetch(API_URL + "/api/v1/admin/reports/attendance", { headers }),
          fetch(API_URL + "/api/v1/admin/logs/security", { headers }),
          fetch(API_URL + "/api/v1/admin/analytics/pilot", { headers }),
        ]);

        if (labsRes.ok) setLabs(await labsRes.json());
        if (pcRes.ok) setComputers(await pcRes.json());
        if (pendingRes.ok) setPendingComputers(await pendingRes.json());
        if (studRes.ok) setStudents(await studRes.json());
        if (attRes.ok) setAttendance(await attRes.json());
        if (alertRes.ok) setAlerts(await alertRes.json());
        if (analyticsRes.ok) setPilotAnalytics(await analyticsRes.json());
      } catch (err) {
        console.error("Dashboard pull error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh monitor grid every 8 seconds
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [adminUser, refreshes]);

  const triggerRefresh = () => setRefreshes(prev => prev + 1);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    router.push("/admin/login");
  };

  // --- ACTIONS ---
  const handleRemoteUnlock = async (computerId: string) => {
    setActionLoading(computerId);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(API_URL + "/api/v1/admin/computers/remote-unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ computerId }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Unlock command failed");
      } else {
        triggerRefresh();
      }
    } catch (e) {
      alert("Network exception communicating with API");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoteLock = async (computerId: string) => {
    setActionLoading(computerId);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(API_URL + "/api/v1/admin/computers/remote-lock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ computerId }),
      });

      if (!res.ok) {
        alert("Lock override command failed.");
      } else {
        triggerRefresh();
      }
    } catch (e) {
      alert("Network exception lock request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStudent = async (studentId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/students/${studentId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (res.ok) {
        setStudents(prev =>
          prev.map(s => (s.id === studentId ? { ...s, isActive: !currentStatus } : s))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleFallback = async (computerId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computerId}/fallback`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fallbackEnabled: !currentStatus }),
      });

      if (res.ok) {
        setComputers(prev =>
          prev.map(c => (c.id === computerId ? { ...c, fallbackEnabled: !currentStatus } : c))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabName) return;

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(API_URL + "/api/v1/admin/labs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newLabName, location: newLabLoc }),
      });

      if (res.ok) {
        setNewLabName("");
        setNewLabLoc("");
        triggerRefresh();
        showFeedback("Lab created successfully!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateComputer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPcLabId || !newPcNumber || !newPcDeviceName || !newPcIp || !newPcMac) {
      alert("Please fill in all workstation parameters");
      return;
    }

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(API_URL + "/api/v1/admin/computers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          labId: newPcLabId,
          pcNumber: newPcNumber,
          deviceName: newPcDeviceName,
          ipAddress: newPcIp,
          macAddress: newPcMac,
        }),
      });

      if (res.ok) {
        setNewPcNumber("");
        setNewPcDeviceName("");
        setNewPcIp("");
        setNewPcMac("");
        triggerRefresh();
        showFeedback("Workstation registered successfully!");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to register PC");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudEnroll || !newStudName || !newStudPass || !newStudPin) {
      alert("Fill in all student fields.");
      return;
    }

    try {
      const res = await fetch(API_URL + "/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentNumber: newStudEnroll,
          fullName: newStudName,
          password: newStudPass,
          pin: newStudPin,
          role: "STUDENT",
        }),
      });

      if (res.ok) {
        setNewStudEnroll("");
        setNewStudName("");
        setNewStudPass("");
        setNewStudPin("");
        triggerRefresh();
        showFeedback("Student profile added successfully!");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create student");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/logs/security/${alertId}/resolve`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, resolved: true } : a)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveComputer = async (
    computerId: string,
    pcNumber: string,
    labId: string,
    deviceName?: string,
    deviceGroup?: string
  ) => {
    if (!pcNumber || !labId) {
      alert("Please enter Seat number and select a Lab zone.");
      return;
    }

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(API_URL + "/api/v1/admin/computers/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ computerId, pcNumber, labId, deviceName, deviceGroup }),
      });

      if (res.ok) {
        showFeedback("Workstation approved and paired successfully!");
        triggerRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "Approval failed.");
      }
    } catch (e) {
      alert("Connection error executing pairing approval.");
    }
  };

  const handleUpdateComputerStatus = async (computerId: string, status: string) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computerId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showFeedback("Workstation status updated successfully!");
        triggerRefresh();
      } else {
        alert("Failed to update workstation status.");
      }
    } catch (e) {
      console.error(e);
      alert("Error contacting API server.");
    }
  };

  const downloadAttendanceCSV = () => {
    try {
      const headers = ["Student Name", "Enrollment Number", "Lab Zone", "PC Assignment", "Check-in Time", "Check-out Time", "Duration (min)", "Practical Hours", "Status"];
      const rows = attendance.map((record: any) => [
        record.user?.fullName || "",
        record.user?.enrollmentNumber || "",
        record.session?.computer?.lab?.name || "Override",
        record.session?.computer?.pcNumber || "Override",
        record.checkIn ? new Date(record.checkIn).toLocaleString() : "",
        record.checkOut ? new Date(record.checkOut).toLocaleString() : "Active",
        record.duration || 0,
        record.practicalHours || 0.0,
        record.status || ""
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ALAMS_Attendance_Report_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showFeedback("CSV report downloaded successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to export CSV report.");
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(""), 4000);
  };

  // Status Color Helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">ACTIVE</span>;
      case "APPROVED":
        return <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">APPROVED</span>;
      case "PENDING":
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">PENDING</span>;
      case "MAINTENANCE":
        return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">MAINTENANCE</span>;
      case "BLOCKED":
        return <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">BLOCKED</span>;
      case "RETIRED":
        return <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">RETIRED</span>;
      default:
        return <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 text-xs px-2.5 py-0.5 rounded-full font-bold">{status}</span>;
    }
  };

  return (
    <div className="flex h-screen bg-darkBg text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-darkCard border-r border-darkBorder flex flex-col justify-between shrink-0">
        <div className="py-6">
          <div className="px-6 flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center text-darkBg font-black">A</div>
            <div>
              <h2 className="font-black text-sm tracking-wide">AURXON ALAMS</h2>
              <p className="text-xs text-gray-500 font-bold uppercase">Control Deck</p>
            </div>
          </div>

          <nav className="space-y-1.5 px-3">
            <button
              onClick={() => setActiveTab("monitor")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "monitor" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <Activity size={18} />
              <span>Live Monitor</span>
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "analytics" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <BarChart3 size={18} />
              <span>Pilot Analytics</span>
            </button>
            <button
              onClick={() => setActiveTab("faculty")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "faculty" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <BookOpen size={18} />
              <span>Faculty Attendance</span>
            </button>
            <button
              onClick={() => setActiveTab("sessions")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "sessions" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <Clock size={18} />
              <span>Session Audits</span>
            </button>
            <button
              onClick={() => setActiveTab("students")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "students" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <Users size={18} />
              <span>Student Directory</span>
            </button>
            <button
              onClick={() => setActiveTab("labs")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "labs" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <Settings size={18} />
              <span>Labs & Hardware</span>
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "attendance" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <FolderClosed size={18} />
              <span>Attendance Ledger</span>
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "alerts" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <div className="relative">
                <AlertTriangle size={18} />
                {alerts.filter(a => !a.resolved).length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 border-2 border-darkCard rounded-full" />
                )}
              </div>
              <span>Security Audits</span>
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "inventory" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <FileSpreadsheet size={18} />
              <span>Asset Inventory</span>
            </button>
          </nav>
        </div>

        {/* User profile footer */}
        <div className="p-4 border-t border-darkBorder flex justify-between items-center bg-darkBg/30">
          <div>
            <p className="text-xs text-gray-500 font-bold">OPERATOR</p>
            <p className="text-sm font-bold text-gray-300 truncate w-36">{adminUser?.fullName || "Grace Hopper"}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-darkHover transition"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-gradient-to-b from-[#0F172A] to-darkBg">
        {/* Top Header */}
        <header className="h-16 border-b border-darkBorder flex items-center justify-between px-8 bg-darkCard/50 shrink-0">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-black capitalize tracking-tight">{activeTab} Control Suite</h1>
            {loading && <RefreshCw size={14} className="animate-spin text-gray-500" />}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={triggerRefresh}
              className="p-2 bg-darkCard hover:bg-darkHover text-gray-400 hover:text-white rounded-lg border border-darkBorder transition flex items-center space-x-2 text-xs font-semibold"
            >
              <RefreshCw size={14} />
              <span>Refresh Deck</span>
            </button>
          </div>
        </header>

        {/* Tab contents wrapper */}
        <div className="p-8 flex-1">
          {feedbackMsg && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-center space-x-2 animate-fade-in shadow-lg">
              <ShieldCheck size={18} />
              <span className="font-semibold">{feedbackMsg}</span>
            </div>
          )}

          {/* TAB 1: LIVE MONITOR GRID */}
          {activeTab === "monitor" && (
            <div className="space-y-8">
              {/* Stat metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Terminals</span>
                  <span className="text-3xl font-black mt-2 text-emerald-400">
                    {computers.filter(c => c.status === "IN_USE").length}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Locked Online</span>
                  <span className="text-3xl font-black mt-2 text-amber-400">
                    {computers.filter(c => c.status === "LOCKED").length}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Standby</span>
                  <span className="text-3xl font-black mt-2 text-sky-400">
                    {computers.filter(c => c.status === "ONLINE").length + computers.filter(c => c.status === "LOCKED").length + computers.filter(c => c.status === "IN_USE").length}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Open Security Alerts</span>
                  <span className={`text-3xl font-black mt-2 ${alerts.filter(a => !a.resolved).length > 0 ? "text-red-400" : "text-gray-400"}`}>
                    {alerts.filter(a => !a.resolved).length}
                  </span>
                </div>
              </div>

              {/* Faculty Command Deck */}
              {(adminUser?.role === "FACULTY" || adminUser?.role === "ADMIN" || adminUser?.role === "SUPERVISOR") && (
                <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 space-y-4 shadow-xl mb-8">
                  <div className="flex items-center space-x-2 text-emerald-400 border-b border-darkBorder pb-3">
                    <Activity size={18} />
                    <h3 className="font-bold text-base text-white">Faculty Command Deck & Live Class Controller</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Select Subject Class</label>
                      <select
                        id="faculty_subject_select"
                        className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-48 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="CS-301">CS-301: Data Structures</option>
                        <option value="CS-302">CS-302: Computer Networks</option>
                        <option value="CS-303">CS-303: Operating Systems</option>
                      </select>
                    </div>
                    
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Select Lab Zone</label>
                      <select
                        id="faculty_lab_select"
                        className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-40 text-white focus:outline-none focus:border-emerald-500"
                      >
                        {labs.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center space-x-2 mt-4">
                      <button
                        onClick={async () => {
                          const subSel = document.getElementById("faculty_subject_select") as HTMLSelectElement;
                          const labSel = document.getElementById("faculty_lab_select") as HTMLSelectElement;
                          const token = localStorage.getItem("admin_token");
                          try {
                            const res = await fetch(API_URL + "/api/v1/admin/reports/start-practical", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ subjectId: subSel?.value, labId: labSel?.value }),
                            });
                            if (res.ok) showFeedback("Practical class session successfully started!");
                          } catch (e) {
                            alert("Network error starting practical.");
                          }
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-lg text-xs transition"
                      >
                        Start Practical
                      </button>
                      <button
                        onClick={async () => {
                          const subSel = document.getElementById("faculty_subject_select") as HTMLSelectElement;
                          const labSel = document.getElementById("faculty_lab_select") as HTMLSelectElement;
                          const token = localStorage.getItem("admin_token");
                          try {
                            const res = await fetch(API_URL + "/api/v1/admin/reports/end-practical", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ subjectId: subSel?.value, labId: labSel?.value }),
                            });
                            if (res.ok) showFeedback("Practical class session ended.");
                          } catch (e) {
                            alert("Network error ending practical.");
                          }
                        }}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold rounded-lg text-xs transition"
                      >
                        End Practical
                      </button>
                    </div>

                    <div className="h-8 w-[1px] bg-darkBorder self-end mx-2" />

                    <div className="flex items-center space-x-2 mt-4">
                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to broadcast LOCK command to ALL online terminals?")) return;
                          const token = localStorage.getItem("admin_token");
                          try {
                            const res = await fetch(API_URL + "/api/v1/admin/computers/remote-lock-all", {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                              showFeedback("Sent remote LOCK command to all workstations!");
                              triggerRefresh();
                            }
                          } catch (e) {
                            alert("Network error broadcasting lock.");
                          }
                        }}
                        className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold rounded-lg text-xs transition"
                      >
                        Lock All Workstations
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to FORCE LOGOUT all active student sessions?")) return;
                          const token = localStorage.getItem("admin_token");
                          try {
                            const res = await fetch(API_URL + "/api/v1/admin/computers/remote-end-all", {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                              showFeedback("Terminated all active student sessions successfully.");
                              triggerRefresh();
                            }
                          } catch (e) {
                            alert("Network error terminating sessions.");
                          }
                        }}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-lg text-xs transition"
                      >
                        Force End All Sessions
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Approvals Section */}
              {pendingComputers.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-4 shadow-xl mb-8 animate-pulse-slow">
                  <div className="flex items-center space-x-2 text-amber-400 border-b border-darkBorder pb-3">
                    <AlertTriangle size={18} />
                    <h3 className="font-bold text-base text-white">Pending Workstation Enrollments ({pendingComputers.length})</h3>
                  </div>
                  <div className="grid gap-4">
                    {pendingComputers.map(pc => {
                      return (
                        <div key={pc.id} className="bg-darkCard border border-amber-500/10 hover:border-amber-500/30 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition">
                          <div className="space-y-1">
                            <p className="font-mono text-xs text-amber-400 font-bold uppercase">Fingerprint: {pc.fingerprint?.substring(0, 16) || "Pending..."}</p>
                            <p className="font-bold text-white text-sm">{pc.deviceName}</p>
                            <p className="text-xs text-gray-400">{pc.macAddress} | {pc.ipAddress}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                             <input
                              type="text"
                              placeholder="Seat / PC No. (e.g. PC-01)"
                              id={`pc_no_${pc.id}`}
                              className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-32 text-white focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Friendly Name"
                              id={`pc_name_${pc.id}`}
                              defaultValue={pc.deviceName}
                              className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-36 text-white focus:outline-none"
                            />
                            <select
                              id={`pc_group_${pc.id}`}
                              className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-32 text-white focus:outline-none"
                            >
                              <option value="Workstation">Workstation</option>
                              <option value="Server">Server</option>
                              <option value="Kiosk">Kiosk</option>
                              <option value="Lab PC">Lab PC</option>
                            </select>
                            <select
                              id={`pc_lab_${pc.id}`}
                              className="px-3 py-2 bg-darkBg border border-darkBorder rounded-lg text-xs w-44 text-white focus:outline-none"
                            >
                              <option value="">Assign Lab Zone...</option>
                              {labs.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const numInput = document.getElementById(`pc_no_${pc.id}`) as HTMLInputElement;
                                const nameInput = document.getElementById(`pc_name_${pc.id}`) as HTMLInputElement;
                                const labSel = document.getElementById(`pc_lab_${pc.id}`) as HTMLSelectElement;
                                const groupSel = document.getElementById(`pc_group_${pc.id}`) as HTMLSelectElement;
                                handleApproveComputer(pc.id, numInput?.value, labSel?.value, nameInput?.value, groupSel?.value);
                              }}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-lg text-xs transition"
                            >
                              Approve & Pair
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grid Layout of PCs */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white tracking-wide">Workstation Session Registry</h3>
                {computers.length === 0 ? (
                  <div className="text-center py-20 bg-darkCard border border-darkBorder rounded-2xl text-gray-500">
                    No computers registered in system. Configure hardware under "Labs & Hardware".
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {computers.map(pc => {
                      const isActiveSession = pc.status === "IN_USE";
                      
                      // Calculate Client Heartbeat (online if lastSeen is under 15 seconds)
                      const isClientOnline = pc.status !== "OFFLINE" && pc.lastSeen != null && (Date.now() - new Date(pc.lastSeen).getTime()) < 15000;
                      
                      // Calculate Watchdog status (active if watchdogHeartbeat is under 20 seconds)
                      const isWatchdogActive = pc.watchdogHeartbeat && (Date.now() - new Date(pc.watchdogHeartbeat).getTime()) < 20000;

                      return (
                        <div
                          key={pc.id}
                          className="bg-darkCard border border-darkBorder rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-xl hover:border-darkHover transition"
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-lg font-black text-white">{pc.pcNumber}</span>
                              {getStatusBadge(pc.status)}
                            </div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{pc.deviceName}</p>
                            <p className="text-xs text-gray-400">{pc.lab?.name || "Unassigned"}</p>
                          </div>

                          <div className="text-xs border-t border-darkBorder pt-4 space-y-2.5">
                            <div className="flex justify-between text-gray-500">
                              <span>IP Allocation:</span>
                              <span className="text-gray-300 font-semibold">{pc.ipAddress}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Active User:</span>
                              <span className="text-gray-300 font-semibold truncate max-w-[120px]" title={pc.loggedStudent || "None"}>{pc.loggedStudent || "None"}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>CPU / RAM:</span>
                              <span className="text-gray-300 font-semibold">
                                {pc.cpuUsage !== undefined && pc.cpuUsage !== null ? `${pc.cpuUsage.toFixed(0)}%` : "—"} / {pc.ramUsage !== undefined && pc.ramUsage !== null ? `${pc.ramUsage.toFixed(0)}%` : "—"}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Local Fallback:</span>
                              <span className={pc.fallbackEnabled ? "text-emerald-400" : "text-red-400"}>
                                {pc.fallbackEnabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Client Agent:</span>
                              <span className={isClientOnline ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                {isClientOnline ? "ONLINE" : "OFFLINE"}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Watchdog Service:</span>
                              <span className={isWatchdogActive ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                {isWatchdogActive ? "ACTIVE" : "MISSING"}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Last Contact:</span>
                              <span className="text-gray-400 font-mono text-[10px]">
                                {pc.lastSeen ? new Date(pc.lastSeen).toLocaleTimeString() : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Control overrides */}
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            {isActiveSession ? (
                              <button
                                onClick={() => handleRemoteLock(pc.id)}
                                disabled={actionLoading === pc.id}
                                className="col-span-2 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                              >
                                <Square size={12} fill="white" />
                                <span>Force Lock</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRemoteUnlock(pc.id)}
                                disabled={actionLoading === pc.id || pc.status === "OFFLINE"}
                                className="col-span-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-[#1F2937] text-darkBg disabled:text-gray-600 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                              >
                                <Play size={12} fill="currentColor" />
                                <span>Bypass Unlock</span>
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

          {/* TAB 2: STUDENT MANAGEMENT */}
          {activeTab === "students" && (
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Table of students */}
              <div className="lg:col-span-2 bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center">
                  <h3 className="font-bold text-lg text-white">Student Enrollment Index</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">Enrollment Number</th>
                        <th className="p-4">Full Name</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder">
                      {students.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-gray-500">
                            No student accounts found. Add profiles using the enrollment form.
                          </td>
                        </tr>
                      ) : (
                        students.map(student => (
                          <tr key={student.id} className="hover:bg-darkBg/10 transition">
                            <td className="p-4 font-mono font-bold text-emerald-400">{student.enrollmentNumber}</td>
                            <td className="p-4 text-gray-200">{student.fullName}</td>
                            <td className="p-4">
                              {student.isActive ? (
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-semibold">Active</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-semibold">Suspended</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleToggleStudent(student.id, student.isActive)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${student.isActive ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"}`}
                              >
                                {student.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Student Form */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 h-fit shadow-xl space-y-6">
                <div className="flex items-center space-x-2 text-emerald-400 border-b border-darkBorder pb-4">
                  <UserPlus size={20} />
                  <h3 className="font-bold text-base text-white">Enroll Student Profile</h3>
                </div>

                <form onSubmit={handleAddStudent} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Enrollment Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ENR003"
                      value={newStudEnroll}
                      onChange={e => setNewStudEnroll(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Stephen Hawking"
                      value={newStudName}
                      onChange={e => setNewStudName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Login Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={newStudPass}
                      onChange={e => setNewStudPass(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Fallback PIN (6-digits)</label>
                    <input
                      type="password"
                      required
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={newStudPin}
                      onChange={e => setNewStudPin(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-xl text-sm transition shadow-lg"
                  >
                    Register Student Account
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: LABS & HARDWARE */}
          {activeTab === "labs" && (
            <div className="space-y-8">
              {/* Lab registration & listings split */}
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Lab CRUD */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 h-fit shadow-xl space-y-6">
                  <div className="flex items-center space-x-2 text-emerald-400 border-b border-darkBorder pb-4">
                    <Plus size={20} />
                    <h3 className="font-bold text-base text-white">Create Computer Lab</h3>
                  </div>

                  <form onSubmit={handleCreateLab} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lab Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Lovelace Coding Center"
                        value={newLabName}
                        onChange={e => setNewLabName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Location/Room</label>
                      <input
                        type="text"
                        placeholder="e.g. Building B - 2nd Floor"
                        value={newLabLoc}
                        onChange={e => setNewLabLoc(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-xl text-sm transition shadow-lg"
                    >
                      Create Lab
                    </button>
                  </form>
                </div>

                {/* PC Registration */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 h-fit shadow-xl space-y-6">
                  <div className="flex items-center space-x-2 text-emerald-400 border-b border-darkBorder pb-4">
                    <Plus size={20} />
                    <h3 className="font-bold text-base text-white">Pair Workstation (PC)</h3>
                  </div>

                  <form onSubmit={handleCreateComputer} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Assign Lab</label>
                      <select
                        required
                        value={newPcLabId}
                        onChange={e => setNewPcLabId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                      >
                        <option value="">Select Lab Assignment...</option>
                        {labs.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">PC Number</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. PC-A03"
                          value={newPcNumber}
                          onChange={e => setNewPcNumber(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Device Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. LAB-TURING-03"
                          value={newPcDeviceName}
                          onChange={e => setNewPcDeviceName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">IP Allocation</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 10.0.3.15"
                        value={newPcIp}
                        onChange={e => setNewPcIp(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">MAC Address</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 00:1A:2B:3C:4D:6E"
                        value={newPcMac}
                        onChange={e => setNewPcMac(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-sm text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-xl text-sm transition shadow-lg"
                    >
                      Register Workstation
                    </button>
                  </form>
                </div>

                {/* Labs Summary List */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 h-fit shadow-xl space-y-6">
                  <h3 className="font-bold text-lg text-white border-b border-darkBorder pb-4">Lab Overview</h3>
                  {labs.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center">No labs registered yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {labs.map(l => (
                        <div key={l.id} className="p-4 bg-darkBg/30 border border-darkBorder rounded-xl flex justify-between items-center">
                          <div>
                            <p className="font-bold text-white text-sm">{l.name}</p>
                            <p className="text-xs text-gray-500">{l.location}</p>
                          </div>
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded border border-emerald-500/20">
                            {l._count?.computers || 0} PCs
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Workstations hardware list */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-darkBorder">
                  <h3 className="font-bold text-lg text-white">Registered Workstation Network Allocations</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">PC Code</th>
                        <th className="p-4">Device Hostname</th>
                        <th className="p-4">IP Address</th>
                        <th className="p-4">MAC Address</th>
                        <th className="p-4">Lab Zone</th>
                        <th className="p-4 text-center">PIN Fallback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder">
                      {computers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-500">
                            No paired workstations registered.
                          </td>
                        </tr>
                      ) : (
                        computers.map(pc => (
                          <tr key={pc.id} className="hover:bg-darkBg/10 transition">
                            <td className="p-4 font-bold text-white">{pc.pcNumber}</td>
                            <td className="p-4 font-mono text-gray-300">{pc.deviceName}</td>
                            <td className="p-4 text-gray-400">{pc.ipAddress}</td>
                            <td className="p-4 font-mono text-gray-400 text-xs">{pc.macAddress}</td>
                            <td className="p-4 text-gray-300">{pc.lab?.name}</td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleToggleFallback(pc.id, pc.fallbackEnabled)}
                                className={`px-2.5 py-1 rounded text-xs font-bold border transition ${pc.fallbackEnabled ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}
                              >
                                {pc.fallbackEnabled ? "Allowed" : "Blocked"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ATTENDANCE LEDGER */}
          {activeTab === "attendance" && (
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-darkBorder flex justify-between items-center">
                <h3 className="font-bold text-lg text-white">Daily Attendance Ledger</h3>
                <button
                  onClick={() => alert("CSV Export Triggered (Simulated)")}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                >
                  <FileSpreadsheet size={14} />
                  <span>Export to Excel</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                      <th className="p-4">Student Name</th>
                      <th className="p-4">Enrollment Number</th>
                      <th className="p-4">Zone / Lab</th>
                      <th className="p-4">PC number</th>
                      <th className="p-4">Check-In Time</th>
                      <th className="p-4">Check-Out Time</th>
                      <th className="p-4 text-center">Attendance Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder">
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          No session entries logged. Waiting for lock overrides or QR logins.
                        </td>
                      </tr>
                    ) : (
                      attendance.map(record => (
                        <tr key={record.id} className="hover:bg-darkBg/10 transition">
                          <td className="p-4 font-semibold text-white">{record.user.fullName}</td>
                          <td className="p-4 font-mono font-bold text-emerald-400">{record.user.enrollmentNumber}</td>
                          <td className="p-4 text-gray-400">{record.session?.computer?.lab?.name || "Override"}</td>
                          <td className="p-4 text-gray-300">{record.session?.computer?.pcNumber || "Override"}</td>
                          <td className="p-4 text-xs font-mono text-gray-400">{new Date(record.checkIn).toLocaleString()}</td>
                          <td className="p-4 text-xs font-mono text-gray-400">
                            {record.checkOut ? new Date(record.checkOut).toLocaleString() : (
                              <span className="text-emerald-400 animate-pulse font-bold">Active User session</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold uppercase">
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY AUDITS */}
          {activeTab === "alerts" && (
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-darkBorder">
                <h3 className="font-bold text-lg text-white">Lab Security Incident Log</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                      <th className="p-4">PC Target</th>
                      <th className="p-4">Incident Trigger</th>
                      <th className="p-4">Severity</th>
                      <th className="p-4">Incident Log details</th>
                      <th className="p-4">Logged Time</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder">
                    {alerts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          Zero security audit incidents detected. System secure.
                        </td>
                      </tr>
                    ) : (
                      alerts.map(alert => (
                        <tr key={alert.id} className="hover:bg-darkBg/10 transition">
                          <td className="p-4 font-bold text-white">
                            {alert.computer ? `${alert.computer.pcNumber} (${alert.computer.deviceName})` : "Global"}
                          </td>
                          <td className="p-4 text-gray-300 font-mono text-xs">{alert.alertType}</td>
                          <td className="p-4">
                            {alert.alertSeverity === "CRITICAL" ? (
                              <span className="px-2.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-full">CRITICAL</span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-full">WARNING</span>
                            )}
                          </td>
                          <td className="p-4 text-gray-400 text-xs leading-relaxed max-w-sm truncate" title={alert.details}>{alert.details}</td>
                          <td className="p-4 text-xs font-mono text-gray-400">{new Date(alert.alertTime).toLocaleString()}</td>
                          <td className="p-4 text-center">
                            {alert.resolved ? (
                              <span className="text-gray-500 text-xs font-bold flex items-center justify-center space-x-1">
                                <Check size={12} />
                                <span>Resolved</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-darkBg font-bold rounded-lg text-xs transition"
                              >
                                Resolve
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: PILOT ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-8 animate-fade-in">
              {/* Analytics Header Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder shadow-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Login Success Rate</span>
                    <h3 className="text-3xl font-black mt-2 text-emerald-400">
                      {pilotAnalytics ? `${pilotAnalytics.loginSuccessRate}%` : "—"}
                    </h3>
                    <p className="text-xs text-gray-400 mt-2">
                      {pilotAnalytics
                        ? `${pilotAnalytics.successfulLogins} success · ${pilotAnalytics.failedLoginAlerts} failed`
                        : "Awaiting data"}
                    </p>
                  </div>
                  <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <ShieldCheck size={28} />
                  </div>
                </div>

                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder shadow-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Avg QR Unlock Time</span>
                    <h3 className="text-3xl font-black mt-2 text-sky-400">
                      {pilotAnalytics?.avgQrLatencyMs != null
                        ? `${(pilotAnalytics.avgQrLatencyMs / 1000).toFixed(1)}s`
                        : "No data yet"}
                    </h3>
                    <p className="text-xs text-gray-400 mt-2">
                      {pilotAnalytics?.avgPinLatencyMs != null
                        ? `PIN fallback avg: ${(pilotAnalytics.avgPinLatencyMs / 1000).toFixed(1)}s`
                        : `From ${pilotAnalytics?.qrSampleCount ?? 0} QR sessions`}
                    </p>
                  </div>
                  <div className="p-3.5 bg-sky-500/10 text-sky-400 rounded-xl">
                    <Clock size={28} />
                  </div>
                </div>

                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder shadow-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Bypasses Blocked</span>
                    <h3 className="text-3xl font-black mt-2 text-amber-400">
                      {alerts.filter(a => a.alertType === "watchdog_kill").length}
                    </h3>
                    <p className="text-xs text-gray-400 mt-2">Logoffs triggered by Watchdog</p>
                  </div>
                  <div className="p-3.5 bg-amber-500/10 text-amber-400 rounded-xl">
                    <AlertTriangle size={28} />
                  </div>
                </div>
              </div>

              {/* Usage Charts & Metrics */}
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Visual Custom Chart: Active Sessions per Hour */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl space-y-6">
                  <h3 className="font-bold text-lg text-white">Pilot Active Sessions per Hour</h3>
                  <div className="h-64 flex items-end gap-3 pt-6 border-b border-darkBorder pb-2">
                    {/* Simulated 8 hours class schedule with custom tall columns */}
                    {[12, 28, 45, 38, 15, 82, 95, 60, 20, 5].map((val, idx) => {
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                          <div 
                            style={{ height: `${val}%` }} 
                            className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md hover:from-emerald-400 hover:to-emerald-300 transition duration-300 relative group cursor-pointer"
                          >
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-darkBg text-white text-[10px] px-1.5 py-0.5 rounded border border-darkBorder opacity-0 group-hover:opacity-100 transition">
                              {val}%
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-bold uppercase">{8 + idx}:00</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 text-center">Workstation utilization curve mapped across active school periods.</p>
                </div>

                {/* Validation Diagnostics summary */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl space-y-4">
                  <h3 className="font-bold text-lg text-white">Pilot Diagnostics Audit Checklist</h3>
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center text-sm border-b border-darkBorder/40 pb-2">
                      <span className="text-gray-400">Deployed Workstations</span>
                      <span className="text-white font-bold">{computers.length} / 10 Target</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-darkBorder/40 pb-2">
                      <span className="text-gray-400">Watchdog Active Ratio</span>
                      <span className="text-emerald-400 font-bold">
                        {((computers.filter(c => c.watchdogHeartbeat && (Date.now() - new Date(c.watchdogHeartbeat).getTime()) < 20000).length / (computers.length || 1)) * 100).toFixed(0)}% running
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-darkBorder/40 pb-2">
                      <span className="text-gray-400">Database Engine Host</span>
                      <span className="text-gray-300 font-mono text-xs font-semibold">Local PostgreSQL (Dev Pool)</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-darkBorder/40 pb-2">
                      <span className="text-gray-400">Cloud Sync Status</span>
                      <span className="text-amber-400 text-xs font-semibold uppercase">Pending Setup</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: FACULTY ATTENDANCE */}
          {activeTab === "faculty" && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Search Students</label>
                  <input
                    type="text"
                    placeholder="Search by name or enrollment..."
                    id="facultySearchInput"
                    onChange={() => triggerRefresh()}
                    className="w-full px-4 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Lab Select</label>
                  <select
                    id="facultyLabSelect"
                    onChange={() => triggerRefresh()}
                    className="w-full px-4 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white w-48"
                  >
                    <option value="">All Zones / Labs</option>
                    {labs.map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Class Check-in List */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center">
                  <h3 className="font-bold text-lg text-white">Live Classroom Attendance Roster</h3>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={downloadAttendanceCSV}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-lg text-xs transition flex items-center space-x-1.5"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Export CSV Report</span>
                    </button>
                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-bold">
                      Class active: {attendance.filter(r => !r.checkOut).length} students logged in
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">Student Name</th>
                        <th className="p-4">Enrollment Number</th>
                        <th className="p-4">Lab / Room</th>
                        <th className="p-4">PC Assignment</th>
                        <th className="p-4">Logged Time</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder">
                      {(() => {
                        const searchEl = document.getElementById("facultySearchInput") as HTMLInputElement;
                        const labEl = document.getElementById("facultyLabSelect") as HTMLSelectElement;
                        const query = searchEl?.value?.toLowerCase() || "";
                        const labFilter = labEl?.value || "";

                        const filtered = attendance.filter(record => {
                          const matchesQuery = record.user.fullName.toLowerCase().includes(query) ||
                                               record.user.enrollmentNumber.toLowerCase().includes(query);
                          const matchesLab = !labFilter || (record.session?.computer?.lab?.name === labFilter);
                          return matchesQuery && matchesLab;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-500">
                                No active attendance match found.
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map(record => (
                          <tr key={record.id} className="hover:bg-darkBg/10 transition">
                            <td className="p-4 font-semibold text-white">{record.user.fullName}</td>
                            <td className="p-4 font-mono font-bold text-emerald-400">{record.user.enrollmentNumber}</td>
                            <td className="p-4 text-gray-300">{record.session?.computer?.lab?.name || "Override"}</td>
                            <td className="p-4 font-bold text-white">{record.session?.computer?.pcNumber || "Override"}</td>
                            <td className="p-4 text-xs font-mono text-gray-400">
                              {new Date(record.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-4 text-center">
                              {record.checkOut ? (
                                <span className="px-2.5 py-0.5 bg-gray-500/10 text-gray-400 border border-gray-500/20 rounded-full text-xs font-bold">DISCONNECTED</span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold animate-pulse">PRESENT</span>
                              )}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SESSION AUDIT DASHBOARD */}
          {activeTab === "sessions" && (
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl animate-fade-in">
              <div className="p-6 border-b border-darkBorder">
                <h3 className="font-bold text-lg text-white">Chronological Workstation Access Audit Trail</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                      <th className="p-4">Session UUID</th>
                      <th className="p-4">Workstation Target</th>
                      <th className="p-4">Enrollment User</th>
                      <th className="p-4">Validation Method</th>
                      <th className="p-4">Session Period</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder">
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          No workstation audit sessions found.
                        </td>
                      </tr>
                    ) : (
                      attendance.map(record => {
                        const s = record.session;
                        if (!s) return null;
                        return (
                          <tr key={s.id} className="hover:bg-darkBg/10 transition">
                            <td className="p-4 font-mono text-[10px] text-gray-500 truncate max-w-[120px]" title={s.id}>
                              {s.id}
                            </td>
                            <td className="p-4 font-bold text-white">
                              {s.computer ? `${s.computer.pcNumber} (${s.computer.deviceName})` : "Override"}
                            </td>
                            <td className="p-4">
                              <span className="font-bold text-gray-300">{record.user.fullName}</span>
                              <span className="block font-mono text-xs text-emerald-400 font-bold">{record.user.enrollmentNumber}</span>
                            </td>
                            <td className="p-4">
                              {s.verificationMethod === "QR_CODE" && (
                                <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold px-2 py-0.5 rounded">DYNAMIC QR</span>
                              )}
                              {s.verificationMethod === "PIN_FALLBACK" && (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold px-2 py-0.5 rounded">PIN FALLBACK</span>
                              )}
                              {s.verificationMethod === "ADMIN_OVERRIDE" && (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-semibold px-2 py-0.5 rounded">ADMIN OVERRIDE</span>
                              )}
                            </td>
                            <td className="p-4 text-xs text-gray-400 space-y-1">
                              <div>In: {new Date(s.loginTime).toLocaleTimeString()}</div>
                              {s.logoutTime && <div>Out: {new Date(s.logoutTime).toLocaleTimeString()}</div>}
                            </td>
                            <td className="p-4 text-center">
                              {s.status === "ACTIVE" ? (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">ACTIVE</span>
                              ) : (
                                <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 text-xs font-bold px-2 py-0.5 rounded-full">COMPLETED</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: ASSET INVENTORY VIEW */}
          {activeTab === "inventory" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center bg-darkCard/50 p-6 rounded-2xl border border-darkBorder">
                <div>
                  <h3 className="font-bold text-lg text-white">Central Hardware & Network Asset Registry</h3>
                  <p className="text-xs text-gray-400 mt-1">Live tracking of hardware specs, WMI configurations, and lab subnet validation</p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-500 font-bold">TOTAL ASSETS: {computers.length}</span>
                </div>
              </div>

              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">Seat ID / PC No.</th>
                        <th className="p-4">Friendly Name / MAC</th>
                        <th className="p-4">Group</th>
                        <th className="p-4">IPv4 Network</th>
                        <th className="p-4">Network Subnet</th>
                        <th className="p-4">System Specs</th>
                        <th className="p-4">Agent Health</th>
                        <th className="p-4">Device Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder">
                      {computers.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-gray-500">
                            No registered assets found in database.
                          </td>
                        </tr>
                      ) : (
                        computers.map((pc: any) => {
                          const isClientOnline = pc.lastSeen != null && (Date.now() - new Date(pc.lastSeen).getTime()) < 15000;
                          const isWatchdogActive = pc.watchdogHeartbeat != null && (Date.now() - new Date(pc.watchdogHeartbeat).getTime()) < 20000;
                          const hasSubnetMismatch = pc.subnetValid === false;

                          return (
                            <tr key={pc.id} className="hover:bg-darkBg/10 transition">
                              <td className="p-4 font-mono font-bold text-emerald-400">
                                {pc.pcNumber}
                              </td>
                              <td className="p-4">
                                <span className="font-bold text-white block">{pc.deviceName}</span>
                                <span className="font-mono text-xs text-gray-500 block">{pc.macAddress}</span>
                              </td>
                              <td className="p-4 text-xs font-semibold text-gray-300">
                                {pc.deviceGroup || "Workstation"}
                              </td>
                              <td className="p-4 text-xs font-mono text-gray-400">
                                {pc.ipAddress || "Unknown"}
                              </td>
                              <td className="p-4">
                                {hasSubnetMismatch ? (
                                  <span className="inline-flex items-center space-x-1 bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-xs font-semibold" title={pc.subnetWarning}>
                                    <AlertTriangle size={12} />
                                    <span>Mismatch</span>
                                  </span>
                                ) : pc.lab?.subnet ? (
                                  <span className="inline-flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-semibold">
                                    <Check size={12} />
                                    <span>Subnet OK</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs font-semibold">No Subnet</span>
                                )}
                              </td>
                              <td className="p-4 text-xs text-gray-300 space-y-0.5">
                                <div>RAM: {pc.ram || "N/A"}</div>
                                <div>Storage: {pc.storage || "N/A"}</div>
                                <div className="text-gray-500 font-mono text-[10px] truncate max-w-[120px]" title={pc.osVersion}>{pc.osVersion || "N/A"}</div>
                              </td>
                              <td className="p-4 text-xs space-y-1">
                                <div className="flex items-center space-x-1.5">
                                  <span className={`w-2 h-2 rounded-full ${isClientOnline ? "bg-emerald-500" : "bg-red-500"}`} />
                                  <span className="text-gray-400">Agent: {isClientOnline ? "Online" : "Offline"}</span>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <span className={`w-2 h-2 rounded-full ${isWatchdogActive ? "bg-emerald-500" : "bg-red-500"}`} />
                                  <span className="text-gray-400">Watchdog: {isWatchdogActive ? "Active" : "Stopped"}</span>
                                </div>
                                <div className="text-[10px] font-mono text-gray-500">v{pc.clientVersion || "1.0.0"}</div>
                              </td>
                              <td className="p-4">
                                <select
                                  value={pc.status}
                                  onChange={(e) => handleUpdateComputerStatus(pc.id, e.target.value)}
                                  className="px-2 py-1 bg-darkBg border border-darkBorder rounded text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                                >
                                  <option value="PENDING">PENDING</option>
                                  <option value="APPROVED">APPROVED</option>
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="MAINTENANCE">MAINTENANCE</option>
                                  <option value="BLOCKED">BLOCKED</option>
                                  <option value="RETIRED">RETIRED</option>
                                </select>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => setSelectedPC(pc)}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-lg text-xs transition"
                                >
                                  View Specs
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SYSTEM WMI SPECS MODAL OVERLAY */}
          {selectedPC && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-darkCard border border-darkBorder rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center bg-slate-900">
                  <div>
                    <h3 className="font-bold text-lg text-white">WMI Hardware & Network Details</h3>
                    <p className="text-xs text-emerald-400 font-mono mt-0.5">{selectedPC.deviceName} ({selectedPC.pcNumber})</p>
                  </div>
                  <button
                    onClick={() => setSelectedPC(null)}
                    className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-darkHover transition"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-6 text-sm">
                    {/* Hardware Column */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider border-b border-darkBorder pb-1">Hardware Configuration</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Motherboard Serial</span>
                          <span className="font-mono text-white font-semibold text-xs">{selectedPC.motherboardSerial || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">BIOS Serial</span>
                          <span className="font-mono text-white font-semibold text-xs">{selectedPC.biosSerial || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">CPU Processor ID</span>
                          <span className="font-mono text-white font-semibold text-xs">{selectedPC.cpuId || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Computer BIOS UUID</span>
                          <span className="font-mono text-gray-300 text-xs break-all">{selectedPC.computerUuid || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Machine Cryptography GUID</span>
                          <span className="font-mono text-gray-300 text-xs break-all">{selectedPC.machineGuid || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">RAM Memory Size</span>
                          <span className="text-white font-bold">{selectedPC.ram || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Disk Storage Size</span>
                          <span className="text-white font-bold">{selectedPC.storage || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Network Column */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider border-b border-darkBorder pb-1">Network Adaptor Settings</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Active Adapter Name</span>
                          <span className="text-white font-semibold text-xs">{selectedPC.networkAdapter || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Workstation Domain / WG</span>
                          <span className="text-white font-semibold text-xs font-mono">{selectedPC.domainWorkgroup || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">IPv4 Address</span>
                          <span className="text-emerald-400 font-mono text-xs font-bold">{selectedPC.ipAddress || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">IPv6 Address</span>
                          <span className="text-gray-300 font-mono text-xs break-all">{selectedPC.ipv6Address || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">Default Network Gateway</span>
                          <span className="text-gray-300 font-mono text-xs">{selectedPC.gateway || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs uppercase font-bold">DNS Servers List</span>
                          <span className="text-gray-300 font-mono text-xs break-all">{selectedPC.dnsServers || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 border-t border-darkBorder flex justify-end">
                  <button
                    onClick={() => setSelectedPC(null)}
                    className="px-4 py-2 bg-darkCard hover:bg-darkHover text-gray-300 border border-darkBorder font-bold rounded-lg text-xs transition"
                  >
                    Close Specs Deck
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
