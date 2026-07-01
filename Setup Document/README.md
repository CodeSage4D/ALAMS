# ALAMS Setup Document Folder

Welcome to the **Setup Document** folder! This folder contains the comprehensive documentation needed to configure, deploy, run, test, and troubleshoot the **ALAMS (Aurxon Lab Access Management System)**.

## 📖 Available Documentation

*   ### [ALAMS Comprehensive Setup Guide](file:///d:/Project%20Data%20Aurxon/ALAMS/Setup%20Document/Setup_Guide.md)
    *Detailed step-by-step instructions for the PostgreSQL database, central backend server, administrative web console, client workstations, and operations dashboard. Includes potential error messages, reasons for failure, exact troubleshooting steps, and alternative methods for each phase.*

---

## 🚀 Quick Setup Reference

If you are setting up the system for the first time, follow the setup guide sequentially:

1.  **Configure PostgreSQL Connection**: Paste your pooled and direct Neon PostgreSQL connection URLs inside the server environment configuration file [.env](file:///d:/Project%20Data%20Aurxon/ALAMS/server/.env).
2.  **Deploy Central Server API**:
    ```powershell
    # Execute the automated deployment script
    .\scripts\install_server.bat
    ```
3.  **Start Central Server**:
    ```powershell
    .\scripts\start_server.bat
    ```
4.  **Launch Web Dashboard**:
    ```powershell
    cd web
    npm install
    npm run dev
    ```
5.  **Bootstrap Workstations**: Run `installer/bootstrap_installer.exe` as Administrator on client computers to auto-register them.
6.  **Approve Workstations**: Log into dashboard at `http://[server-ip]:3000` to approve registered clients.
7.  **Finalize Shell Lock**: Run [EnrollShell.ps1](file:///d:/Project%20Data%20Aurxon/ALAMS/EnrollShell.ps1) on workstations to restrict the student shell interface.

---

> **Note**: For detailed troubleshooting, rollback guides, and backup/restore steps, refer to [Setup_Guide.md](file:///d:/Project%20Data%20Aurxon/ALAMS/Setup%20Document/Setup_Guide.md).
