"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, User, Lock, AlertCircle, ArrowRight, ShieldCheck, Database, CheckCircle, HelpCircle } from "lucide-react";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [showAutofill, setShowAutofill] = useState(false);

  const redirectUrl = searchParams.get("redirect") || "/";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem("student_token");
    if (token) {
      router.push(redirectUrl);
    }

    // Ping API to verify connectivity
    const checkApi = async () => {
      try {
        const res = await fetch(`${apiUrl}/health`, { mode: "cors" });
        if (res.ok) {
          setApiStatus("online");
        } else {
          setApiStatus("offline");
        }
      } catch {
        setApiStatus("offline");
      }
    };
    checkApi();
  }, [router, redirectUrl, apiUrl]);

  const handleAutofill = (user: string, pass: string) => {
    setEnrollmentNumber(user);
    setPassword(pass);
    setShowAutofill(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentNumber || !password) {
      setError("Please fill in all credentials.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentNumber, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed. Check credentials.");
      }

      localStorage.setItem("student_token", data.token);
      localStorage.setItem("student_user", JSON.stringify(data.user));

      router.push("/student/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#04060d] overflow-hidden">
      {/* Background Glowing Ambient Orbs */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full filter blur-[150px] animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-teal-500/10 rounded-full filter blur-[150px] animate-pulse" style={{ animationDuration: '10s', animationDelay: "2s" }}></div>

      {/* Decorative Cybernetic Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:3rem_3rem]"></div>
      
      {/* Dynamic diagonal subtle glow lines */}
      <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent"></div>
      <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-teal-500/10 to-transparent"></div>

      <div className="w-full max-w-lg z-10 space-y-8">
        {/* Branding header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-emerald-950/40 rounded-2xl border border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-bounce-slow">
            <ShieldCheck size={38} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Aurxon <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">ALAMS</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Student Access Gateway — Scan dynamic lab workstation QRs to authenticate your local session.
          </p>
        </div>

        {/* Login Card */}
        <div className="relative backdrop-blur-md bg-slate-900/40 p-8 rounded-3xl shadow-2xl border border-slate-800/80 transition-all duration-300 hover:border-slate-700/80">
          
          {/* Status Indicators */}
          <div className="absolute -top-3 left-6 flex items-center space-x-2">
            <span className="px-3 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
              STUDENT PORTAL
            </span>
            
            {apiStatus === "checking" && (
              <span className="px-2.5 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[10px] font-semibold text-amber-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>Connecting API...</span>
              </span>
            )}
            {apiStatus === "online" && (
              <span className="px-2.5 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[10px] font-semibold text-emerald-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>API Online</span>
              </span>
            )}
            {apiStatus === "offline" && (
              <span className="px-2.5 py-0.5 bg-red-950/80 border border-red-900/50 rounded-full text-[10px] font-semibold text-red-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                <span>API Offline</span>
              </span>
            )}
          </div>

          {/* Quick Helper button for credentials */}
          <button 
            type="button"
            onClick={() => setShowAutofill(!showAutofill)}
            className="absolute top-4 right-4 text-slate-500 hover:text-emerald-400 transition-colors"
            title="Autofill default test accounts"
          >
            <HelpCircle size={18} />
          </button>

          {/* Autofill Panel */}
          {showAutofill && (
            <div className="mb-6 p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 animate-fadeIn">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Database size={14} className="text-emerald-400" />
                <span>Select Pilot Account to Autofill:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleAutofill("ENR2026001", "Student@2026!")}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-emerald-950/20 border border-slate-800 hover:border-emerald-500/30 text-left text-white transition-all"
                >
                  <div className="font-bold">Student 01</div>
                  <div className="text-[10px] text-slate-400">ENR2026001</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleAutofill("ENR2026002", "Student@2026!")}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-emerald-950/20 border border-slate-800 hover:border-emerald-500/30 text-left text-white transition-all"
                >
                  <div className="font-bold">Student 02</div>
                  <div className="text-[10px] text-slate-400">ENR2026002</div>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-3 transition">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Enrollment Number */}
            <div className="space-y-2">
              <label htmlFor="enrollment" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
                  className="block w-full rounded-2xl bg-slate-950/50 border border-slate-800/80 focus:border-emerald-500/50 py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all duration-300 text-base"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Password
              </label>
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
                  className="block w-full rounded-2xl bg-slate-950/50 border border-slate-800/80 focus:border-emerald-500/50 py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all duration-300 text-base"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || apiStatus === "offline"}
              className="relative flex w-full justify-center items-center py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50 text-base"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
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
          <div className="mt-8 text-center border-t border-slate-800/60 pt-6">
            <p className="text-slate-400 text-sm">
              Don't have a student account yet?{" "}
              <Link
                href="/signup"
                className="text-emerald-400 font-bold hover:text-emerald-300 transition duration-150"
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Footnote / Default helper */}
        <div className="text-center space-y-1 pt-2">
          <p className="text-[11px] text-slate-600">
            Real test credentials: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-500 border border-slate-900">ENR2026001</code> / <code className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-500 border border-slate-900">Student@2026!</code>
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
      <main className="flex min-h-screen items-center justify-center bg-[#04060d]">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </main>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
