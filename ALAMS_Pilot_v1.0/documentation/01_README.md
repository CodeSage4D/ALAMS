# ALAMS Documentation — LaTeX Source

This directory contains the complete LaTeX source for the **Aurxon Lab Access Management System User Manual**.

## Directory Structure

```
docs/
├── main.tex                    ← Master document (compile this)
├── compile.bat                 ← Windows compile script (double-click to build)
│
├── chapters/
│   ├── ch01_overview.tex       ← System Overview & Architecture
│   ├── ch02_prerequisites.tex  ← Prerequisites & Environment Setup
│   ├── ch03_neon_database.tex  ← Neon PostgreSQL Setup
│   ├── ch04_server.tex         ← Express API Server
│   ├── ch05_dashboard.tex      ← Web Dashboard & Mobile Gateway
│   ├── ch06_client_watchdog.tex← Windows Client & Watchdog
│   ├── ch07_student_management.tex← Student Account Management
│   ├── ch08_registration.tex   ← Computer Registration
│   ├── ch09_authentication.tex ← Authentication Flows
│   ├── ch10_admin_operations.tex← Admin Daily Operations
│   ├── ch11_security_monitoring.tex← Security & Monitoring
│   └── ch12_troubleshooting.tex← Troubleshooting & Recovery
│
└── appendix/
    ├── app_a_credentials.tex   ← Complete Credentials Reference
    ├── app_b_api_reference.tex ← API Endpoint Reference
    └── app_c_security_checklist.tex← Pilot Security Checklist
```

## How to Compile

### Option A: Use the compile script
```batch
cd "d:\Project Data Aurxon\ALAMS\docs"
compile.bat
```

### Option B: Manual pdflatex
```bash
cd "d:\Project Data Aurxon\ALAMS\docs"
pdflatex -interaction=nonstopmode -jobname="ALAMS_User_Manual" main.tex
pdflatex -interaction=nonstopmode -jobname="ALAMS_User_Manual" main.tex
pdflatex -interaction=nonstopmode -jobname="ALAMS_User_Manual" main.tex
```

> Run pdflatex **3 times** to fully resolve table of contents and cross-references.

### Option C: Online (Overleaf)
1. Create a new project on [overleaf.com](https://overleaf.com)
2. Upload all `.tex` files maintaining the folder structure
3. Set `main.tex` as the main document
4. Click Compile

## Required LaTeX Packages

The following packages are used (all available in MiKTeX/TeX Live):

| Package | Purpose |
|---|---|
| `tcolorbox` | Callout boxes (info, warning, danger, code) |
| `tikz`, `pgfplots` | Architecture diagrams, flowcharts |
| `fontawesome5` | Icons (shield, server, lock, etc.) |
| `listings` | Code listings with syntax highlighting |
| `booktabs`, `tabularx` | Professional tables |
| `geometry`, `fancyhdr` | Page layout and headers |
| `titlesec` | Chapter/section formatting |
| `colortbl` | Colored table rows |
| `helvet` | Helvetica sans-serif font |

### Install Missing Packages (MiKTeX)
```bash
# Via MiKTeX Package Manager
mpm --install=tcolorbox
mpm --install=pgfplots
mpm --install=fontawesome5
mpm --install=sourcecodepro
```

## Output

The compiled output is `ALAMS_User_Manual.pdf` — a professional A4 document with:
- Dark-themed title page (Aurxon branding)
- Table of Contents, List of Figures, List of Tables
- 12 chapters + 3 appendices
- Architecture diagrams rendered with TikZ
- Authentication sequence diagrams
- Printable security checklist (Appendix C)
- Complete API reference (Appendix B)

## Classification

> **CONFIDENTIAL — INTERNAL USE ONLY**
> 
> This document contains pilot deployment credentials and security keys.
> Do not distribute outside the ALAMS deployment team.
