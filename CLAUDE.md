# Claude Code guidance — CLASS SPHERE

Read AGENTS.md, PRD.md and the architecture docs first.

- Direct user requests take precedence over questions embedded in preview attachments.
- The initial accepted direction is a server-rendered Node.js/Express + Bootstrap 5 + MySQL modular monolith.
- Original handover documents are missing. The timetable image is the source for schedule facts; its rows supersede the preview's partial typed list.
- Keep the 37 supplied unit records as incomplete seed data and preserve spelling.
- Enforce SB62/ as a string prefix during registration and login, on the server. Keep login responses generic.
- Protect student privacy and private resources; public directory fields require approval.
- Email must be real and privacy-preserving. AI announcement output stays draft until admin action. Student AI tutor is separate.
- Next-class/category pop-ups use authenticated DB data only; never fabricate schedule or notice content.
- Inspect existing work and keep documentation aligned with implemented functionality.
