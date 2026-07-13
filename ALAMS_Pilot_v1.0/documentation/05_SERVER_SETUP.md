# ALAMS Central Server Deployment Guide

This document describes the environment setup and operation instructions for the **ALAMS (Aurxon Lab Access Management System)** central server.

---

## 1. System Requirements

*   **Operating System**: Windows Server 2019/2022, Windows 10/11 Professional (64-bit), or Linux (Ubuntu 20.04/22.04 LTS).
*   **Runtime Environment**: Node.js 20 LTS (or later) and npm 10+.
*   **Database**: PostgreSQL 15+ or Neon Cloud database instance.
*   **Hardware specs**: Minimum 2 Cores, 4 GB RAM, 20 GB Storage.

---

## 2. Server Installation

### Automated Setup (Recommended)
Run the automated installation script from the root directory as an Administrator:
```batch
.\scripts\install_server.bat
```
This script will:
1. Verify directories.
2. Run `npm install` inside the `server/` directory.
3. Configure the environment variables (`.env`).
4. Generate the Prisma database client.
5. Push schema migrations and seed default credentials.

### Manual Setup
If you prefer to perform step-by-step setup:
```powershell
cd server
npm install
copy .env.example .env
# Edit .env variables (DATABASE_URL, DIRECT_URL, JWT_SECRET, QR_SIGNING_KEY)
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```

---

## 3. Environment Variables Configuration (`.env`)

Verify that the following variables are correctly configured inside `server/.env`:

*   **`PORT`**: Set the HTTP port (default is `5000`).
*   **`DATABASE_URL`**: Transaction connection pool URL (used by the server runtime).
*   **`DIRECT_URL`**: Direct connection string (used by Prisma migrations).
*   **`JWT_SECRET`**: Cryptographic secret for signing administrative and student login tokens.
*   **`QR_SIGNING_KEY`**: HMAC secret key for validating dynamic 60-second lock screen QR tokens.
*   **`WATCHDOG_SECRET`**: Authentication header token shared between server and workstation Watchdog services.
*   **`CORS_ORIGINS`**: Strict comma-separated origin whitelist (e.g. `http://localhost:3000,http://localhost:5000`).

---

## 4. Launching the Server in Production

### Option A: Standard Batch Command (Recommended)
Run the startup script:
```batch
.\scripts\start_server.bat
```
This script checks for compiled production builds (`dist/index.js`). If missing, it builds the project via `npm run build` and then starts the runtime using `npm start`.

### Option B: PM2 Process Manager (Highly Recommended for Linux/Windows Server)
For process persistence, automatic restarts, and log rotating:
```bash
npm install -g pm2
pm2 start dist/index.js --name "alams-server"
pm2 save
pm2 startup
```

---

## 5. Operations & Health Monitoring

### Health Endpoint Check
Query the health check status from any computer:
```powershell
curl http://[server-ip]:5000/health
```
**Expected Response**:
```json
{ "status": "healthy", "timestamp": 1782710400000 }
```

### Detailed Diagnostics
To verify database links and query seeded metrics (e.g. registered computers/labs):
```powershell
curl http://[server-ip]:5000/api/v1/health/diagnostics
```

### Log files
If issues occur during startup, review:
*   `server/server_startup.log` (initialization logs)
*   `server/server_error.log` (unhandled exceptions)
