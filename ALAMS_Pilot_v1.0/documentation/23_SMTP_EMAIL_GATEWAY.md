# SMTP & Exchange Email Authentication Gateway Manual

This document details the configuration, operations, and troubleshooting procedures for the Email OTP Authentication ecosystem built into the ALAMS Central Server.

---

## 1. System Overview

ALAMS integrates a multi-provider Email Gateway. By default, it operates in **SMTP Mode** using standard nodemailer connections. It is engineered with architectural support to hot-swap to **Microsoft Exchange Integration** via Microsoft Graph API without alterations to the core authentication controller logic.

```
+------------------+     (Email Request)     +-------------------+
|  AlamsClient.exe |  -------------------->  |   ALAMS Server    |
+------------------+                         +-------------------+
                                                       |
                                                       | (Creates Job)
                                                       v
+------------------+      (Dispatches)       +-------------------+
|  Student Inbox   |  <--------------------  |   Email Queue     |
+------------------+                         +-------------------+
```

---

## 2. Configuration Options

Administrators manage credentials directly within the **Embedded Web Panel** -> **Email Gateway** tab.

### SMTP Server Settings
* **SMTP Host**: Domain or IP address of the mail server (e.g., `smtp.office365.com` or `mail.suas.ac.in`).
* **SMTP Port**: Port used (typically `587` for STARTTLS, `465` for SSL, or `25` for unencrypted).
* **Secure**: Toggle defining whether SSL/TLS connection is initialized.
* **Username**: Authentication credentials username (e.g. `alams-noreply@suas.ac.in`).
* **Password**: Securely encrypted credentials password (stored using AES-256-GCM).
* **Sender Email**: Outgoing "From" email address.
* **Sender Name**: Custom displayName (e.g. `ALAMS Authentication Service`).

### Pilot Redirection Safeguard
When **Pilot Mode** is enabled, the server intercepts **all** outgoing student OTP emails and diverts them to:
**`karan.mishra@suas.ac.in`**

This prevents spamming random student emails during deployment testing.

---

## 3. Database Table Structures

The email authentication engine relies on four primary database tables in PostgreSQL:

### EmailConfig Table
Stores gateway credentials. Passwords are saved as encrypted strings.
```sql
CREATE TABLE "EmailConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerType" TEXT NOT NULL DEFAULT 'SMTP', -- 'SMTP' | 'EXCHANGE'
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "pilotMode" BOOLEAN NOT NULL DEFAULT true,
    ...
);
```

### EmailQueue Table
Maintains asynchronous email tasks with retry counters and backoff limits.
```sql
CREATE TABLE "EmailQueue" (
    "id" SERIAL PRIMARY KEY,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" TEXT NOT NULL, -- JSON string representation
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING'|'PROCESSING'|'SENT'|'FAILED'
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetry" TIMESTAMP,
    "errorDetails" TEXT
);
```

---

## 4. Troubleshooting Handshaking Errors

### Diagnostic Error: `< is an invalid start of a value`
* **Cause**: This happens when the dashboard calls the server `/api/v1/admin/config/email/test` endpoint without passing a valid JSON body, or when the server responds with a non-JSON HTML page (e.g. HTTP 400 Bad Request or HTTP 500 error page from reverse proxy).
* **Resolution**: Ensure the frontend payload headers specify `"Content-Type": "application/json"`. The backend has been updated to return structured JSON errors even during handshake crashes.

### Network Error: `connect ECONNREFUSED`
* **Cause**: Node.js could not reach the mail server on the specified Host and Port.
* **Resolution**: Verify firewall inbound/outbound rules on the host server PC allowing connections to port 587/465.

### SSL Error: `negotiation failed`
* **Cause**: Port mismatch or mail server TLS configuration mismatch.
* **Resolution**: Toggle the `Secure` option in the settings. If using Port 587, Secure should typically be **false** (uses STARTTLS upgrade). If using Port 465, Secure must be **true**.
