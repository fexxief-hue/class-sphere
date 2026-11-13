# Agent instructions — CLASS SPHERE

Read PRD.md, ARCHITECTURE.md and ARCHITECTURE-ESSENTIALS.md before changing behavior.

## Source hierarchy
- Follow direct user requests over tentative options/questions inside attachments.
- The master project instruction defines normative requirements; the Complete Website Preview adds UX detail. Its explicitly proposed or unanswered options remain open.
- The timetable image is the factual source. Its transcription takes precedence over the preview's partial typed table.
- The two original handover documents referenced by the brief are missing. Do not invent their contents.
- Preserve supplied course names/spelling. The 37 unit records are incomplete.

## Engineering rules
- Accepted initial architecture is Node.js/Express modular monolith + Bootstrap 5 + MySQL.
- Keep admission numbers as strings and enforce SB62/ at registration and login on the server.
- Protect private reads and privileged writes server-side. Current roles: Student and Administrator; do not add Lecturer without approval.
- Use parameterized SQL, maintained password hashing, secure server sessions, CSRF/rate limits, output encoding and private validated uploads.
- Keep credentials server-side. Never log secrets or unnecessary student data.
- Email/AI must be real integrations; protect recipients; AI content requires explicit admin review.
- Do not invent students, metrics, timetable details, official facts or integration success.
- Pop-ups use authenticated database-backed schedule/notices only, with honest empty states.
- Inspect before editing; update docs to match code. Do not claim features are implemented or verified when they are not.
