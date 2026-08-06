# TODO

Open items from the 2026-08-06 review session. Items 1, 1b, 2 and 8 are done and
pushed (commit `e47d735`); what follows is what remains.

---

## 3. Stop the interviewer's voice on Disengage / End Session

Clicking **Disengage** in SniperScope cancels speech, but audio can still resume
a moment later.

`handleDisengage` (`frontend/src/app/sentry/page.tsx`) calls
`speechSynthesis.cancel()` and `stopListening()`, but unlike `endSession` it
never sets `sessionEndingRef.current = true`. A turn already in flight therefore
resolves *after* the cancel and calls `speakText` again on the dead session.

Fix: set the ending flag in `handleDisengage` too, and have `speakText` return
early when it is set. Clear the flag when a new session starts so
Disengage → Engage still works.

## 4. Persona choice belongs before engaging

Move the persona buttons (Friendly HR / Curious Peer / …) into SniperScope as a
pre-engage choice, and make the selection actually reach the backend. Today
`currentPersona` is only ever *read from* the server response, so the badge
reflects the backend's pick and the user has no say. Requires passing the chosen
persona on session start.

## 5. Back button on the verdict image view

No way out of the full-frame view in
`frontend/src/components/verdict/FrameReview.tsx`.

## 6. Refresh should land on the landing page

Confirm the intended behaviour first — a hard refresh mid-interview currently
restores a half-built session state.

## 7. Per-resume memory

Drop the seeded dummy data and key memory by resume identity (content hash, with
the name as a label) so two different resumes never share a history.
`frontend/src/lib/resumeMemory.ts` already hashes resumes — build on that rather
than adding a second scheme.

## 9. Local LLM (Ollama) wiring

Set up and wire the local model path end to end.

## 10. Shorten the interviewer's speech

Both the opening message and per-turn replies run long. Tighten the prompt in
`backend/core_memory/conversation_engine.py`.

## 11. Escalation rules

Escalate on phone-in-frame, and on a third distraction event within a session.

---

### Note on running the local checks

`npx tsc` resolves to a decoy package on this machine, and the shell's working
directory does not persist between commands — so use absolute paths:

```
node "<repo>\frontend\node_modules\typescript\bin\tsc" --noEmit -p "<repo>\frontend\tsconfig.json"
node "<repo>\frontend\scripts\check-initials.mjs"
```

`startapp.bat` must be launched from the repo root as `.\startapp.bat`, not by
bare name.
