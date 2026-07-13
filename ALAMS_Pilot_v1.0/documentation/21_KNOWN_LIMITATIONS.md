# ALAMS Known Limitations — Pilot v1.0.0

> These limitations are **acceptable for the controlled pilot** on 5 workstations with supervised users.
> They **must be addressed before scaling** to additional labs or public deployment.

---

## Security Limitations

| ID | Severity | Limitation | Mitigation Plan |
|----|----------|------------|-----------------|
| KL-001 | Medium | Offline fallback PIN in MainWindow.xaml.cs uses hardcoded `123456` match | Implement local encrypted credential cache (SQLCipher) in v1.1.0 |
| KL-002 | Medium | No rate limiting on `/api/v1/auth/login` or `/api/v1/client/fallback-auth` | Add `express-rate-limit` before public deployment |
| KL-003 | Medium | JWT_SECRET and QR_SIGNING_KEY are human-readable strings in `.env` | Rotate to 64-char cryptographically random values before scaling |
| KL-004 | Low | QR image rendered via `api.qrserver.com` (external internet dependency) | Self-host QR generator for air-gapped or internet-restricted environments |
| KL-005 | Low | No HTTPS/TLS on server or web console | Add TLS via nginx reverse proxy or Caddy before public access |

---

## Functional Limitations

| ID | Severity | Limitation | Notes |
|----|----------|------------|-------|
| KL-006 | Low | Timetable has single wide slot (08:00–21:00) in seed data | Reflects pilot convenience; real timetable import needed for production |
| KL-007 | Low | Only one lab (SUAS Lab A) seeded | Additional labs can be created via Admin Dashboard |
| KL-008 | Low | No email delivery — password reset tokens logged to console only | Wire SMTP (e.g., Resend, SendGrid) in v1.1.0 |
| KL-009 | Low | Student portal is read-only web page; no native mobile app | Mobile app deferred to future release |
| KL-010 | Low | Attendance `EXCUSED` and `MANUAL_OVERRIDE` statuses exist in schema but no UI to set them | Admin manual override UI planned for v1.1.0 |

---

## Operational Limitations

| ID | Severity | Limitation | Notes |
|----|----------|------------|-------|
| KL-011 | Low | Neon PostgreSQL free tier may cold-start after inactivity (high first-query latency) | Upgrade to paid compute for production |
| KL-012 | Low | No automatic client update mechanism | Client updates require manual reinstallation in pilot |
| KL-013 | Low | WPF client hardcoded client version `"1.0.0"` | Implement build-time version injection in v1.1.0 |
| KL-014 | Low | WebSocket reconnection on client is not automatic | Client must be restarted manually after network interruption > 5 min |

---

## Deferred Features (Not in Scope for v1.0.0)

- Exam Mode (USB lock, restricted access)
- Remote Assistance
- Multi-campus Management
- AI Analytics / Predictive Maintenance
- Parent Portal
- Native Mobile Application
- Automatic Client Updates
- LDAP/Active Directory integration
