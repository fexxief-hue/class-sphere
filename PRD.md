# CLASS SPHERE — HEIST
## Product Requirements Document

**Institution:** Pwani University  
**Status:** Consolidated implementation draft. The user asked to begin building after the architecture recommendation; the modular Express/MySQL direction was the initial implementation; the user later chose a free Aiven PostgreSQL plan, so the application now has a PostgreSQL adapter and a one-time schema initializer; live Aiven connectivity remains to be verified. External providers and deployment remain undecided.

## Source and decision hierarchy

- **Direct user requests:** Recommend an architecture; add a pop-up for the next class and categorized information; begin building; distinguish source-document instructions from the user's own requests.
- **Master project execution instruction:** Normative product, security, privacy, and staged-delivery requirements, including the SB62/ restriction for both registration and login.
- **Complete Website Preview in Text attachment:** UX detail and supporting requirements. Any questions or statements in that preview marked as proposed or awaiting confirmation remain open decisions; they are not treated as new user answers.
- **Timetable image:** Primary factual source for schedule rows. Where the image differs from the preview's typed partial transcription, preserve the image's spelling, rows, and missing fields.
- **Original project handovers:** The two handover documents referenced by the master instruction have not been supplied. Reconcile them when received.

## Product purpose

A secure, responsive class portal that supports genuine class communication and academic workflows. It must be a functioning application backed by a database, not only a static website. Do not invent institutional facts, class leadership, contacts, statistics, testimonials, course data, venues, or integration results.

## Users and access

- **Visitor:** Browse approved public material and the academic catalogue, contact the class through a functioning form, and access account entry points.
- **Student:** Access own account, timetable, units, resources, announcements, events, notifications and student AI tutor. May edit permitted profile and notification settings.
- **Administrator:** Manage students, academics, timetable, resources, announcements, events, gallery, email, settings and admin AI announcement drafts.
- **Lecturer role:** Not currently specified as a role by the master brief. Start with Student and Administrator permissions. Add Lecturer only after a direct decision defines its access.
- Every privileged operation and private record access is authorized on the server.

## Pages and navigation

Public pages: Home, About, Students/Directory, Academics and unit details, AI Academic Assistant information/entry, News and Events, Gallery, Contact, Login, Registration, Privacy Policy, Terms and Conditions, and custom 404.

Authenticated Student Dashboard includes Overview, Profile, Timetable, Academics, Resources, Announcements, Events, AI Assistant, Notifications, Settings and Logout.

Authenticated Administrator Dashboard includes Overview, Students, Academics, Timetable, Announcements, AI Announcement Assistant, Email Centre, Events, Gallery, Resources and Settings.

## Visual and accessibility requirements

Use emerald #10B981, forest green #064E3B, light neutral and coordinated dark surfaces. Aim for premium glass details, elegant readable type, clean spacing, restrained transitions, professional icons, suitable imagery, a consistent navigation/footer, and responsive desktop/tablet/mobile layouts. The class timetable should guide people through year, semester and day selection; unit catalogues should show one selected semester and paginate longer lists. Use the supplied course crest and landscape artwork for site branding and the home hero. Provide an accessible compact mobile menu, visible focus, semantic controls, keyboard support, adequate contrast, reduced-motion support and no unwanted horizontal scrolling. Light/dark mode is appropriate. Do not use decoration at the expense of clarity.

## Registration, login, accounts

Registration fields: full name, admission number, email, password and confirmation. If SMTP is unavailable, allow sign-up into an administrator-approval queue; mark the account as admin-approved rather than email-verified. Admission numbers are strings and only those beginning exactly SB62/ are allowed. Validate in the browser and again on the server. The prefix rule applies at registration and login. Passing the prefix check does not imply an account exists. Login errors must not reveal account existence. Hash passwords with a maintained modern password-hashing algorithm. Use server-managed sessions, rate limits and secure recovery. Verify email before important account communications. Students may update only permitted profile fields. Admin accounts are provisioned through a controlled process, never public self-registration.

## Student directory and privacy

Provide search by name and admission number, profile cards, filtering/sorting and optional profile images only for information an administrator has explicitly approved for public display. Admission numbers, email addresses and private profile fields are not public. Profile publication must be opt-in or otherwise approved under the class privacy policy. Admins control publication. Do not seed fictitious students.

## Academics

Academics live in MySQL, not hardcoded static HTML. The catalogue is browsed by selecting an academic year and then a semester; only the selected semester's units are shown at a time. Admins can add academic years, semesters, units, descriptions, lecturers and resources. The dashboard presents a dedicated pending-registration approval queue with an explicit approve-and-activate action. The 37 records supplied in the master instruction are initial and explicitly incomplete. Preserve supplied spelling until an authorized correction is provided. Future Year 3 Semester 2 and Year 4 semesters may be created without inventing unit contents.

### Supplied catalogue

**Year 1 Semester 1:** SCS B101 — Fundamentals of Computing; SCS B102 — Introduction to Programming; SMA B104 — Calculus I; SPH B101 — Mechanics I; STT B101 — Introduction to Telecommunication Systems; STT B102 — Computer Systems and Architecture; STT B107 — Analogue Electronics I; STT B109 — Workshop Technology Practice 1.

