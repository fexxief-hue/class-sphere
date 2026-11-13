# CLASS SPHERE — HEIST | Architecture Essentials

- Accepted starting direction: server-rendered Node.js/Express modular monolith, Bootstrap 5/JavaScript, MySQL.
- MySQL is the source of truth. The 37 supplied units are incomplete seed data. The initial timetable migration contains 16 BSc Telecom & IT-Y3 entries transcribed from the image; unspecified details are NULL.
- Admission numbers stay strings. Enforce SB62/ at registration and login server-side.
- Initial roles are Student and Administrator. Lecturer is not approved yet.
- Secure sessions, modern password hashing, generic login errors, verified email or admin approval when SMTP is absent, role checks, CSRF/rate-limit protections, parameterized SQL and private validated uploads are required.
- Student directory fields need explicit approval for public display. Private records/resources require authorization.
- Next-class/category pop-up uses authenticated DB data, read/dismiss/snooze state and honest empty states.
- Email and AI use real server-side services. Preserve email privacy; AI content remains draft until admin review.
- Current code includes the secure student/admin portal, timetable and persisted pop-ups, administration/content tools, student file submissions with admin review, local background file selection, manual Gmail BCC email workflow, contact inbox, gallery workflow, and optional server-side AI endpoints. Local MySQL is configured. The current home page is course-first with essential visitor links, and sign-in/dashboards use luminous-blue glass styling.
- Open choices: hosting/region/budget, storage, email/AI vendors and policy, recovery/audit retention, directory publication, official class details and lecturer role.
