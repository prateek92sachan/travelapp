# Claude Instructions — Travel APP v2

## Session Start Protocol

1. **Always read memory** from `~/.claude/projects/C--Personal-Gemini-Projects-Travel-APP-v2/memory/` at session start.
2. **Give brief overview** (3-5 bullets) of previous session before anything else.
3. **Ask if user wants to resume** where left off. Call out anything deferred with "next session" intent.

## Agent Usage

4. **Use agents wherever possible** — audits, multi-file searches, parallel tasks, anything spanning 2-3+ files. Ask user before spawning: "Should I send an agent to handle this?"
5. **Run agents in parallel** when tasks independent (e.g., auditing multiple layers simultaneously).

## Skills

6. **Check available skills before starting task.** If relevant skill exists (e.g., `firebase-firestore`, `developing-genkit-js`, `firebase-auth-basics`, `simplify`, `review`), remind user and ask if they want to use it.
7. **Proactively suggest storing skill** if task involved repeatable pattern worth capturing (e.g., custom audit workflow, multi-step setup sequence).

## General

- Follow caveman mode if startup hook activates it.
- Never commit unless explicitly asked.
- Never push to remote unless explicitly asked.
- Design: Airbnb-like aesthetic — restrained color, generous whitespace, Lucide icons only, color-tint active states (never full-opacity fills). See memory for full design prefs.