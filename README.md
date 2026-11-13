# CLASS SPHERE — HEIST

A modular monolith for the Pwani University class portal using Node.js/Express, MySQL, Bootstrap 5 and browser JavaScript.

## Current implementation
The working tree includes the responsive public website, image-transcribed BSc Telecom & IT-Y3 timetable, student registration with email-verification or manual admin-approval flow, admin provisioning, role-gated dashboards, persistent class reminders/notices, content and academic administration, contact inbox, private resource uploads/downloads, permission-confirmed gallery publication, individualized email campaigns with unsubscribe, dark/light themes, glassmorphism navigation and dashboards, weekly/admin activity charts, year/semester unit filters, student uploads held for review, administrator-controlled background file upload, a dedicated student approval queue, supplied course crest and home landscape assets, step-by-step timetable browsing, paginated year/semester unit lists, drag/swipe-to-reply chat messages, and curved icon sidebars. The homepage displays its landscape separately from the welcome copy, and the supplied landscape is also used as the luminous-blue login backdrop. Admin events can be saved as drafts or saved and published; publishing creates notices for eligible classmates. CAT/exam and next-class countdowns are supported. When SMTP is absent, admins can open Gmail with selected students in BCC for manual sending. Optional OpenAI study/announcement assistants remain disabled. External services and database credentials are not included.

## Windows setup
1. Install Node.js 22+ and MySQL 8-compatible server.
2. Create database `class_sphere` using utf8mb4.
3. Copy `.env.example` to `.env` and enter local database credentials. Keep `.env` private and untracked.
4. Run `npm install`, then apply `database/001_initial_academics_and_y3_timetable.sql`, `database/002_accounts_and_portal_schema.sql`, `database/003_uploads_and_site_appearance.sql`, `database/004_manual_email_and_countdowns.sql`, `database/005_chat_groups_and_analytics.sql`, and `database/006_chat_message_replies.sql` once each, in that order.
5. Configure SMTP and `APP_BASE_URL` for automatic email verification, password reset and email campaigns. Without SMTP, students can register and await administrator approval; admins can open Gmail drafts with selected recipients in BCC and send manually. Set `PRIVATE_STORAGE_DIR` to a persistent private path. Set `OPENAI_API_KEY` and `OPENAI_MODEL` only if enabling AI.
6. Create the first administrator with `npm run create-admin`.
7. Run `npm run dev` and open http://localhost:3000. `/api/health` reports database connectivity.

Migration 001 seeds 37 units and 16 timetable entries transcribed from the supplied image. Migration 002 creates portal tables without fake users or content. Do not reapply migrations to a database with existing data.

Production requires managed secrets, HTTPS, least-privilege DB access, private persistent file storage, encrypted backups and a tested restore. SMTP, OpenAI, database credentials and production storage are not configured in this workspace.
