# TODO

Open items only. Rewritten 2026-08-11.

The finished items and their write-ups moved to `TODO_HISTORY.md`, kept verbatim
rather than summarised — the reasoning is the point, and several of them record a
wrong guess next to the fix that followed. `git log -p TODO.md` is the other copy.

Old numbers are kept in brackets where they exist, so commit messages and code
comments still line up.

---

## 1. Commit the work sitting in the working tree

7 files, ~400 lines, none of it committed. Checked on 2026-08-11: `tsc --noEmit`
is clean and all 6 backend suites pass.

- `backend/edge_main.py` — faster prop sweep. It gets its own single thread and
  its own YOLO instance (sharing one instance across threads is a race
  Ultralytics warns about). `YOLO_CONF` dropped 0.65 → 0.35, because an angled
  phone scores 0.35–0.55 and was being thrown away — a recall miss that looked
  like lag. Plus a 3-clean-sweep latch so one phone is not billed as three
  incidents. **Also fixes a real crash**: `bea_engine.get_status(...)` does not
  exist, only `get_state(...)`, so the already-flagged-prop path would have
  thrown.
- `backend/core_memory/conversation_engine.py` — interviewer addresses the
  candidate by name, and falls back to local Ollama when the cloud LLM fails
  instead of serving a canned line.
- `backend/core_memory/llm_config.py` — switching provider now rebuilds the
  client. Without it, picking Groq sent Groq's model name to NVIDIA's URL and
  got a bare 404.
- `backend/core_memory/voice_engine.py` — retries transcription unfiltered when
  the silence filter classifies the whole clip as silence. That used to return
  an empty transcript, indistinguishable from a candidate who said nothing.
- `frontend/src/hooks/useVAD.ts` — releases the mic only after the recorder
  flushes its last chunk. Cutting it earlier produced a broken WebM, which was
  the intermittent 500 on `/voice/transcribe`.
- `frontend/src/components/SniperScope.tsx` — separate up/down pitch thresholds
  (8° up, 13° down). Up reads short because the chin is the landmark that moves
  most and is occluded soonest.
- `frontend/src/components/dashboard/SessionList.tsx` — shows the last 6
  characters of the session id.

Worth knowing: none of the 6 passing suites actually cover any of the new code
above. Green tests here mean "nothing old broke", not "the new work is right".


## 3. Dashboard page

Raised 2026-08-11, not yet specified. `frontend/src/app/dashboard/page.tsx`.

Needs one line from me about what is actually wrong — wrong numbers, something
missing, or a redesign. Nothing to act on until that is written down.


## 5. Log text can contradict the risk tier  [was 12g]

Fixed in code 2026-08-12, pending confirmation from a live session.

The behavioural log line was chosen per frame from the current pose, while the
risk tier reflects accumulated history. So a clean frame printed "fully engaged
and attentive" while the tier sat at `HARD_WARNING` — and because `autopsy_flag`
fires at risk >=75%, that pairing was also stamped onto a saved evidence photo,
which then read as proof of nothing.

`build_moment_caption` in `backend/edge_main.py` now decides the caption from the
reason the flag fired. When the frame itself is the cause (critical, or gaze
off-centre) the frame string is kept verbatim; when the frame is clean but the
tier is standing, the caption names the tier and says the frame was clean.

Found while fixing it: `_classify_moment_caption` keyed PROHIBITED_ITEM on the
words 'book' and 'laptop', but both writers emit "Prohibited item detected on
desk." — neither word survives into the caption, so every book/second-laptop
sighting classified as None and that bucket was unreachable. The frontend has
had copy waiting for it in `violation-templates.ts` the whole time. Now matched
on the phrase, with the raw-label spellings kept for older rows.

Still open: existing `moments` rows keep their old captions — this changes what
gets written, not what is already in SQLite. Decide whether that is worth a
backfill or whether it ages out.

Covered by 7 new cases in `backend/test_verdict_narration.py` (13 total, all
passing), including a guard that phone captions still classify as MOBILE_DEVICE
and that tier captions are never misfiled as an object violation.


---

## Add yours below




---

### Note on running the local checks

`npx tsc` resolves to a decoy package on this machine, and the shell's working
directory does not persist between commands — so use absolute paths:

```
node "<repo>\frontend\node_modules\typescript\bin\tsc" --noEmit -p "<repo>\frontend\tsconfig.json"
node "<repo>\frontend\scripts\check-initials.mjs"
```

Backend suites: `backend\run_tests.bat` must be launched from inside `backend\`,
or call the venv python per file — `venv\Scripts\python.exe test_brevity.py`.

`startapp.bat` must be launched from the repo root as `.\startapp.bat`, not by
bare name.