**Year 1 Semester 2:** SCS B110 — Web Development Technologies; SPH B102 — Electricity and Magnetism I; SPH B103 — Waves and Geometrical Optics; STT B103 — Data Communication and Applications; STT B106 — Mathematics for Engineers I; STT B108 — Electrical Engineering Drawing; STT B110 — Workshop Practise II; UCC B104 — Entreprenureship Skills.

**Year 2 Semester 1:** SCS B202 — Object Oriented Analysis and Design; SCS B204 — Object Oriented Programming; SMA B201 — Calculus II; SMA B203 — Linear Algebra I; SPH B201 — Mechanics II; SPH B204 — Thermal Physics I; STT B202 — Mathematics for Engineers II; STT B204 — Workshop Technology Practise III.

**Year 2 Semester 2:** SCS B205 — Operating Systems; SCS B206 — Network Design and Implementation; SMA B204 — Linear Algebra II; SPH B202 — Electricity and Magnetism II; SPH B209 — Structure and Properties of Matter; STT B203 — Analogue Electronics II; STT B205 — Workshop Technology Practice IV.

**Year 3 Semester 1:** SCS B301 — Computer Networks; SCS B307 — Database Systems; SPH B301 — Wave Theory and Physical Optics; STT B304 — Telecommunications and Information Technology Labs I; STT B306 — Digital Electronics and Logics; STT B311 — Signal and Systems.

The lists total 37. The initial database migration adds these records without claiming the catalogue is complete.

## Timetable

Initial scope is BSc Telecom & IT-Y3, Year 3 Semester 1 only. Import only rows whose timetable cell identifies BSc Telecom & IT-Y3. Do not assign another program's class. Store day, start/end, unit, lecturer, venue and practical/theory classification when known. Preserve unavailable values as NULL/unspecified.

The image explicitly shows the following 16 entries. Program names in shared cells are mixed, but each listed cell includes BSc Telecom & IT-Y3. Time ranges are separate adjacent blocks when the image has separate columns.

| Day | Time | Unit | Lecturer as shown | Venue as shown | Type |
|---|---|---|---|---|---|
| Monday | 7–9 am | SPH B301 — Wave Theory and Physical Optics | Prof. Gabriel Katana | LTN | Unspecified |
| Monday | 9–11 am | SCS B301 — Computer Networks | Mr. Amran Hassan | LTN | Unspecified |
| Monday | 11 am–1 pm | SCS B307 — Database Systems | Ms. Limo | SBN 004 | Unspecified |
| Monday | 1–3 pm | SCS B307 — Database Systems | Ms. Limo | SBN 004 | Unspecified |
| Monday | 3–5 pm | SCS B301 — Computer Networks | Mr. Amran Hassan | Unspecified | Unspecified |
| Tuesday | 7–9 am | STT B306 — Digital Electronics and Logics | Mr. Samson Ongere | SHSS-002 | Unspecified |
| Tuesday | 11 am–1 pm | STT B306 — Digital Electronics and Logics | Mr. Samson Ongere | SHSS-002 | Unspecified |
| Tuesday | 1–3 pm | SCS B307 — Database Systems | Ms. Limo | SBN 004 | Unspecified |
| Wednesday | 11 am–1 pm | STT B304 — Telecommunications and Information Technology Labs I | Dr. Steven Awino | H4 | Unspecified |
| Wednesday | 1–3 pm | STT B311 — Signal and Systems | Mr. Samson Ongere | Unspecified | Unspecified |
| Thursday | 7–9 am | SPH B301 — Wave Theory and Physical Optics | Prof. Gabriel Katana | Unspecified | Unspecified |
| Thursday | 9–11 am | SCS B307 — Database Systems | Ms. Limo | Unspecified | Practical |
| Thursday | 11 am–1 pm | STT B304 — Telecommunications and Information Technology Labs I | Dr. Steven Awino | H4 | Unspecified |
| Thursday | 1–3 pm | STT B311 — Signal and Systems | Mr. Samson Ongere | Unspecified | Unspecified |
| Thursday | 3–5 pm | STT B304 — Telecommunications and Information Technology Labs I | Dr. Steven Awino | Unspecified | Practical |
| Friday | 9–11 am | STT B311 — Signal and Systems | Mr. Samson Ongere | GS1 | Unspecified |

The image footer reads: “Timetable generated with FET 7.7.4 on 11/9/26 1:40 PM.” The preview's typed timetable list is partial and has spelling/venue discrepancies; the image takes precedence. The migration preserves image spelling “Amran” and does not fill missing venues.

Student timetable supports weekly and mobile-friendly daily views; current, upcoming and completed states; admin edits; and timetable change notifications.

## Next-class pop-up and notifications

On the authenticated student dashboard, provide a low-interruption accessible pop-up for the next/current class and important new class information. Display unit, start/end, venue and lecturer only when supplied. The notification may be dismissed or snoozed, respects quiet hours and reduced motion, and should not reappear repeatedly after dismissal. Provide a notification centre for later review.

