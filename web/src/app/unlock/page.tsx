"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Monitor, ShieldAlert, CheckCircle2, RotateCcw, LogOut } from "lucide-react";

interface QRPayload {
  computerId: string;
  deviceName: string;
  labId: string;
  pcNumber: string;
  timestamp: number;
}

function MobileUnlockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [token, setToken] = useState<string | null>(null);
  const [pcInfo, setPcInfo] = useState<QRPayload | null>(null);
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // 1. Get Token from URL
    const qrToken = searchParams.get("token");
    setToken(qrToken);

    // 2. Auth Guard
    const studentToken = localStorage.getItem("student_token");
    const studentUser = localStorage.getItem("student_user");

    if (!studentToken || !studentUser) {
      if (qrToken) {
        router.push(`/login?redirect=/unlock?token=${encodeURIComponent(qrToken)}`);
      } else {
        router.push("/login");
      }
      return;
    }

    const userObj = JSON.parse(studentUser);
    setStudentName(userObj.fullName);

    // 3. Decode QR Token Payload to display workstation info
    if (qrToken) {
      try {
        const parts = qrToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1])) as QRPayload;
          setPcInfo(payload);
        }
      } catch (err) {
        setError("Invalid QR payload format.");
      }
    } else {
      setError("No workstation token scanned. Please scan the QR code displayed on the lab computer.");
    }
  }, [router, searchParams]);

  const handleUnlock = async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const studentToken = localStorage.getItem("student_token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/mobile/verify-unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({ qrToken: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unlock request failed.");
      }

      setUnlocked(true);
    } catch (err: any) {
      setError(err.message || "Connection timed out. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("student_token");
    localStorage.removeItem("student_user");
    router.push("/login");
  };

  if (unlocked) {
    return (
      <main className="flex min-height-screen flex-col items-center justify-center p-6 bg-darkBg text-center space-y-6">
        <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
          <CheckCircle2 size={64} className="animate-bounce" />
        </div>
        <h1 className="text-3xl font-black text-white">Workstation Unlocked!</h1>
        <p className="text-gray-400 max-w-xs leading-relaxed">
          Access has been provisioned. The lock screen on <span className="text-white font-bold">{pcInfo?.pcNumber || "the computer"}</span> has bypassed and your attendance logged.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 px-6 py-3 bg-darkCard border border-darkBorder hover:border-emerald-500/30 text-white rounded-xl font-semibold flex items-center space-x-2 transition"
        >
          <RotateCcw size={16} />
          <span>Portal Home</span>
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-height-screen flex-col justify-between p-6 bg-darkBg">
      {/* Header */}
      <header className="flex justify-between items-center py-4 border-b border-darkBorder">
        <div>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Authenticated as</p>
          <p className="text-white font-semibold text-sm">{studentName || "Student"}</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-darkCard transition"
          title="Sign Out"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Container */}
      <div className="my-auto py-10 space-y-8 max-w-sm mx-auto w-full">
        {error ? (
          <div className="bg-darkCard p-6 rounded-2xl border border-red-500/20 text-center space-y-4">
            <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">Verification Failed</h3>
            <p className="text-gray-400 text-sm">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-[#1F2937] hover:bg-[#374151] text-white font-semibold rounded-xl transition text-sm"
            >
              Scan Again
            </button>
          </div>
        ) : (
          <div className="bg-darkCard p-8 rounded-2xl border border-darkBorder space-y-8 shadow-2xl text-center">
            {/* Monitor Icon Container */}
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Monitor size={32} />
            </div>

            {/* PC Meta */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest px-3 py-1 bg-emerald-400/10 rounded-full">
                {pcInfo?.pcNumber || "DETECTED PC"}
              </span>
              <h2 className="text-2xl font-black text-white mt-3">
                {pcInfo?.deviceName || "Workstation"}
              </h2>
              <p className="text-sm text-gray-400">
                Are you physically present at this computer? Confirm to open your desktop environment.
              </p>
            </div>

            {/* Unlock Button */}
            <button
              onClick={handleUnlock}
              disabled={loading || !token}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-darkBg font-black rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition duration-150 text-base"
            >
              {loading ? "Authorizing Unlock..." : "Confirm & Unlock"}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 py-4">
        Aurxon Lab Access Management System
      </footer>
    </main>
  );
}

export default function MobileUnlock() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#060913]">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </main>
    }>
      <MobileUnlockContent />
    </Suspense>
  );
}

