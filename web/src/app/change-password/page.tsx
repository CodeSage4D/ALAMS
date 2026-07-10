"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function ChangePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState("");
  const [redirect, setRedirect] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get("token") || localStorage.getItem("student_token") || "";
    const urlRedirect = searchParams.get("redirect") || "/student/dashboard";
    setToken(urlToken);
    setRedirect(urlRedirect);

    if (!urlToken) {
      setError("Authorization token missing. Please log in again.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Password update failed.");
      }

      // Update student user mustChangePassword status in local storage if exists
      const storedUser = localStorage.getItem("student_user");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        parsed.mustChangePassword = false;
        localStorage.setItem("student_user", JSON.stringify(parsed));
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(redirect);
      }, 2500);
    } catch (err: any) {
      setError(err.message || "Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#04060d] text-center space-y-6">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[150px]"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-blue-500/10 rounded-full filter blur-[150px]"></div>
        
        <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 z-10">
          <CheckCircle2 size={64} className="animate-bounce" />
        </div>
        <h1 className="text-3xl font-black text-white z-10">Password Updated!</h1>
        <p className="text-gray-400 max-w-xs z-10 leading-relaxed">
          Your new password has been securely registered. Redirecting you to your workspace session...
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#04060d] overflow-hidden">
      {/* Cool Glacier Blue Ambient Orbs */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full filter blur-[150px] animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full filter blur-[150px] animate-pulse" style={{ animationDuration: '10s', animationDelay: "2s" }}></div>

      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:3rem_3rem]"></div>

      <div className="w-full max-w-md z-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <KeyRound size={26} />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Initialize Password</h2>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            This is your first login attempt. Please create a new, secure password.
          </p>
        </div>

        <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
          {error && (
            <div className="flex items-center space-x-2 p-3.5 mb-6 text-sm bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current/Temp Password */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Current Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-gray-500" size={18} />
                <input
                  type={showOld ? "text" : "password"}
                  required
                  placeholder="Enter current password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-[#0b0f19] border border-white/10 text-white placeholder-gray-600 text-sm focus:border-blue-500 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-4 text-gray-500 hover:text-white transition"
                >
                  {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">New Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-gray-500" size={18} />
                <input
                  type={showNew ? "text" : "password"}
                  required
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-[#0b0f19] border border-white/10 text-white placeholder-gray-600 text-sm focus:border-blue-500 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-4 text-gray-500 hover:text-white transition"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Confirm New Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-gray-500" size={18} />
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#0b0f19] border border-white/10 text-white placeholder-gray-600 text-sm focus:border-blue-500 focus:outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full py-4 mt-2 bg-blue-500 hover:bg-blue-400 disabled:bg-blue-800 disabled:text-gray-400 text-[#04060d] font-black rounded-xl shadow-lg shadow-blue-500/10 transition"
            >
              {loading ? "Updating Credentials..." : "Save Password & Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#04060d]">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </main>
    }>
      <ChangePasswordContent />
    </Suspense>
  );
}
