# CLASS SPHERE — HEIST
## Architecture

**Status:** The user asked to begin building after the recommendation. The initial modular monolith direction is accepted; deployment and external vendors remain open.

## Recommendation
Use a server-rendered modular monolith with Node.js LTS, Express, Bootstrap 5, modular CSS/JavaScript, and MySQL. Keep one deployable web application and relational database, separated internally into feature routes, services, repositories, and provider adapters. This matches the requested stack and keeps authorization and secrets on the server without the overhead of separately deployed frontend and API services. Consider separation only when measured load, mobile-app needs, or independent teams justify it.

## Current implementation
Implemented in the current working tree: six ordered MySQL migrations; Express 5 application with DB-backed sessions, CSRF, role-gated student/admin pages, public catalogue/timetable/news/events/directory/contact/gallery/resource routes, verified student authentication, persistent next-class and notification state, admin academics/timetable/content/email/contact management, student resource submissions with admin review, local-file site background uploads, manual no-SMTP account approval and Gmail BCC handoff, multiple event countdowns, authenticated general/direct/group chat with administrator-created membership-controlled rooms, year/semester-filtered catalogue navigation, dashboard bar and pie charts, conversation-scoped drag/swipe-to-reply chat, permission-gated gallery drafts, and server-side OpenAI adapters for student questions and admin announcement drafts. SMTP, OpenAI, MySQL and production file storage require local configuration; local MySQL and core public route smoke checks passed; optional SMTP and AI integrations remain unconfigured. The current interface uses a glassmorphism course-first landing page and luminous-blue V6 sign-in/dashboard styling.

## Request flow
Browser -> HTTPS/reverse proxy or managed TLS -> Express security/body/session/CSRF/rate-limit middleware -> validated route -> server auth and role authorization -> feature service -> parameterized repository -> MySQL. Services call private storage/email/AI adapters using server-side credentials. Verify provider webhooks. Private downloads go through authorization-checked handlers.

## Data
Implemented tables include academic years/semesters/units/lecturers/timetable, users and persisted sessions, verification and reset tokens, notifications/preferences, announcements/events, private resources/gallery metadata, AI drafts, email campaigns/recipients/unsubscribe tokens, audit logs, contact messages, per-class popup states, chat groups/memberships, private chat messages, and conversation-scoped reply references. Use InnoDB, utf8mb4, migrations, foreign keys, indexes and transactions. Admission numbers remain strings. Image-missing timetable fields are NULL.

## Security
Use server-managed sessions with a production store, not Express memory sessions. Use secure opaque cookie IDs, session rotation/expiry, modern adaptive password hashing, email verification, generic login failures, CSRF protection, rate limits, parameterized SQL, validation, output encoding, safe rich text, private bounded uploads, least-privilege credentials, redacted logs, audit events, HTTPS, encrypted backups and tested restore. Enforce SB62/ for registration and login on the server.

## Next-class and notices
Authenticated dashboard API returns only the current student's authorized timetable and notices. The pop-up shows current/next class and Academic, Timetable, Event or General updates; supports read/dismiss/snooze and quiet hours. Persist per-user state. Empty data stays an honest empty state. Never expose private notices publicly or fabricate schedule data.

## Integrations and operations
Use provider adapters for real email and AI. Email protects recipients, honors non-essential consent/unsubscribe, and records delivery evidence per recipient. AI generates drafts only; administrator approval is required before publishing or sending. Student Academic AI is a separate feature with its own privacy, spend and retention controls.
Current upload adapter uses bounded local private storage and random filenames; configure PRIVATE_STORAGE_DIR outside the public web root and use persistent encrypted storage in deployment. Select managed app hosting, MySQL and private object storage after confirming budget, region, traffic, availability and file volume. Plan secrets, backups, monitoring, export, restore and rollback. Remaining decisions: hosting/region/budget, providers, sender domain, storage policy, account recovery/admin provisioning, public directory fields, official class details, and whether to add Lecturer role.
