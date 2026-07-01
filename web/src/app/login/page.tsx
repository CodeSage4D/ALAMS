"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, User, Lock, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirectUrl = searchParams.get("redirect") || "/";

  useEffect(() => {
    // If student is already logged in, redirect directly
    const token = localStorage.getItem("student_token");
    if (token) {
      router.push(redirectUrl);
    }
  }, [router, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentNumber || !password) {
      setError("Please fill in all credentials.");
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
        throw new Error(data.error || "Login failed. Check credentials.");
      }

      // Save user session
      localStorage.setItem("student_token", data.token);
      localStorage.setItem("student_user", JSON.stringify(data.user));

      // Route to student dashboard (role-specific portal)
      router.push("/student/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#060913] overflow-hidden">
      {/* Background Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full filter blur-[120px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full filter blur-[120px] animate-pulse-slow" style={{ animationDelay: "2s" }}></div>

      {/* Decorative lines / grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>

      <div className="w-full max-w-md z-10 space-y-8 animate-float">
        {/* Branding header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 rounded-2xl border border-emerald-500/30 text-emerald-400 neon-glow">
            <ShieldCheck size={36} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400">
            Aurxon <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">ALAMS</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Student Access Gateway — Scan QR codes and authorize local lab workstation sessions.
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8 rounded-3xl shadow-2xl relative border border-slate-800/80">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-full text-xs font-bold tracking-widest text-emerald-400 uppercase">
            STUDENT PORTAL
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-3 transition animate-pulse">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Enrollment Number */}
            <div>
              <label htmlFor="enrollment" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Enrollment Number (Username)
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                  <User size={18} />
                </div>
                <input
                  id="enrollment"
                  name="enrollment"
                  type="text"
                  required
                  placeholder="e.g. ENR2026001"
                  value={enrollmentNumber}
                  onChange={(e) => setEnrollmentNumber(e.target.value)}
                  className="block w-full rounded-2xl glass-input py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none text-base"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  name="password"
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
              className="relative flex w-full justify-center items-center py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#060913] font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300 transform active:scale-95 disabled:opacity-50 text-base font-black tracking-wider"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-[#060913] border-t-transparent rounded-full animate-spin"></div>
                  <span>Authenticating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </div>
              )}
            </button>
          </form>

          {/* Switch to Signup page */}
          <div className="mt-8 text-center border-t border-slate-800/80 pt-6">
            <p className="text-slate-400 text-sm">
              Don't have a student account yet?{" "}
              <Link
                href="/signup"
                className="text-emerald-400 font-bold hover:text-emerald-300 hover:underline transition duration-150"
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Footnote / Default helper */}
        <div className="text-center space-y-1 pt-2">
          <p className="text-[11px] text-slate-600">
            For pilot setups, use default credentials e.g., <code className="text-slate-500">ENR2026001</code> / <code className="text-slate-500">Student@2026!</code>
          </p>
          <p className="text-[11px] text-slate-700">
            Aurxon Lab Access Management System — Version 1.0.0
          </p>
        </div>
      </div>
    </main>
  );
}

export default function StudentLogin() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#060913]">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </main>
    }>
      <LoginFormContent />
    </Suspense>
  );
}

