"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Users, Settings, FolderClosed, 
  AlertTriangle, Play, Square, UserPlus, Plus,
  ShieldCheck, RefreshCw, LogOut, Check, X, FileSpreadsheet,
  BarChart3, BookOpen, Clock, Mail
} from "lucide-react";
import * as XLSX from "xlsx";

interface Lab {
  id: string;
  name: string;
  location: string;
  profileId?: string;
  _count?: { computers: number };
}

interface Computer {
  id: string;
  pcNumber: string;
  deviceName: string;
  ipAddress: string;
  macAddress: string;
  fingerprint?: string;
  status: "ONLINE" | "OFFLINE" | "LOCKED" | "IN_USE" | "PENDING" | "APPROVED" | "MAINTENANCE" | "BLOCKED" | "RETIRED";
  fallbackEnabled: boolean;
  lab: { name: string; subnet?: string | null };
  labId: string;
  lastSeen?: string;
  watchdogHeartbeat?: string | null;
  cpuUsage?: number | null;
  ramUsage?: number | null;
  loggedStudent?: string | null;
  policyStatus?: string | null;
  subnetValid?: boolean;
  subnetWarning?: string;
  connectedAt?: string;
  department?: string;
  seatNumber?: string;
  ram?: string;
  storage?: string;
  osVersion?: string;
  clientVersion?: string;
  watchdogVersion?: string;
}

