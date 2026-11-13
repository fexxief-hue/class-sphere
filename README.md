# CLASS SPHERE — HEIST

A modular monolith for the Pwani University class portal using Node.js/Express, PostgreSQL, Bootstrap 5 and browser JavaScript.

## Current implementation
The working tree includes the responsive public website, image-transcribed BSc Telecom & IT-Y3 timetable, student registration with email-verification or manual admin-approval flow, admin provisioning, role-gated dashboards, persistent class reminders/notices, content and academic administration, contact inbox, private resource uploads/downloads, permission-confirmed gallery publication, individualized email campaigns with unsubscribe, dark/light themes, glassmorphism navigation and dashboards, weekly/admin activity charts, year/semester unit filters, student uploads held for review, administrator-controlled background file upload, a dedicated student approval queue, supplied course crest and home landscape assets, step-by-step timetable browsing, paginated year/semester unit lists, drag/swipe-to-reply chat messages, and curved icon sidebars. The homepage displays its landscape separately from the welcome copy, and the supplied landscape is also used as the luminous-blue login backdrop. Admin events can be saved as drafts or saved and published; publishing creates notices for eligible classmates. CAT/exam and next-class countdowns are supported. When SMTP is absent, admins can open Gmail with selected students in BCC for manual sending. Optional OpenAI study/announcement assistants remain disabled. External services and database credentials are not included.

## Windows setup
1. Install Node.js 22+ and create an Aiven PostgreSQL service or local PostgreSQL server.
2. Create an empty PostgreSQL database named `class_sphere` (or use Aiven’s default database).
3. Copy `.env.example` to `.env` and enter PostgreSQL credentials plus the Aiven CA certificate in `DATABASE_SSL_CA`. Keep `.env` private and untracked.
4. Run `npm ci`, then `npm run migrate:postgres` to create the PostgreSQL schema and seed the supplied course and timetable data.
5. Configure SMTP and `APP_BASE_URL` for automatic email verification, password reset and email campaigns. Without SMTP, students can register and await administrator approval; admins can open Gmail drafts with selected recipients in BCC and send manually. Set `PRIVATE_STORAGE_DIR` to a persistent private path. Set `OPENAI_API_KEY` and `OPENAI_MODEL` only if enabling AI.
6. Create the first administrator with `npm run create-admin`.
7. Run `npm run dev` and open http://localhost:3000. `/api/health` reports database connectivity.

`database/postgresql.sql` creates the portal schema and seeds 37 units and 16 timetable entries transcribed from the supplied image. The startup migration is idempotent and does not seed fake students or announcements. Aiven Free PostgreSQL has 1 GB storage and may power off when unused; Render Free services sleep and have ephemeral file storage. Uploaded files need external object storage or a paid persistent disk.

Production requires managed secrets, HTTPS, least-privilege DB access, private persistent file storage, encrypted backups and a tested restore. SMTP, OpenAI, database credentials and production storage are not configured in this workspace.
