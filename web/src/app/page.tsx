import Link from "next/link";
import { Monitor, Smartphone, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#04060d] overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-emerald-500/5 rounded-full filter blur-[120px]"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-500/5 rounded-full filter blur-[120px]"></div>

      {/* Cybernetic grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:3rem_3rem]"></div>

      <div className="max-w-4xl text-center space-y-10 z-10">
        {/* Title / Branding */}
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <ShieldCheck size={52} className="animate-pulse" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            SCSIT <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">ALAMS</span>
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-xl leading-relaxed">
            Educational Computer Lab Access Management System. Secure direct and dynamic session authorization, integrated attendance audits, and active endpoint policy syncs.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto pt-4">
          {/* Admin Control Deck */}
          <Link href="/admin/dashboard" className="group">
            <div className="h-full p-8 glass-card rounded-2xl hover:border-emerald-500/30 transition-all duration-300 ease-out text-left space-y-4 shadow-2xl hover:-translate-y-1">
              <div className="p-3 w-fit bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/20 transition-all">
                <Monitor size={24} />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                Command Deck
              </h3>
              <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                Manage workstation pairings, import student registers, coordinate security firewall rules, configure group profiles, and monitor diagnostics.
              </p>
            </div>
          </Link>

          {/* Student Access Portal */}
          <Link href="/login" className="group">
            <div className="h-full p-8 glass-card rounded-2xl hover:border-emerald-500/30 transition-all duration-300 ease-out text-left space-y-4 shadow-2xl hover:-translate-y-1">
              <div className="p-3 w-fit bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/20 transition-all">
                <Smartphone size={24} />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                Student Access Gateway
              </h3>
              <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                Scan dynanic screen-lock QR codes to generate session keys, or verify your physical lab attendance via direct credentials authentication.
              </p>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-[11px] text-slate-700 pt-8 tracking-wide font-medium">
          Symbiosis University of Applied Sciences, Indore • Lab Access Systems • Version 1.1.0
        </div>
      </div>
    </main>
  );
}