interface Student {
  id: string;
  enrollmentNumber: string;
  fullName: string;
  email?: string | null;
  semester?: string | null;
  department?: string | null;
  section?: string | null;
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
  const [activeTab, setActiveTab] = useState<"monitor" | "students" | "labs" | "attendance" | "alerts" | "analytics" | "faculty" | "sessions" | "inventory" | "email">("monitor");
  
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
  const [newStudEmail, setNewStudEmail] = useState("");
  const [newStudSem, setNewStudSem] = useState("");
  const [newStudDept, setNewStudDept] = useState("");
  const [newStudSection, setNewStudSection] = useState("");
  const [importedCredentials, setImportedCredentials] = useState<any[] | null>(null);
  const [resetResult, setResetResult] = useState<any | null>(null);
  const [qrAuthEnabled, setQrAuthEnabled] = useState(true);
  const [bulkGenLoading, setBulkGenLoading] = useState(false);
  const [bulkGenResult, setBulkGenResult] = useState<any[] | null>(null);

  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentCurrentPage, setStudentCurrentPage] = useState(1);
  const studentsPerPage = 10;
  const [selectedPC, setSelectedPC] = useState<any>(null);

  // Asset Inventory Filter & Sorting States
  const [invSearch, setInvSearch] = useState("");
  const [invStatusFilter, setInvStatusFilter] = useState("ALL");
  const [invLabFilter, setInvLabFilter] = useState("ALL");
  const [invHealthFilter, setInvHealthFilter] = useState("ALL");
  const [invSortField, setInvSortField] = useState("pcNumber");
  const [selectedPCs, setSelectedPCs] = useState<string[]>([]); // For bulk actions
  
  // History Modal States
  const [historyPC, setHistoryPC] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<"sessions" | "alerts" | "audits">("sessions");

  // Email Config State
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [emailStats, setEmailStats] = useState<any>(null);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [emailSubTab, setEmailSubTab] = useState<"logs" | "otps">("logs");

  const fetchEmailData = async () => {
    const token = localStorage.getItem("admin_token");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const configRes = await fetch(`${API_URL}/api/v1/admin/config/email`, { headers });
      if (configRes.ok) {
        const data = await configRes.json();
        setEmailConfig(data);
      }
      const statsRes = await fetch(`${API_URL}/api/v1/admin/config/email/dashboard`, { headers });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setEmailStats(data);
      }
    } catch (err) {
      console.error("Failed to pull email configs:", err);
    }
  };

  const handleSaveEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailConfig) return;
    setSaveLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/config/email`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(emailConfig)
      });
      if (res.ok) {
        showFeedback("Configuration saved successfully!");
        fetchEmailData();
      } else {
        alert("Failed to save email configuration.");
      }
    } catch (err) {
      alert("Network error updating config.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress) return;
    setTestLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/config/email/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ testEmail: testEmailAddress })
      });
      if (res.ok) {
        showFeedback("Diagnostic test email enqueued!");
        setTestEmailAddress("");
        fetchEmailData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to send test email.");
      }
    } catch (err) {
      alert("Network error sending test email.");
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "email") {
      fetchEmailData();
      const interval = setInterval(fetchEmailData, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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

  const fetchComputerHistory = async (computer: any) => {
    setHistoryPC(computer);
    setHistoryLoading(true);
    setHistoryTab("sessions");
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computer.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
      } else {
        alert("Failed to pull workstation history.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleWorkstationCommand = async (computerId: string, command: string, parameters: string = "") => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computerId}/command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ command, parameters })
      });
      if (res.ok) {
        showFeedback(`Remote command ${command} queued successfully!`);
        triggerRefresh();
      } else {
        const data = await res.json();
        alert(data.error || `Failed to queue ${command}`);
      }
    } catch (err) {
      alert("Network error sending remote command.");
    }
  };

  const handleUpdateComputerField = async (computerId: string, payload: any) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computerId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showFeedback("Workstation updated successfully!");
        triggerRefresh();
      } else {
        alert("Failed to update workstation.");
      }
    } catch (err) {
      alert("Network error updating workstation.");
    }
  };

  const handleDeleteComputer = async (computerId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete and unpair this workstation?")) return;
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/computers/${computerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback("Workstation unpaired and deleted successfully!");
        triggerRefresh();
      } else {
        alert("Failed to delete workstation.");
      }
    } catch (err) {
      alert("Network error deleting workstation.");
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedPCs.length === 0) {
      alert("Please select at least one workstation.");
      return;
    }
    if (!window.confirm(`Run bulk action '${action}' on ${selectedPCs.length} workstations?`)) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      await Promise.all(selectedPCs.map(async (computerId) => {
        if (action === "LOCK") {
          await fetch(API_URL + "/api/v1/admin/computers/remote-lock", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ computerId })
          });
        } else if (action === "UNLOCK") {
          await fetch(API_URL + "/api/v1/admin/computers/remote-unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ computerId })
          });
        } else if (action === "RESTART_SERVICE") {
          await fetch(`${API_URL}/api/v1/admin/computers/${computerId}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ command: "RESTART_SERVICE", parameters: "" })
          });
        } else if (action === "REFRESH") {
          await fetch(`${API_URL}/api/v1/admin/computers/${computerId}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ command: "REFRESH", parameters: "" })
          });
        } else if (action === "DELETE") {
          await fetch(`${API_URL}/api/v1/admin/computers/${computerId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }));
      setSelectedPCs([]);
      showFeedback(`Bulk action completed!`);
      triggerRefresh();
    } catch (err) {
      console.error(err);
      alert("Error executing bulk operations.");
    } finally {
      setLoading(false);
    }
  };

  const exportInventoryCSV = () => {
    try {
      const headers = [
        "PC Number", "Device Name", "Seat Number", "Lab Name", "Department",
        "IPv4 Address", "MAC Address", "OS Version", "Client Version", 
        "Watchdog Version", "Connected Time", "Last Heartbeat", 
        "Logged Student", "Hardware Health", "Status"
      ];
      const rows = computers.map((pc: any) => [
        pc.pcNumber || "",
        pc.deviceName || "",
        pc.seatNumber || "",
        pc.lab?.name || "",
        pc.department || "",
        pc.ipAddress || "",
        pc.macAddress || "",
        pc.osVersion || "",
        pc.clientVersion || "1.0.0",
        pc.watchdogVersion || "",
        pc.connectedAt ? new Date(pc.connectedAt).toLocaleString() : "",
        pc.lastSeen ? new Date(pc.lastSeen).toLocaleString() : "",
        pc.loggedStudent || "",
        pc.watchdogHeartbeat ? "Watchdog Active" : "Watchdog Stopped",
        pc.status || ""
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ALAMS_Inventory_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showFeedback("Inventory exported successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to export inventory CSV.");
    }
  };

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
          email: newStudEmail || null,
          semester: newStudSem || null,
          department: newStudDept || null,
          section: newStudSection || null,
          role: "STUDENT",
        }),
      });

      if (res.ok) {
        setNewStudEnroll("");
        setNewStudName("");
        setNewStudPass("");
        setNewStudPin("");
        setNewStudEmail("");
        setNewStudSem("");
        setNewStudDept("");
        setNewStudSection("");
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

  const exportImportedPasswordsCSV = (studentList: any[]) => {
    try {
      const createdOnly = studentList.filter((s: any) => s.status === "CREATED" && s.tempPassword);
      if (createdOnly.length === 0) {
        alert("No newly created student credentials to export.");
        return;
      }

      const headers = [
        "Serial Number",
        "Student Name",
        "Enrollment Number",
        "College Email",
        "Generated Password",
        "Department",
        "Semester",
        "Year"
      ];

      const rows = createdOnly.map((s: any, idx: number) => [
        idx + 1,
        s.fullName || "",
        s.enrollmentNumber || "",
        s.email || `${s.enrollmentNumber}@suas.ac.in`,
        s.tempPassword || "",
        s.department || "",
        s.semester || "",
        s.year || ""
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ALAMS_Student_Passwords_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showFeedback("Passwords CSV exported successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to export credentials CSV.");
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(dataBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (rows.length === 0) {
        alert("The uploaded file is empty.");
        return;
      }

      // Headers resolution
      const firstLine = rows[0];
      const headers = firstLine.map(h => String(h || "").trim().toLowerCase());

      const nameIndex = headers.findIndex(h => h === "name" || h.includes("name") || h.includes("fullname") || h.includes("student name"));
      const enrollIndex = headers.findIndex(h => h.includes("enrollment") || h.includes("enrollmentnumber") || h.includes("enrollment number") || h.includes("enrollment no") || h.includes("enrollment no."));
      const emailIndex = headers.findIndex(h => h.includes("email") || h.includes("collegeemail") || h.includes("college email") || h.includes("email id") || h.includes("emailid") || h.includes("student email id") || h.includes("student email"));
      const semIndex = headers.findIndex(h => h.includes("semester") || h.includes("sem"));
      const deptIndex = headers.findIndex(h => h.includes("course") || h.includes("branch") || h.includes("department") || h.includes("dept") || h.includes("course/ branch"));

      if (nameIndex === -1 || enrollIndex === -1) {
        alert("The file must contain columns for 'Student Name' and 'Enrollment Number'.");
        return;
      }

      // Prompt admin if they want to increment semester by +1
      const shouldIncrementSem = window.confirm(
        "Would you like to automatically increment the semester by +1 for all imported students?\n\n(e.g., Sem 3 listed in sheet will be saved as Sem 4 in database)"
      );

      const studentsList = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const fullName = String(row[nameIndex] || "").trim();
        const enrollmentNumber = String(row[enrollIndex] || "").trim();

        if (!fullName || !enrollmentNumber) continue;

        let rawSem = semIndex !== -1 ? String(row[semIndex] || "").trim() : "";
        if (shouldIncrementSem && rawSem) {
          const semNum = parseInt(rawSem, 10);
          if (!isNaN(semNum)) {
            rawSem = String(semNum + 1);
          }
        }

        studentsList.push({
          enrollmentNumber,
          fullName,
          email: emailIndex !== -1 ? String(row[emailIndex] || "").trim() : "",
          semester: rawSem,
          year: "",
          department: deptIndex !== -1 ? String(row[deptIndex] || "").trim() : "",
          section: ""
        });
      }

      if (studentsList.length === 0) {
        alert("No valid student records found in the uploaded file.");
        return;
      }

      try {
        const token = localStorage.getItem("admin_token");
        const res = await fetch(`${API_URL}/api/v1/admin/students/import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(studentsList),
        });

        if (res.ok) {
          const data = await res.json();
          setImportedCredentials(data.importedStudents);
          triggerRefresh();
          showFeedback("CSV imported and student accounts created!");

          // Ask to export
          setTimeout(() => {
            const hasCreated = data.importedStudents.some((s: any) => s.status === "CREATED");
            if (hasCreated && window.confirm("Bulk student import successful! Would you like to export the generated credentials to a CSV file?")) {
              exportImportedPasswordsCSV(data.importedStudents);
            }
          }, 300);
        } else {
          const err = await res.json();
          alert(err.error || "Failed to import file.");
        }
      } catch (err) {
        console.error(err);
        alert("Network error importing student profiles.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to parse spreadsheet. Please ensure it is a valid CSV or Excel file.");
    }
    e.target.value = "";
  };

  const handleResetPassword = async (studentId: string) => {
    if (!confirm("Are you sure you want to reset this student's password?")) return;
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/students/${studentId}/reset-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setResetResult(data);
      } else {
        const err = await res.json();
        alert(err.error || "Password reset failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Error resetting password.");
    }
  };

  const handleToggleQrAuth = async (profileId: string, currentQrVal: boolean) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_URL}/api/v1/admin/profiles/${profileId}/auth-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrAuthEnabled: !currentQrVal }),
      });

      if (res.ok) {
        setQrAuthEnabled(!currentQrVal);
        showFeedback("Authentication configuration updated successfully!");
        triggerRefresh();
      } else {
        alert("Failed to update profile settings.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving settings.");
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

  // Student Search & Pagination Calculations
  const filteredStudents = students.filter(student => {
    const search = studentSearch.toLowerCase();
    return (
      student.enrollmentNumber.toLowerCase().includes(search) ||
      student.fullName.toLowerCase().includes(search) ||
      (student.email && student.email.toLowerCase().includes(search)) ||
      (student.department && student.department.toLowerCase().includes(search)) ||
      (student.semester && student.semester.toLowerCase().includes(search))
    );
  });

  const indexOfLastStudent = studentCurrentPage * studentsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
  const currentStudents = filteredStudents.slice(indexOfFirstStudent, indexOfLastStudent);
  const totalStudentPages = Math.ceil(filteredStudents.length / studentsPerPage);

  // Reset page when search matches filter update
  useEffect(() => {
    setStudentCurrentPage(1);
  }, [studentSearch]);

  return (
    <div className="flex h-screen bg-darkBg text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-darkCard border-r border-darkBorder flex flex-col justify-between shrink-0">
        <div className="py-6">
          <div className="px-6 flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center text-darkBg font-black">A</div>
            <div>
              <h2 className="font-black text-sm tracking-wide">SCSIT ALAMS</h2>
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
            <button
              onClick={() => setActiveTab("email")}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition duration-150 ${activeTab === "email" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:bg-darkHover hover:text-white"}`}
            >
              <Mail size={18} />
              <span>Email Gateway</span>
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
            <div className="grid lg:grid-cols-3 gap-8 animate-fade-in">
              {/* Table of students */}
              <div className="lg:col-span-2 bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between">
                <div>
                  <div className="p-6 border-b border-darkBorder flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/30">
                    <div>
                      <h3 className="font-bold text-lg text-white">Student Enrollment Index</h3>
                      <p className="text-xs text-gray-500 mt-1">Showing {filteredStudents.length} total students</p>
                    </div>
                    <input
                      type="text"
                      placeholder="Search enrollment, name, dept..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="px-4 py-2 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-xs text-white w-full sm:w-64"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                          <th className="p-4">Enrollment Number</th>
                          <th className="p-4">Full Name</th>
                          <th className="p-4">Email</th>
                          <th className="p-4">Sem/Batch</th>
                          <th className="p-4">Dept</th>
                          <th className="p-4">Sec</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-darkBorder">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-gray-500">
                              No matching student accounts found.
                            </td>
                          </tr>
                        ) : (
                          currentStudents.map(student => (
                            <tr key={student.id} className="hover:bg-darkBg/10 transition">
                              <td className="p-4 font-mono font-bold text-emerald-400">{student.enrollmentNumber}</td>
                              <td className="p-4 text-gray-200 font-semibold">{student.fullName}</td>
                              <td className="p-4 text-gray-400 text-xs">{student.email || "—"}</td>
                              <td className="p-4 text-gray-300 text-xs">{student.semester || "—"}</td>
                              <td className="p-4 text-gray-300 text-xs">{student.department || "—"}</td>
                              <td className="p-4 text-gray-400 text-xs">{student.section || "—"}</td>
                              <td className="p-4">
                                {student.isActive ? (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-semibold">Active</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-semibold">Suspended</span>
                                )}
                              </td>
                              <td className="p-4 text-center flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => handleToggleStudent(student.id, student.isActive)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${student.isActive ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"}`}
                                >
                                  {student.isActive ? "Suspend" : "Activate"}
                                </button>
                                <button
                                  onClick={() => handleResetPassword(student.id)}
                                  className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition"
                                >
                                  Reset Pass
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination Controls */}
                {totalStudentPages > 1 && (
                  <div className="p-4 bg-slate-900/40 border-t border-darkBorder flex justify-between items-center text-xs">
                    <span className="text-gray-400">
                      Page {studentCurrentPage} of {totalStudentPages} (Showing {currentStudents.length} of {filteredStudents.length} matches)
                    </span>
                    <div className="flex space-x-2">
                      <button
                        disabled={studentCurrentPage === 1}
                        onClick={() => setStudentCurrentPage(prev => Math.max(prev - 1, 1))}
                        className="px-3 py-1.5 bg-darkBg border border-darkBorder rounded-lg hover:bg-darkHover text-gray-300 disabled:opacity-40 transition font-bold"
                      >
                        Previous
                      </button>
                      <button
                        disabled={studentCurrentPage === totalStudentPages}
                        onClick={() => setStudentCurrentPage(prev => Math.min(prev + 1, totalStudentPages))}
                        className="px-3 py-1.5 bg-darkBg border border-darkBorder rounded-lg hover:bg-darkHover text-gray-300 disabled:opacity-40 transition font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Enrollment forms side panel */}
              <div className="space-y-8">
                {/* Add Student Form */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl space-y-6">
                  <div className="flex items-center space-x-2 text-blue-400 border-b border-darkBorder pb-4">
                    <UserPlus size={20} />
                    <h3 className="font-bold text-base text-white">Enroll Student Profile</h3>
                  </div>

                  <form onSubmit={handleAddStudent} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Enrollment No.</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. ENR2026001"
                          value={newStudEnroll}
                          onChange={e => setNewStudEnroll(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={newStudName}
                          onChange={e => setNewStudName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. rahul@suas.ac.in"
                        value={newStudEmail}
                        onChange={e => setNewStudEmail(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Department</label>
                        <input
                          type="text"
                          placeholder="e.g. CS"
                          value={newStudDept}
                          onChange={e => setNewStudDept(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Semester</label>
                        <input
                          type="text"
                          placeholder="e.g. 3"
                          value={newStudSem}
                          onChange={e => setNewStudSem(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Section (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. A"
                        value={newStudSection}
                        onChange={e => setNewStudSection(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Login Password</label>
                        <input
                          type="password"
                          required
                          placeholder="Password"
                          value={newStudPass}
                          onChange={e => setNewStudPass(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">6-Digit PIN</label>
                        <input
                          type="password"
                          required
                          maxLength={6}
                          placeholder="PIN"
                          value={newStudPin}
                          onChange={e => setNewStudPin(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-darkBg border border-darkBorder focus:border-blue-500 focus:outline-none text-sm text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-darkBg font-black rounded-xl text-sm transition shadow-lg shadow-blue-500/10"
                    >
                      Register Student Account
                    </button>
                  </form>
                </div>

                {/* Excel / CSV File Upload Card */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl space-y-5">
                  <div className="flex items-center space-x-2 text-emerald-400 border-b border-darkBorder pb-4">
                    <FileSpreadsheet size={20} />
                    <h3 className="font-bold text-base text-white">Excel / CSV Student Import</h3>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Upload your institution Excel or CSV file. Columns auto-detected: <span className="text-emerald-400 font-bold">Semester, Course/Branch, Enrollment No., Name, Student Email Id</span>.
                  </p>

                  <div className="space-y-3">
                    {/* Drop zone — accepts both xlsx and csv */}
                    <div className="border border-dashed border-darkBorder rounded-xl p-6 text-center hover:border-emerald-500/40 transition cursor-pointer relative bg-darkBg/10">
                      <input
                        type="file"
                        id="excel_import_input"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleCsvImport}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <FileSpreadsheet className="mx-auto text-emerald-500/50 mb-2" size={32} />
                      <span className="text-xs text-gray-300 block font-bold">Drop Excel or CSV here</span>
                      <span className="text-[10px] text-gray-500 block mt-1">Accepts .xlsx · .xls · .csv</span>
                    </div>

                    <button
                      onClick={() => {
                        const csv = "Semester,Course/ Branch,Enrollment No.,Name,Student Contact No.,Student Email Id\n3,B.Tech-CSIT,2022BTCS001,Aanya Jain,8349330770,2022BTCS001@student.suas.ac.in";
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "alams_student_template.csv";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                      className="w-full py-2 bg-darkCard border border-darkBorder hover:border-emerald-500/20 text-gray-400 font-bold rounded-xl text-xs transition"
                    >
                      ⬇ Download Sample Template
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-darkBorder pt-4">
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                      After importing students, generate secure 8-character passwords for all new accounts in one click. Existing accounts with manually-set passwords are skipped.
                    </p>
                    <button
                      id="bulk_gen_passwords_btn"
                      disabled={bulkGenLoading}
                      onClick={async () => {
                        if (!confirm(`This will generate 8-character passwords for ALL newly-imported students who don't have a manually-set password yet.\n\nProceed?`)) return;
                        setBulkGenLoading(true);
                        try {
                          const token = localStorage.getItem("admin_token");
                          const res = await fetch(`${API_URL}/api/v1/admin/students/bulk-generate-passwords`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setBulkGenResult(data.generated);
                            showFeedback(`Passwords generated for ${data.count} students!`);
                          } else {
                            alert(data.error || "Bulk generation failed.");
                          }
                        } catch (e) {
                          alert("Network error during bulk password generation.");
                        } finally {
                          setBulkGenLoading(false);
                        }
                      }}
                      className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl text-sm transition shadow-lg shadow-violet-500/20 flex items-center justify-center space-x-2"
                    >
                      {bulkGenLoading ? (
                        <><RefreshCw size={14} className="animate-spin" /><span>Generating...</span></>
                      ) : (
                        <><ShieldCheck size={14} /><span>Generate Passwords for All New Students</span></>
                      )}
                    </button>
                  </div>
                </div>
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

              {/* Authentication Mode Settings */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center space-x-2 text-blue-400 border-b border-darkBorder pb-4">
                  <ShieldCheck size={20} />
                  <h3 className="font-bold text-base text-white">Lab Authentication & Mode Controls</h3>
                </div>
                <p className="text-sm text-gray-400">
                  Configure global access verification methods. Toggling options updates local workstation screen locking behaviours dynamically.
                </p>
                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  <div className="p-5 rounded-xl bg-darkBg/30 border border-darkBorder flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Dynamic QR Login</h4>
                      <p className="text-xs text-gray-500 mt-1">Hides or shows the QR Code login option on all client screens.</p>
                    </div>
                    <button
                      onClick={() => handleToggleQrAuth(labs[0]?.profileId || "engineering-profile", qrAuthEnabled)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition ${qrAuthEnabled ? "bg-emerald-500 hover:bg-emerald-400 text-darkBg" : "bg-darkCard border border-darkBorder text-gray-400 hover:text-white"}`}
                    >
                      {qrAuthEnabled ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>
                  
                  <div className="p-5 rounded-xl bg-darkBg/30 border border-darkBorder flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">Offline PIN Fallback</h4>
                      <p className="text-xs text-gray-500 mt-1">Allows local login bypass using individual 6-digit backup PINs.</p>
                    </div>
                    <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-lg">
                      ALWAYS ENABLED
                    </span>
                  </div>
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
            <div className="space-y-6 animate-fade-in">
              {/* Security Metrics Overview Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-darkCard p-5 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">HMAC Failures</span>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-3xl font-black text-rose-500">
                      {alerts.filter(a => a.alertType.toLowerCase().includes("hmac") || a.alertType.toLowerCase().includes("signature")).length}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Alerts</span>
                  </div>
                </div>

                <div className="bg-darkCard p-5 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Clock Tampering</span>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-3xl font-black text-amber-400">
                      {alerts.filter(a => a.alertType.toLowerCase().includes("clock") || a.alertType.toLowerCase().includes("tampering")).length}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Alerts</span>
                  </div>
                </div>

                <div className="bg-darkCard p-5 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hardware Mismatch</span>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-3xl font-black text-blue-400">
                      {alerts.filter(a => a.alertType.toLowerCase().includes("fingerprint") || a.alertType.toLowerCase().includes("hardware") || a.alertType.toLowerCase().includes("mismatch")).length}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Alerts</span>
                  </div>
                </div>

                <div className="bg-darkCard p-5 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Replay Attempts</span>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-3xl font-black text-pink-400">
                      {alerts.filter(a => a.alertType.toLowerCase().includes("replay") || a.alertType.toLowerCase().includes("duplicate")).length}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Alerts</span>
                  </div>
                </div>

                <div className="bg-darkCard p-5 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Config Violations</span>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-3xl font-black text-purple-400">
                      {alerts.filter(a => a.alertType.toLowerCase().includes("config") || a.alertType.toLowerCase().includes("integrity") || a.alertType.toLowerCase().includes("violation")).length}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Alerts</span>
                  </div>
                </div>
              </div>

              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-darkBorder">
                  <h3 className="font-bold text-lg text-white font-sans">Lab Security Incident & Cryptographic Verification Log</h3>
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
                            <td className="p-4 text-gray-300 font-mono text-xs">
                              {alert.alertType.toLowerCase().includes("hmac") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/20 mr-1.5">HMAC</span>
                              )}
                              {alert.alertType.toLowerCase().includes("clock") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/20 mr-1.5">CLOCK</span>
                              )}
                              {alert.alertType.toLowerCase().includes("fingerprint") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/20 mr-1.5">BINDING</span>
                              )}
                              {alert.alertType.toLowerCase().includes("replay") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-pink-500/15 text-pink-400 border border-pink-500/20 mr-1.5">REPLAY</span>
                              )}
                              {alert.alertType.toLowerCase().includes("config") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/20 mr-1.5">CONFIG</span>
                              )}
                              {alert.alertType}
                            </td>
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
            <div className="space-y-6 animate-fade-in text-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-darkCard/50 p-6 rounded-2xl border border-darkBorder gap-4">
                <div>
                  <h3 className="font-bold text-xl text-white">Central Hardware & Network Asset Registry</h3>
                  <p className="text-xs text-gray-400 mt-1">Live tracking of hardware specs, agent versions, security policies, and network health</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportInventoryCSV}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-extrabold rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                  >
                    <FileSpreadsheet size={16} />
                    <span>Export CSV</span>
                  </button>
                  <span className="px-3 py-1.5 bg-darkBorder text-gray-300 rounded-xl text-xs font-bold border border-darkBorder/40">
                    Total Workstations: {computers.length}
                  </span>
                </div>
              </div>

              {/* Filtering & Sorting Panel */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-5 shadow-xl space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  {/* Search */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Search Workstations</label>
                    <input
                      type="text"
                      placeholder="Search Name, PC#, Seat#, IP, MAC, Student..."
                      value={invSearch}
                      onChange={(e) => setInvSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-darkBg border border-darkBorder focus:border-emerald-500 focus:outline-none text-xs text-white"
                    />
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Agent Status</label>
                    <select
                      value={invStatusFilter}
                      onChange={(e) => setInvStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-darkBg border border-darkBorder text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ONLINE">Online Agents</option>
                      <option value="OFFLINE">Offline Agents</option>
                      <option value="LOCKED">Locked</option>
                      <option value="IN_USE">In Use</option>
                      <option value="PENDING">Pending Pairing</option>
                      <option value="BLOCKED">Disabled/Blocked</option>
                    </select>
                  </div>

                  {/* Lab Zone Filter */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Lab Zone</label>
                    <select
                      value={invLabFilter}
                      onChange={(e) => setInvLabFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-darkBg border border-darkBorder text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="ALL">All Labs</option>
                      {labs.map(lab => (
                        <option key={lab.id} value={lab.id}>{lab.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Network / Hardware Health Filter */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Health & Subnet</label>
                    <select
                      value={invHealthFilter}
                      onChange={(e) => setInvHealthFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-darkBg border border-darkBorder text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="ALL">All Health States</option>
                      <option value="HEALTHY">Subnet OK & Active</option>
                      <option value="MISMATCH">Subnet Mismatch</option>
                      <option value="WATCHDOG_STOPPED">Watchdog Stopped</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-darkBorder/40">
                  {/* Sorting */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-semibold">Sort By:</span>
                    <select
                      value={invSortField}
                      onChange={(e) => setInvSortField(e.target.value)}
                      className="px-2.5 py-1.5 bg-darkBg border border-darkBorder rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="pcNumber">PC Seat Number</option>
                      <option value="deviceName">Device Name</option>
                      <option value="lastSeen">Last Active Time</option>
                      <option value="connectedAt">Connection Time</option>
                    </select>
                  </div>

                  {/* Bulk Actions Console */}
                  <div className="flex items-center gap-2 bg-darkBg/60 p-2.5 rounded-xl border border-darkBorder/60">
                    <span className="text-xs font-bold text-gray-400 mr-2">
                      Selected: {selectedPCs.length} / {computers.length}
                    </span>
                    <button
                      onClick={() => handleBulkAction("LOCK")}
                      disabled={selectedPCs.length === 0}
                      className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:hover:bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-lg transition"
                    >
                      🔒 Lock
                    </button>
                    <button
                      onClick={() => handleBulkAction("UNLOCK")}
                      disabled={selectedPCs.length === 0}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 disabled:hover:bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-lg transition"
                    >
                      🔓 Unlock
                    </button>
                    <button
                      onClick={() => handleBulkAction("REFRESH")}
                      disabled={selectedPCs.length === 0}
                      className="px-2.5 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-40 disabled:hover:bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold rounded-lg transition"
                    >
                      🔄 Refresh
                    </button>
                    <button
                      onClick={() => handleBulkAction("RESTART_SERVICE")}
                      disabled={selectedPCs.length === 0}
                      className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 disabled:hover:bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded-lg transition"
                    >
                      🛠️ Restart Watchdog
                    </button>
                    <button
                      onClick={() => handleBulkAction("DELETE")}
                      disabled={selectedPCs.length === 0}
                      className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg transition"
                    >
                      ❌ Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Grid Card */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-darkBg/40 border-b border-darkBorder text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4 w-12 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-darkBorder text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            checked={selectedPCs.length > 0 && selectedPCs.length === computers.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPCs(computers.map(c => c.id));
                              } else {
                                setSelectedPCs([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-4">PC No. / Lab</th>
                        <th className="p-4">Device Details</th>
                        <th className="p-4">IP & Network</th>
                        <th className="p-4">Hardware Specifications</th>
                        <th className="p-4">Agent Telemetry</th>
                        <th className="p-4">Logged Student</th>
                        <th className="p-4">Status & Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder">
                      {(() => {
                        const searchFiltered = computers.filter(pc => {
                          const query = invSearch.toLowerCase();
                          const matchesQuery = !query || 
                            (pc.deviceName || "").toLowerCase().includes(query) ||
                            (pc.pcNumber || "").toLowerCase().includes(query) ||
                            (pc.ipAddress || "").toLowerCase().includes(query) ||
                            (pc.macAddress || "").toLowerCase().includes(query) ||
                            (pc.loggedStudent || "").toLowerCase().includes(query) ||
                            (pc.lab?.name || "").toLowerCase().includes(query);
                          
                          const matchesLab = invLabFilter === "ALL" || pc.labId === invLabFilter;

                          const isClientOnline = pc.lastSeen != null && (Date.now() - new Date(pc.lastSeen).getTime()) < 15000;
                          const isClientLocked = pc.status === "LOCKED";
                          const isClientInUse = pc.status === "IN_USE";

                          let matchesStatus = true;
                          if (invStatusFilter === "ONLINE") matchesStatus = isClientOnline;
                          else if (invStatusFilter === "OFFLINE") matchesStatus = !isClientOnline;
                          else if (invStatusFilter === "LOCKED") matchesStatus = isClientLocked;
                          else if (invStatusFilter === "IN_USE") matchesStatus = isClientInUse;
                          else if (invStatusFilter === "PENDING") matchesStatus = pc.status === "PENDING";
                          else if (invStatusFilter === "BLOCKED") matchesStatus = pc.status === "BLOCKED";

                          const isWatchdogActive = pc.watchdogHeartbeat != null && (Date.now() - new Date(pc.watchdogHeartbeat).getTime()) < 20000;
                          const hasSubnetMismatch = pc.subnetValid === false;

                          let matchesHealth = true;
                          if (invHealthFilter === "HEALTHY") matchesHealth = !hasSubnetMismatch && isWatchdogActive;
                          else if (invHealthFilter === "MISMATCH") matchesHealth = hasSubnetMismatch;
                          else if (invHealthFilter === "WATCHDOG_STOPPED") matchesHealth = !isWatchdogActive;

                          return matchesQuery && matchesLab && matchesStatus && matchesHealth;
                        });

                        const sortedComputers = [...searchFiltered].sort((a, b) => {
                          if (invSortField === "pcNumber") {
                            return (a.pcNumber || "").localeCompare(b.pcNumber || "");
                          } else if (invSortField === "deviceName") {
                            return (a.deviceName || "").localeCompare(b.deviceName || "");
                          } else if (invSortField === "lastSeen") {
                            const dateA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                            const dateB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                            return dateB - dateA;
                          } else if (invSortField === "connectedAt") {
                            const dateA = a.connectedAt ? new Date(a.connectedAt).getTime() : 0;
                            const dateB = b.connectedAt ? new Date(b.connectedAt).getTime() : 0;
                            return dateB - dateA;
                          }
                          return 0;
                        });

                        if (sortedComputers.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="p-8 text-center text-gray-500">
                                No registered assets matched selected filters.
                              </td>
                            </tr>
                          );
                        }

                        return sortedComputers.map((pc: any) => {
                          const isClientOnline = pc.lastSeen != null && (Date.now() - new Date(pc.lastSeen).getTime()) < 15000;
                          const isWatchdogActive = pc.watchdogHeartbeat != null && (Date.now() - new Date(pc.watchdogHeartbeat).getTime()) < 20000;
                          const hasSubnetMismatch = pc.subnetValid === false;

                          return (
                            <tr key={pc.id} className="hover:bg-darkBg/10 transition">
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  className="rounded border-darkBorder text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                                  checked={selectedPCs.includes(pc.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPCs(prev => [...prev, pc.id]);
                                    } else {
                                      setSelectedPCs(prev => prev.filter(id => id !== pc.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="p-4">
                                <span className="font-mono font-bold text-emerald-400 text-sm block">
                                  {pc.pcNumber}
                                </span>
                                <span className="text-gray-400 text-xs font-semibold block">{pc.lab?.name || "No Room"}</span>
                              </td>
                              <td className="p-4">
                                <span className="font-bold text-white text-sm block">{pc.deviceName}</span>
                                <span className="font-mono text-[10px] text-gray-500 block">{pc.macAddress}</span>
                              </td>
                              <td className="p-4">
                                <span className="font-mono text-xs font-bold text-gray-300 block">{pc.ipAddress || "—"}</span>
                                {hasSubnetMismatch ? (
                                  <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded text-[9px] font-semibold mt-1">
                                    <AlertTriangle size={10} />
                                    <span>Subnet Mismatch</span>
                                  </span>
                                ) : pc.lab?.subnet ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-semibold mt-1">
                                    <Check size={10} />
                                    <span>Subnet Match</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-[9px] font-semibold">No Subnet check</span>
                                )}
                              </td>
                              <td className="p-4 text-xs text-gray-300 space-y-0.5">
                                <div>RAM: {pc.ram || "—"} | Disk: {pc.storage || "—"}</div>
                                <div className="text-[10px] text-gray-500 truncate max-w-[155px]" title={pc.osVersion}>{pc.osVersion || "Unknown OS"}</div>
                              </td>
                              <td className="p-4 text-xs space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isClientOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                                  <span className="text-gray-300">Client: {isClientOnline ? "Online" : "Offline"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isWatchdogActive ? "bg-emerald-500" : "bg-red-500"}`} />
                                  <span className="text-gray-300">Watchdog: {isWatchdogActive ? "Active" : "Stopped"}</span>
                                </div>
                                <div className="text-[10px] font-mono text-gray-500">v{pc.clientVersion || "1.0.0"} / wd: v{pc.watchdogVersion || "1.0.0"}</div>
                              </td>
                              <td className="p-4">
                                {pc.loggedStudent ? (
                                  <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-1 rounded" title={pc.loggedStudent}>
                                    {pc.loggedStudent.split('@')[0]}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 text-xs font-bold">—</span>
                                )}
                              </td>
                              <td className="p-4 space-y-2">
                                <select
                                  value={pc.status}
                                  onChange={(e) => handleUpdateComputerStatus(pc.id, e.target.value)}
                                  className="w-full px-2 py-1 bg-darkBg border border-darkBorder rounded text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                                >
                                  <option value="PENDING">PENDING</option>
                                  <option value="APPROVED">APPROVED</option>
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="MAINTENANCE">MAINTENANCE</option>
                                  <option value="BLOCKED">BLOCKED</option>
                                  <option value="RETIRED">RETIRED</option>
                                </select>
                                
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    onClick={() => setSelectedPC(pc)}
                                    className="px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/20 text-blue-400 rounded text-[10px] font-bold transition"
                                  >
                                    Specs
                                  </button>
                                  <button
                                    onClick={() => fetchComputerHistory(pc)}
                                    className="px-2 py-0.5 bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/20 text-purple-400 rounded text-[10px] font-bold transition"
                                  >
                                    History
                                  </button>
                                  <button
                                    onClick={() => {
                                      const newName = window.prompt("Enter new Computer Hostname:", pc.deviceName);
                                      if (newName && newName.trim()) {
                                        handleUpdateComputerField(pc.id, { deviceName: newName });
                                        handleWorkstationCommand(pc.id, "RENAME_COMPUTER", newName);
                                      }
                                    }}
                                    className="px-2 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/20 text-indigo-400 rounded text-[10px] font-bold transition"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => handleWorkstationCommand(pc.id, "REFRESH")}
                                    className="px-2 py-0.5 bg-teal-500/10 hover:bg-teal-500/25 border border-teal-500/20 text-teal-400 rounded text-[10px] font-bold transition"
                                  >
                                    Sync
                                  </button>
                                  <button
                                    onClick={() => handleWorkstationCommand(pc.id, "RESTART_SERVICE")}
                                    className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/20 text-amber-400 rounded text-[10px] font-bold transition"
                                  >
                                    Restart
                                  </button>
                                  <button
                                    onClick={() => handleRemoteLock(pc.id)}
                                    className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded text-[10px] font-bold transition"
                                  >
                                    Lock
                                  </button>
                                  <button
                                    onClick={() => handleRemoteUnlock(pc.id)}
                                    className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold transition"
                                  >
                                    Unlock
                                  </button>
                                  <button
                                    onClick={() => handleDeleteComputer(pc.id)}
                                    className="px-2 py-0.5 bg-red-600/20 hover:bg-red-600/35 border border-red-600/30 text-red-400 rounded text-[10px] font-bold transition"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* WORKSTATION ACTION HISTORY MODAL OVERLAY */}
          {historyPC && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-darkCard border border-darkBorder rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center bg-slate-900 shrink-0">
                  <div>
                    <h3 className="font-bold text-lg text-white">Workstation Session & Audit History</h3>
                    <p className="text-xs text-purple-400 font-mono mt-0.5">{historyPC.deviceName} ({historyPC.pcNumber})</p>
                  </div>
                  <button
                    onClick={() => {
                      setHistoryPC(null);
                      setHistoryData(null);
                    }}
                    className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-darkHover transition"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Tabs selection */}
                <div className="flex border-b border-darkBorder bg-darkCard px-6 py-2 shrink-0 gap-2">
                  <button
                    onClick={() => setHistoryTab("sessions")}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition ${historyTab === "sessions" ? "bg-purple-500 text-darkBg" : "text-gray-400 hover:text-white hover:bg-darkHover"}`}
                  >
                    📝 Access Sessions
                  </button>
                  <button
                    onClick={() => setHistoryTab("alerts")}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition ${historyTab === "alerts" ? "bg-purple-500 text-darkBg" : "text-gray-400 hover:text-white hover:bg-darkHover"}`}
                  >
                    ⚠️ Security Alerts
                  </button>
                  <button
                    onClick={() => setHistoryTab("audits")}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition ${historyTab === "audits" ? "bg-purple-500 text-darkBg" : "text-gray-400 hover:text-white hover:bg-darkHover"}`}
                  >
                    🛡️ Authentication Audits
                  </button>
                </div>

                {/* Content body */}
                <div className="p-6 overflow-y-auto flex-grow bg-darkBg/30">
                  {historyLoading ? (
                    <div className="text-center py-12 text-gray-500 font-semibold animate-pulse">
                      Retrieving audit logs from server...
                    </div>
                  ) : !historyData ? (
                    <div className="text-center py-12 text-gray-500">
                      No logs loaded.
                    </div>
                  ) : (
                    <div>
                      {/* SESSIONS TAB */}
                      {historyTab === "sessions" && (
                        <div className="space-y-4">
                          <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Access Sessions Ledger</h4>
                          <div className="border border-darkBorder rounded-xl overflow-hidden bg-darkCard">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-darkBg/60 border-b border-darkBorder text-gray-400 font-bold uppercase">
                                  <th className="p-3">Session User</th>
                                  <th className="p-3">Method</th>
                                  <th className="p-3">Login Time</th>
                                  <th className="p-3">Logout Time</th>
                                  <th className="p-3">Duration</th>
                                  <th className="p-3">IP Address</th>
                                  <th className="p-3">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-darkBorder">
                                {!historyData.sessions || historyData.sessions.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="p-4 text-center text-gray-500">No session history found.</td>
                                  </tr>
                                ) : (
                                  historyData.sessions.map((s: any) => (
                                    <tr key={s.id} className="hover:bg-darkBg/10">
                                      <td className="p-3 font-semibold text-white">
                                        {s.user?.fullName || "—"}
                                        <span className="block font-mono text-[10px] text-emerald-400">{s.user?.enrollmentNumber || "—"}</span>
                                      </td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 bg-darkBorder rounded font-semibold text-[10px] text-gray-300">
                                          {s.verificationMethod || "UNKNOWN"}
                                        </span>
                                      </td>
                                      <td className="p-3 font-mono text-[10px] text-gray-400">
                                        {s.loginTime ? new Date(s.loginTime).toLocaleString() : "—"}
                                      </td>
                                      <td className="p-3 font-mono text-[10px] text-gray-400">
                                        {s.logoutTime ? new Date(s.logoutTime).toLocaleString() : "Active"}
                                      </td>
                                      <td className="p-3 font-semibold text-gray-300">
                                        {s.durationMinutes ? `${s.durationMinutes} mins` : "—"}
                                      </td>
                                      <td className="p-3 font-mono text-gray-400">{s.ipAddress || "—"}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${s.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-500/10 text-gray-400"}`}>
                                          {s.status}
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

                      {/* ALERTS TAB */}
                      {historyTab === "alerts" && (
                        <div className="space-y-4">
                          <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Watchdog Policy Alerts</h4>
                          <div className="space-y-2">
                            {!historyData.securityAlerts || historyData.securityAlerts.length === 0 ? (
                              <div className="p-4 border border-darkBorder rounded-xl bg-darkCard text-center text-gray-500 text-xs">
                                No security policy alerts recorded for this workstation.
                              </div>
                            ) : (
                              historyData.securityAlerts.map((a: any) => (
                                <div key={a.id} className="p-4 border border-darkBorder rounded-xl bg-darkCard flex items-start justify-between gap-3 text-xs">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] ${a.alertSeverity === "CRITICAL" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                                        {a.alertSeverity}
                                      </span>
                                      <span className="font-bold text-white text-xs">{a.alertType}</span>
                                    </div>
                                    <p className="text-gray-300">{a.details}</p>
                                    <span className="text-[10px] text-gray-500 block font-mono">{new Date(a.alertTime).toLocaleString()}</span>
                                  </div>
                                  <div>
                                    {a.resolved ? (
                                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">RESOLVED</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded">UNRESOLVED</span>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {/* AUDITS TAB */}
                      {historyTab === "audits" && (
                        <div className="space-y-4">
                          <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Access Authentication Audit Trail</h4>
                          <div className="border border-darkBorder rounded-xl overflow-hidden bg-darkCard">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-darkBg/60 border-b border-darkBorder text-gray-400 font-bold uppercase">
                                  <th className="p-3">User/Source</th>
                                  <th className="p-3">IP Address</th>
                                  <th className="p-3">MAC</th>
                                  <th className="p-3">Method</th>
                                  <th className="p-3">Time</th>
                                  <th className="p-3 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-darkBorder">
                                {!historyData.authAudits || historyData.authAudits.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="p-4 text-center text-gray-500">No login authentication audits found.</td>
                                  </tr>
                                ) : (
                                  historyData.authAudits.map((a: any) => (
                                    <tr key={a.id} className="hover:bg-darkBg/10">
                                      <td className="p-3 font-semibold text-white">
                                        {a.enrollmentAttempt || "—"}
                                      </td>
                                      <td className="p-3 font-mono text-[10px] text-gray-400">{a.ipAddress || "—"}</td>
                                      <td className="p-3 font-mono text-[10px] text-gray-400">{a.macAddress || "—"}</td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 bg-darkBorder rounded font-semibold text-[10px] text-gray-300">
                                          {a.method || "—"}
                                        </span>
                                      </td>
                                      <td className="p-3 font-mono text-[10px] text-gray-500">
                                        {new Date(a.timestamp).toLocaleString()}
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${a.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                          {a.status}
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
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-900 border-t border-darkBorder flex justify-end shrink-0">
                  <button
                    onClick={() => {
                      setHistoryPC(null);
                      setHistoryData(null);
                    }}
                    className="px-4 py-2 bg-darkCard hover:bg-darkHover text-gray-300 border border-darkBorder font-bold rounded-lg text-xs transition"
                  >
                    Close History Logs
                  </button>
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

          {/* PASSWORD RESET MODAL OVERLAY */}
          {resetResult && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-darkCard border border-darkBorder rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center bg-slate-900">
                  <h3 className="font-bold text-lg text-white">🔑 Temporary Credentials</h3>
                  <button onClick={() => setResetResult(null)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-darkHover transition">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-300">
                    The password for student <strong className="text-white">{resetResult.fullName}</strong> ({resetResult.enrollmentNumber}) has been reset successfully.
                  </p>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                    <span className="text-xs text-gray-400 block font-bold uppercase tracking-wider mb-1">Temporary Password</span>
                    <code className="text-xl font-black text-blue-400 font-mono select-all select-text">{resetResult.tempPassword}</code>
                  </div>
                  <p className="text-xs text-amber-400 font-semibold bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg">
                    💡 Note: The student will be forced to change this password immediately upon their next login.
                  </p>
                </div>
                <div className="p-4 bg-slate-900 border-t border-darkBorder flex justify-end">
                  <button onClick={() => setResetResult(null)} className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-darkBg font-black rounded-lg text-xs transition">
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CSV STUDENT IMPORT MODAL OVERLAY */}
          {importedCredentials && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-darkCard border border-darkBorder rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center bg-slate-900">
                  <h3 className="font-bold text-lg text-white">🚀 Imported Student Accounts</h3>
                  <button onClick={() => setImportedCredentials(null)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-darkHover transition">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                  <p className="text-sm text-gray-300">
                    Below are the accounts generated from your CSV import. Please copy the temporary passwords for distribution.
                  </p>
                  <div className="space-y-2">
                    {importedCredentials.map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-darkBg/50 border border-darkBorder rounded-xl text-xs font-mono">
                        <div>
                          <span className="text-white font-bold block">{s.fullName}</span>
                          <span className="text-gray-400">{s.enrollmentNumber}</span>
                        </div>
                        <div className="text-right">
                          {s.status === "CREATED" ? (
                            <div className="space-y-0.5">
                              <span className="text-emerald-400 font-bold block">Password:</span>
                              <code className="text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[11px] select-all select-text">{s.tempPassword}</code>
                            </div>
                          ) : (
                            <span className="text-amber-400">Skipped (Exists)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-slate-900 border-t border-darkBorder flex justify-end">
                  <button 
                    onClick={() => exportImportedPasswordsCSV(importedCredentials)} 
                    className="mr-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-darkBg font-bold rounded-lg text-xs transition"
                  >
                    Export Passwords (CSV)
                  </button>
                  <button onClick={() => setImportedCredentials(null)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-bold rounded-lg text-xs transition">
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BULK PASSWORD GENERATION RESULT MODAL */}
          {bulkGenResult && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-darkCard border border-darkBorder rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-darkBorder flex justify-between items-center bg-gradient-to-r from-violet-900/50 to-indigo-900/50">
                  <div>
                    <h3 className="font-bold text-lg text-white">🔐 Bulk Password Generation Complete</h3>
                    <p className="text-xs text-violet-300 mt-0.5">{bulkGenResult.length} student passwords generated</p>
                  </div>
                  <button onClick={() => setBulkGenResult(null)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-darkHover transition">
                    <X size={20} />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 p-4 space-y-2">
                  {bulkGenResult.length === 0 ? (
                    <p className="text-center text-gray-400 py-10">All students already have passwords set. Nothing to generate.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Summary header */}
                      <div className="grid grid-cols-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 py-2 border-b border-darkBorder">
                        <span>Enrollment</span>
                        <span>Name</span>
                        <span>Dept / Sem</span>
                        <span className="text-right">Password</span>
                      </div>
                      {bulkGenResult.map((s: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-4 items-center p-3 bg-darkBg/40 border border-violet-500/10 hover:border-violet-500/30 rounded-xl text-xs font-mono transition">
                          <span className="text-emerald-400 font-bold truncate">{s.enrollmentNumber}</span>
                          <span className="text-gray-200 truncate">{s.fullName}</span>
                          <span className="text-gray-400">{s.department || "—"} / Sem {s.semester || "?"}</span>
                          <code className="text-right text-violet-300 font-black bg-violet-500/10 px-2 py-1 rounded select-all select-text tracking-widest">{s.tempPassword}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-900 border-t border-darkBorder flex justify-between items-center">
                  <span className="text-xs text-amber-400 font-semibold">⚠ Save these passwords! Students must change them on first login.</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => exportImportedPasswordsCSV(bulkGenResult.map(s => ({ ...s, status: "CREATED" })))}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-xs transition"
                    >
                      Export CSV
                    </button>
                    <button onClick={() => setBulkGenResult(null)} className="px-4 py-2 bg-darkCard hover:bg-darkHover text-gray-300 border border-darkBorder font-bold rounded-lg text-xs transition">
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: EMAIL GATEWAY CONFIG & MONITORING */}
          {activeTab === "email" && (
            <div className="space-y-8 animate-fade-in">
              {/* Header metrics summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Gateway Status</span>
                  <span className={`text-2xl font-black mt-2 ${emailStats?.health?.smtpConnection === "ONLINE" ? "text-emerald-400" : "text-red-400"}`}>
                    ● {emailStats?.health?.smtpConnection || "OFFLINE"}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Provider</span>
                  <span className="text-xl font-black mt-2 text-white uppercase">
                    {emailStats?.health?.activeProvider || "SMTP"}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pilot Redirection</span>
                  <span className={`text-xs font-bold mt-2 px-2.5 py-1 rounded-lg w-fit border ${emailStats?.health?.pilotMode ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    {emailStats?.health?.pilotMode ? "PILOT: Redirects to karan.mishra" : "PRODUCTION: Direct Recipient"}
                  </span>
                </div>
                <div className="bg-darkCard p-6 rounded-2xl border border-darkBorder flex flex-col justify-between shadow-lg">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Delivery Rate (Today)</span>
                  <span className="text-3xl font-black mt-2 text-sky-400">
                    {emailStats ? (emailStats.sentToday + emailStats.failedToday > 0 ? Math.round((emailStats.sentToday / (emailStats.sentToday + emailStats.failedToday)) * 100) : 100) : 100}%
                  </span>
                </div>
              </div>

              {/* SMTP stats details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/50 p-6 border border-darkBorder rounded-2xl shadow-xl">
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Queue Pending</span>
                  <p className="text-xl font-bold text-gray-200 mt-0.5">{emailStats?.queue?.pending || 0}</p>
                </div>
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Queue Failed</span>
                  <p className="text-xl font-bold text-red-400 mt-0.5">{emailStats?.queue?.failed || 0}</p>
                </div>
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Active OTPs</span>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5">{emailStats?.otp?.active || 0}</p>
                </div>
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">OTP Locked Accounts</span>
                  <p className="text-xl font-bold text-amber-500 mt-0.5">{emailStats?.otp?.locked || 0}</p>
                </div>
              </div>

              {/* Main settings split deck */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form config panel */}
                <div className="lg:col-span-2 bg-darkCard border border-darkBorder rounded-2xl p-6 space-y-6 shadow-xl">
                  <div className="border-b border-darkBorder pb-3">
                    <h3 className="text-base font-bold text-white">Email Gateway Settings & Authentication Provider</h3>
                    <p className="text-xs text-gray-500">Select active provider and edit gateway authentication keys.</p>
                  </div>

                  {emailConfig ? (
                    <form onSubmit={handleSaveEmailConfig} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">Email Dispatcher Provider</label>
                          <select
                            value={emailConfig.providerType}
                            onChange={(e) => setEmailConfig({ ...emailConfig, providerType: e.target.value })}
                            className="px-3 py-2.5 bg-darkBg border border-darkBorder rounded-xl text-sm w-full focus:outline-none focus:border-emerald-500 text-white"
                          >
                            <option value="SMTP">Pilot SMTP (Standard Mail Gateway)</option>
                            <option value="MS_EXCHANGE">Microsoft Exchange (Azure Graph Integration)</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2 mt-6">
                          <input
                            type="checkbox"
                            id="pilotModeCheck"
                            checked={emailConfig.pilotMode}
                            onChange={(e) => setEmailConfig({ ...emailConfig, pilotMode: e.target.checked })}
                            className="w-4 h-4 text-emerald-500 bg-darkBg border-darkBorder rounded focus:ring-emerald-500"
                          />
                          <label htmlFor="pilotModeCheck" className="text-xs font-bold text-amber-400 uppercase cursor-pointer">
                            Enable Pilot Mode Override
                          </label>
                        </div>
                      </div>

                      {emailConfig.providerType === "SMTP" ? (
                        <div className="space-y-4 pt-2 border-t border-darkBorder/40">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">SMTP Mail Host</label>
                              <input
                                type="text"
                                value={emailConfig.smtpHost || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, smtpHost: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="smtp.gmail.com"
                              />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">SMTP Gateway Port</label>
                              <input
                                type="number"
                                value={emailConfig.smtpPort || 587}
                                onChange={(e) => setEmailConfig({ ...emailConfig, smtpPort: parseInt(e.target.value) || 587 })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="587"
                              />
                            </div>
                            <div className="flex items-center space-x-2 mt-6">
                              <input
                                type="checkbox"
                                id="smtpSecureCheck"
                                checked={emailConfig.smtpSecure || false}
                                onChange={(e) => setEmailConfig({ ...emailConfig, smtpSecure: e.target.checked })}
                                className="w-4 h-4 text-emerald-500 bg-darkBg border-darkBorder rounded focus:ring-emerald-500"
                              />
                              <label htmlFor="smtpSecureCheck" className="text-xs font-bold text-gray-400 uppercase cursor-pointer">
                                Force SSL / TLS Secure
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">SMTP Username</label>
                              <input
                                type="text"
                                value={emailConfig.username || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, username: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="auth@suas.ac.in"
                              />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">SMTP Password / API Key</label>
                              <input
                                type="password"
                                value={emailConfig.passwordSet && !emailConfig.password ? "••••••••" : emailConfig.password || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="••••••••"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">Sender Email Address</label>
                              <input
                                type="email"
                                value={emailConfig.senderEmail || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, senderEmail: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="noreply@suas.ac.in"
                              />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">Sender Display Name</label>
                              <input
                                type="text"
                                value={emailConfig.senderName || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, senderName: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="ALAMS Authentication"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 pt-2 border-t border-darkBorder/40">
                          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs space-y-1.5 animate-fade-in">
                            <strong>💡 Microsoft Exchange Active Integration Ready:</strong>
                            <p>This panel configures Microsoft Azure Identity API credentials. The application remains loosely coupled and will instantly deploy when Exchange config is selected.</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">Application (Client) ID</label>
                              <input
                                type="text"
                                value={emailConfig.exchangeClientId || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, exchangeClientId: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white font-mono text-xs"
                                placeholder="00000000-0000-0000-0000-000000000000"
                              />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">Directory (Tenant) ID</label>
                              <input
                                type="text"
                                value={emailConfig.exchangeTenantId || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, exchangeTenantId: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white font-mono text-xs"
                                placeholder="00000000-0000-0000-0000-000000000000"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">Client Secret Credential Key</label>
                              <input
                                type="password"
                                value={emailConfig.exchangeClientSecretSet && !emailConfig.exchangeClientSecret ? "••••••••" : emailConfig.exchangeClientSecret || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, exchangeClientSecret: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white"
                                placeholder="••••••••"
                              />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-xs font-bold text-gray-400 uppercase">OAuth Redirect Callback URI</label>
                              <input
                                type="text"
                                value={emailConfig.exchangeRedirectUri || ""}
                                onChange={(e) => setEmailConfig({ ...emailConfig, exchangeRedirectUri: e.target.value })}
                                className="px-3 py-2 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white text-xs font-mono"
                                placeholder="http://localhost:5000/api/v1/auth/exchange/callback"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-4 border-t border-darkBorder/40">
                        <button
                          type="submit"
                          disabled={saveLoading}
                          className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-black rounded-xl text-xs transition duration-150 flex items-center space-x-2"
                        >
                          {saveLoading ? <RefreshCw size={14} className="animate-spin" /> : null}
                          <span>Save Configuration Settings</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-center py-10 text-gray-500">Loading Configuration Data...</div>
                  )}
                </div>

                {/* Validation check right pane */}
                <div className="bg-darkCard border border-darkBorder rounded-2xl p-6 space-y-6 shadow-xl h-fit">
                  <div className="border-b border-darkBorder pb-3">
                    <h3 className="text-base font-bold text-white">SMTP Gateway Diagnostic Tool</h3>
                    <p className="text-xs text-gray-500">Send an instant test email to verify DNS, socket handshake, and SMTP routing.</p>
                  </div>

                  <form onSubmit={handleSendTestEmail} className="space-y-4">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase">Recipient Target Email</label>
                      <input
                        type="email"
                        required
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        className="px-3 py-2.5 bg-darkBg border border-darkBorder rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white w-full font-semibold"
                        placeholder="karan.mishra@suas.ac.in"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={testLoading}
                      className="w-full py-2.5 bg-blue-500 hover:bg-blue-400 text-darkBg font-black rounded-xl text-xs transition duration-150 flex items-center justify-center space-x-2"
                    >
                      {testLoading ? <RefreshCw size={14} className="animate-spin" /> : null}
                      <span>Send Diagnostics Test Email</span>
                    </button>
                  </form>

                  {emailStats?.health?.smtpConnection === "ONLINE" ? (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs text-center font-bold">
                      ✔ Mail Gateway is fully reachable and verified.
                    </div>
                  ) : (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs text-center font-bold">
                      ✖ Connection unreachable. Check ports, host, SSL configs.
                    </div>
                  )}
                </div>
              </div>

              {/* Logs Audit panel */}
              <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-darkBorder bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Email Gateway Logs & Verification History</h3>
                    <p className="text-xs text-gray-500">Delivery audits, fail details, and OTP authentication timelines.</p>
                  </div>
                  <div className="flex bg-darkBg border border-darkBorder p-1 rounded-xl">
                    <button
                      onClick={() => setEmailSubTab("logs")}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${emailSubTab === "logs" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:text-white"}`}
                    >
                      SMTP Dispatch Logs
                    </button>
                    <button
                      onClick={() => setEmailSubTab("otps")}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${emailSubTab === "otps" ? "bg-emerald-500 text-darkBg" : "text-gray-400 hover:text-white"}`}
                    >
                      OTP Verification History
                    </button>
                  </div>
                </div>

                <div className="p-6 overflow-x-auto max-h-[400px] overflow-y-auto">
                  {emailSubTab === "logs" ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-gray-500 border-b border-darkBorder font-bold uppercase">
                          <th className="pb-3">Recipient Address</th>
                          <th className="pb-3">Subject</th>
                          <th className="pb-3">Template</th>
                          <th className="pb-3">Provider</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Dispatch Time</th>
                          <th className="pb-3">Error logs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-darkBorder/40">
                        {emailStats?.logs?.emails?.length > 0 ? (
                          emailStats.logs.emails.map((log: any) => (
                            <tr key={log.id} className="text-gray-300 hover:bg-darkHover/20">
                              <td className="py-3 font-semibold text-white">{log.recipient}</td>
                              <td className="py-3 font-medium">{log.subject}</td>
                              <td className="py-3 font-mono text-[10px] text-gray-400">{log.template}</td>
                              <td className="py-3 font-mono text-gray-400">{log.provider}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 text-gray-500">{new Date(log.sentTime).toLocaleString()}</td>
                              <td className="py-3 font-mono text-[10px] text-red-400 truncate max-w-[200px]" title={log.errorDetails || ""}>
                                {log.errorDetails || "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="text-center py-6 text-gray-500">No email logs discovered.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-gray-500 border-b border-darkBorder font-bold uppercase">
                          <th className="pb-3">Enrollment Number</th>
                          <th className="pb-3">Email Address</th>
                          <th className="pb-3">Verification Status</th>
                          <th className="pb-3">Retries</th>
                          <th className="pb-3">Created At</th>
                          <th className="pb-3">Verified At</th>
                          <th className="pb-3">Workstation IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-darkBorder/40">
                        {emailStats?.logs?.otps?.length > 0 ? (
                          emailStats.logs.otps.map((otp: any) => (
                            <tr key={otp.id} className="text-gray-300 hover:bg-darkHover/20">
                              <td className="py-3 font-bold text-white">{otp.enrollmentNumber}</td>
                              <td className="py-3 font-medium text-gray-400">{otp.email}</td>
                              <td className="py-3">
                                <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                  otp.status === "VERIFIED" ? "bg-emerald-500/10 text-emerald-400" :
                                  otp.status === "PENDING" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                                  otp.status === "EXPIRED" ? "bg-gray-500/10 text-gray-400" :
                                  "bg-red-500/10 text-red-400"
                                }`}>
                                  {otp.status}
                                </span>
                              </td>
                              <td className="py-3 font-mono font-bold text-center w-12">{otp.retryCount} / 3</td>
                              <td className="py-3 text-gray-500">{new Date(otp.generatedTime).toLocaleString()}</td>
                              <td className="py-3 text-gray-400">
                                {otp.verificationTime ? new Date(otp.verificationTime).toLocaleString() : "—"}
                              </td>
                              <td className="py-3 font-mono text-[10px] text-gray-500">{otp.clientIp || "N/A"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="text-center py-6 text-gray-500">No OTP verification records discovered.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
