# CLASS SPHERE — HEIST

A modular monolith for the Pwani University class portal using Node.js/Express, MySQL, Bootstrap 5 and browser JavaScript.

## Current implementation
The working tree includes the responsive public website, image-transcribed BSc Telecom & IT-Y3 timetable, student registration with email-verification or manual admin-approval flow, admin provisioning, role-gated dashboards, persistent class reminders/notices, content and academic administration, contact inbox, private resource uploads/downloads, permission-confirmed gallery publication, individualized email campaigns with unsubscribe, dark/light themes, glassmorphism navigation and dashboards, weekly/admin activity charts, year/semester unit filters, student uploads held for review, and administrator-controlled background file upload. CAT/exam and next-class countdowns are supported. When SMTP is absent, admins can open Gmail with selected students in BCC for manual sending. Optional OpenAI study/announcement assistants remain disabled. External services and database credentials are not included.

## Windows setup
1. Install Node.js 22+ and MySQL 8-compatible server.
2. Create database `class_sphere` using utf8mb4.
3. Copy `.env.example` to `.env` and enter local database credentials. Keep `.env` private and untracked.
4. Run `npm install`, then apply `database/001_initial_academics_and_y3_timetable.sql`, `database/002_accounts_and_portal_schema.sql`, `database/003_uploads_and_site_appearance.sql`, and `database/004_manual_email_and_countdowns.sql` once each, in that order.
5. Configure SMTP and `APP_BASE_URL` for email verification, password reset and email campaigns. Set `PRIVATE_STORAGE_DIR` to a persistent private path. Set `OPENAI_API_KEY` and `OPENAI_MODEL` only if enabling AI.
6. Create the first administrator with `npm run create-admin`.
7. Run `npm run dev` and open http://localhost:3000. `/api/health` reports database connectivity.

Migration 001 seeds 37 units and 16 timetable entries transcribed from the supplied image. Migration 002 creates portal tables without fake users or content. Do not reapply migrations to a database with existing data.

Production requires managed secrets, HTTPS, least-privilege DB access, private persistent file storage, encrypted backups and a tested restore. SMTP, OpenAI, database credentials and production storage are not configured in this workspace.
