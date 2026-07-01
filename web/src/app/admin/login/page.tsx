"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, User, Lock, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";

export default function AdminLogin() {
  const router = useRouter();
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      router.push("/admin/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentNumber || !password) {
      setError("Provide administration credentials.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentNumber, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed.");
      }

      if (data.user.role !== "ADMIN" && data.user.role !== "SUPERVISOR") {
        throw new Error("Access denied. Unauthorized role.");
      }

      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_user", JSON.stringify(data.user));

      router.push("/admin/dashboard");
    } catch (err: any) {
      setError(err.message || "Connection failure to admin API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#060913] overflow-hidden">
      {/* Background Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full filter blur-[120px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full filter blur-[120px] animate-pulse-slow" style={{ animationDelay: "2s" }}></div>

      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>

      <div className="w-full max-w-md z-10 space-y-8 animate-float">
        {/* Branding header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 bg-gradient-to-tr from-indigo-500/20 to-emerald-500/10 rounded-2xl border border-indigo-500/30 text-indigo-400 neon-glow-indigo">
            <ShieldCheck size={36} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400">
            ALAMS <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-300">Admin</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Secure administrative control interface for lab computers, students, and session alerts.
          </p>
        </div>

        {/* Admin Login Card */}
        <div className="glass-card p-8 rounded-3xl shadow-2xl relative border border-slate-800/80">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 rounded-full text-xs font-bold tracking-widest text-indigo-400 uppercase">
            ADMIN PANEL
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-3 transition animate-pulse">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Username / ID */}
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Admin Email / ID
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                  <User size={18} />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  placeholder="e.g. karan.mishra@suas.ac.in"
                  value={enrollmentNumber}
                  onChange={(e) => setEnrollmentNumber(e.target.value)}
                  className="block w-full rounded-2xl glass-input py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none text-base"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Secure Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-2xl glass-input py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none text-base"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="relative flex w-full justify-center items-center py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-300 transform active:scale-95 disabled:opacity-50 text-base font-black tracking-wider"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verifying Credentials...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span>Authorize Dashboard</span>
                  <ArrowRight size={18} />
                </div>
              )}
            </button>
          </form>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 text-xs text-slate-500 hover:text-slate-400 transition"
          >
            <ArrowLeft size={12} />
            <span>Back to Gateway Hub</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
