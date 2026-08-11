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


## 2. Resume name is sometimes a job title

Found 2026-08-11. `_extract_candidate_name` in `conversation_engine.py` takes the
first capitalised-looking line of the resume, so anything that is not contact
details becomes the name:

| resume starts with | it extracts |
|---|---|
| `Senior Software Engineer` | **Senior Software Engineer** |
| `Machine Learning Engineer` | **Machine Learning Engineer** |
| `B.Tech Computer Science` | **B.Tech Computer Science** |
| `Bangalore India` (no comma, so no digits to reject) | **Bangalore India** |
| `JOHN SMITH` | John Smith — correct |

The interviewer then calls the person "Senior" or "B.Tech" for all eight turns,
because `_name_directive` uses the first word. The fix is small: skip lines that
are job titles, degrees or places, and fall through to no name at all. The
function's own docstring already says a wrong name is worse than no name — it
just does not enforce it yet.


## 3. Dashboard page

Raised 2026-08-11, not yet specified. `frontend/src/app/dashboard/page.tsx`.

Needs one line from me about what is actually wrong — wrong numbers, something
missing, or a redesign. Nothing to act on until that is written down.


## 4. Head pose — not done  [was 12f]

Talked through, not closed. The write-up in `TODO_HISTORY.md` is marked FIXED;
that marker is not trustworthy, so treat none of it as confirmed until a live run
says otherwise.

The concrete leftover: ten synthetic scenarios were written and passed, but they
live in a throwaway script, so nothing stops the next edit reintroducing the bug.
This file has shipped broken twice already, and both times the cause was a sign
error or a "no opinion" value spelled the same as a real answer — the class of
bug that fails silently.

To pin them, `classifyPose` / `classifyGaze` / `fuseSensors` /
`poseMagnitudeDeg` need lifting out of the `SniperScope` component into a plain
module a test can import. They are pure functions with no React dependency; the
only thing making them uncoverable is where they sit. A node script under
`frontend/scripts/` matches the existing `check-initials.mjs` convention and
needs no new dependency.


## 5. Log text can contradict the risk tier  [was 12g]

The behavioural log line is chosen per frame from the current pose, while the
risk tier reflects accumulated history. So a clean frame can print "fully
engaged and attentive" while the tier sits at `WARNING_LOGGED` at 40%.

The specific case where a centred head was narrated as a tilt is already fixed.
What is left is the general guarantee. The fix is for the narration to
acknowledge the standing tier, not to restate the frame — the frame-level string
is arguably correct in isolation, which is why this survived.


## 6. Confirm the phone lag is actually gone  [was 12e]

Item 1's changes should fix the 3–5s delay on phone detection, but that has only
been reasoned about, never observed. Needs one live run: show a phone, count the
seconds, and check it is billed once rather than three times.

Do **not** re-raise `YOLO_CONF` or restore the 3-of-5 debounce if it still lags —
that was already ruled out as the cause once.


## 7. "Nothing leaves the device" wording  [was 9]

The old note here said speech-to-text was still browser-side, which no longer
looks true: there is no browser speech-recognition code in `frontend/src`, and
both `/practice` and `/sentry` POST their audio to the backend's local Whisper at
`/api/v1/voice/transcribe`.

If that holds up, the privacy claim is now true of the speech path too, and the
README's roadmap caveat about local Whisper should come out. Verify before
editing the claim — a privacy promise is the wrong thing to overstate.


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
