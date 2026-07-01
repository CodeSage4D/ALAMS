import Link from "next/link";
import { Monitor, Smartphone, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-height-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-darkBg via-slate-900 to-indigo-950">
      <div className="max-w-4xl text-center space-y-8">
        {/* Title */}
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
            <ShieldCheck size={56} className="animate-pulse" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            AURXON <span className="text-emerald-400">ALAMS</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-xl">
            Educational Computer Lab Access Management System. Secure authentication and automated attendance audits.
          </p>
        </div>

        {/* Portals Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto pt-6">
          {/* Admin Dashboard */}
          <Link href="/admin/dashboard" className="group">
            <div className="h-full p-8 bg-darkCard border border-darkBorder hover:border-emerald-500/40 rounded-2xl transition duration-300 ease-in-out text-left space-y-4 shadow-xl hover:shadow-emerald-950/20 hover:-translate-y-1">
              <div className="p-3 w-fit bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/20 transition">
                <Monitor size={28} />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition">
                Admin Control Panel
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Manage computers, register students, configure labs, audit session logs, and monitor real-time workstation status.
              </p>
            </div>
          </Link>

          {/* Student Web Unlock */}
          <Link href="/login" className="group">
            <div className="h-full p-8 bg-darkCard border border-darkBorder hover:border-emerald-500/40 rounded-2xl transition duration-300 ease-in-out text-left space-y-4 shadow-xl hover:shadow-emerald-950/20 hover:-translate-y-1">
              <div className="p-3 w-fit bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/20 transition">
                <Smartphone size={28} />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition">
                Student Mobile Unlock
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Scan dynamic workstation QR codes, confirm physical presence, and request desktop workspace provisioning.
              </p>
            </div>
          </Link>
        </div>

        <div className="text-xs text-gray-600 pt-10">
          Aurxon Lab Access Management System — Version 1.0.0 (MVP)
        </div>
      </div>
    </main>
  );
}
