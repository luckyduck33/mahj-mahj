# Lucky Media Corp — Shared Operating Rules

## Before Starting Any Task
1. Confirm venture and repo match the task
2. Check the Code Queue filtered view on the Task Board — not semantic search
3. Search 3-5 keywords to check for duplicate tasks before creating new ones
4. Read the full task page content for spec (not just the title)

## Task Title Convention
Format: `{Assignee} — {Verb} {Object} ({Context})`

## Output Naming
- Content for publishing: `PUBLISH: {Venture} — {Title}`
- Data for another agent: `DATA HANDOFF: {Venture} — {Description} — for {Agent}`
- Items needing review: `REVIEW: {Venture} — {Item}`

## After Completing Any Task
1. Set Notion task Status = Done
2. Add completion note: `{YYYY-MM-DD HH:MM PT} — Completed by Code. {Summary}. Commit: {hash}.`
3. Log to Command Center: POST /api/log-output with X-Dashboard-Token header
4. If task creates work for another agent, create the handoff BEFORE marking Done
5. If Requires Human Review is checked, mark Done once deliverable is complete — Nidhi approval is separate

## If Blocked
- Leave Status = In progress
- Add note: `{YYYY-MM-DD HH:MM PT} — BLOCKED: {reason}. Needs: {what}. Next: {who}.`
- Log blocked status to Dashboard

## Source of Truth
- Task status: Notion Task Board filtered views
- Venture facts: ~/Desktop/CLAUDE/Operations/lucky-venture-registry.md
- Cross-agent workflow: ~/Desktop/CLAUDE/Operations/lucky-shared-protocol.md
- This repo's behavior: this CLAUDE.md

## Source-of-Truth Gate
See **Source-of-Truth Gate** in `~/Desktop/CLAUDE/Operations/lucky-shared-protocol.md`. All factual claims (numbers, prices, calculations, scores, dates, medical claims, business listings) require stated sources. Invented or estimated data presented as fact is a P0 bug regardless of feature priority.

## Timestamps
All outputs: YYYY-MM-DD HH:MM PT (Pacific Time)