Categorize updates such as Academic, Timetable, Event and General; support unread/read state and relevant student preferences. Show only records authorized for that student. With no schedule or notice available, show an honest empty state rather than sample/fabricated content.

## Academic resources

Organize by academic year, semester, unit and type: lecture notes, past papers, assignments, practical materials and other learning resources. Students and admins may submit/upload notes, CATs, past papers, assignments, practical materials and other resources. Student uploads remain pending until admin approval. Store files privately; validate type, size and content; check authorization for every download. Define retention and allowed file sizes/types before production.

## Student AI Academic Assistant

This is separate from the administrator announcement writer. Students may ask about programming, networking, mathematics, electronics, revision, uploaded notes and past papers; supported features may include explanations, note summaries and practice-question generation. Integrate a genuine AI API server-side. Clearly state setup is required when no provider is configured. Protect student data; establish provider, usage limits and retention policy. AI output is assistance, not official university advice.

## News, announcements and events

Admins create, edit, draft, publish and archive approved announcements. Categories include academic notices, class meetings, examinations, assignments, events and general updates. Published posts have title, body, date, category and author role/name according to privacy policy. Only real administrator-entered approved items appear publicly. Students may receive in-platform notices. Events are database-backed and support calendar/list views where practical.

## Admin AI Announcement Assistant

Use a genuine server-side AI API to generate announcement title/body and optional formal, funny and short WhatsApp versions from admin instructions. Admin can regenerate, edit, copy, preview, save draft, publish, or route reviewed content to Email Centre. AI output never publishes or emails automatically; explicit human review/action is required. Show an honest configuration state when unavailable.

## Email Centre

Admins can view eligible students, verification/approval status and email addresses; select individual/multiple/all eligible recipients; deselect; search/filter; see selected count; compose subject and body; preview; and either send using configured SMTP or open Gmail with selected addresses in BCC for manual review/send. SMTP remains optional. Use individual delivery or privacy-safe bulk provider mode; recipients never see each other's addresses. Handle consent/unsubscribe for non-essential bulk messages and sending limits. Use real provider/SMTP, server-side credentials and administrative audit logs. Never claim delivery absent provider evidence.

## Class chat

Provide three authenticated chat modes: one general class room, individual direct conversations, and administrator-created group rooms such as Group A and Group B. Administrators choose active approved students when creating a group. Only group members can read or post in that group; direct messages are visible only to their two participants. Messages are plain text, rate-limited, and loaded from the database.

## Gallery and contact

Gallery supports approved photographs, responsive grid, categories/albums, carousel/lightbox and admin upload. Require appropriate permission for publication and use private originals or controlled public derivatives.

Contact page includes actual backend-processed form with clear success/error feedback. Contact details, telephone, social links and university map are added only when supplied/confirmed. Protect form from abuse and limit retention.

## Legal, admin, and audit

Privacy Policy and Terms must describe actual implementation and be reviewed before publication. Admin dashboard overview uses genuine database values only. Dashboard graphs and pie charts use stored account, timetable, and activity records, with honest empty states. Record sensitive admin actions in audit logs without writing passwords, tokens or unnecessary message contents. Server-side authorization protects every operation.

## Security and operations

- Server-side authentication, role checks and account lifecycle.
- Modern password hashing; secure server-managed sessions; session rotation and expiry.
- Parameterized SQL, validation, output encoding/sanitization and CSRF protection.
- Rate limits for login, registration, recovery, contact and email sends.
- Secure cookies, HTTPS, security headers and safe production errors.
- Private, bounded and validated uploads.
- Secrets only in server environment/secret storage, never browser bundles.
- Minimize personal data, control public directory fields, and restrict recipient access.
- Backups, tested restore procedure, monitoring, deployment/rollback instructions.
- Review applicable institutional and legal privacy requirements before public launch.

## Architecture and current implementation

Accepted initial direction: modular monolith with Node.js/Express, HTML/CSS/Bootstrap 5/JavaScript, MySQL, server-managed sessions and modular services/routes/repositories. Use private object storage for uploads and provider adapters for email/AI. Choose hosting, region and vendors after budget, traffic, data residency, file volume and operational needs are confirmed. The codebase now has a working local Express/MySQL portal, glassmorphism welcome page, responsive dashboards, role-based login, course filters, timetable, notifications, admin content tools, private resource uploads, and optional email/AI integrations. The landing page follows the latest user direction: course identity, account entry points, and a small set of essential visitor links. Login and dashboard styling now use a luminous-blue V6 visual system.

## Remaining decisions

- Hosting provider/region, budget, expected active/concurrent users and availability goal.
- Email provider/sender domain and consent/unsubscribe policy.
- AI provider, spend controls and retention.
- Private storage provider/file size/types and retention.
- Student directory publication and account recovery policy.
- Admin provisioning and audit retention.
- Whether a Lecturer role is needed.
- Official mission/vision, class description, leadership and contact details.
