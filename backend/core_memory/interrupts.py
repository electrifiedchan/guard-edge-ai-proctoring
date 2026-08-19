"""Spoken interruptions for the two unambiguous findings.

Until now the system observed silently and reported afterwards. For a candidate
that is the worst of both worlds: the behaviour that cost them the session is
explained only once it is too late to stop doing it. A phone on the desk for
twenty minutes is twenty minutes of accumulating risk that one sentence at the
start would have prevented.

So two findings — and only two — speak up in the moment:

  MOBILE_DEVICE   a phone visible in frame
  MULTIPLE_FACES  a second person in frame

They qualify because they are unambiguous. Nothing else does. A downward glance
might be thinking; a head turn might be a noise off-camera; verbal activity is
usually the candidate answering the question they were asked. Interrupting
someone over a guess trains them to distrust the system, so those stay silent and
stay in the report.

WHAT THESE LINES ARE. Not warnings. A gentle reminder of what the behaviour costs
in a real interview, which is information the candidate can act on, delivered
while they can still act on it. The tone rule the rest of the coaching path
follows applies here too: 'moment', 'event', 'pattern' — never 'violation' or
'breach'. Several lines say "fairly or not" or "even when nothing's wrong",
deliberately: the point is how the behaviour READS to an interviewer, not an
accusation about what the candidate was actually doing. The system cannot know
the second, and should not pretend to.

WHY THERE ARE SEVERAL PER KIND. A fixed string repeated on the third sighting
stops being a reminder and starts being a machine reading a rule back at you. The
lines rotate per occurrence, so the same finding is put a different way each time
it recurs — which is also how a person would do it, since repeating yourself
word-for-word is itself a way of telling someone you have stopped paying
attention. Rotation is by occurrence index rather than at random, so a session is
reproducible and a test can assert which line comes second.

This module holds no database handle, does no I/O, and does not speak: it decides
WHETHER to interrupt and WHAT to say, and the caller delivers it. The audio is
deliberately the frontend's job — see the note on voice_engine in edge_main.
"""

import os
import time

# Floor between two interruptions of the SAME kind in one session.
#
# The caller already fires on a rising edge, so in normal operation this never
# engages. It is here for the abnormal case: the confirmation latch flickering
# (a phone at the edge of YOLO's confidence, appearing and vanishing across
# sweeps) would otherwise produce a barrage, and being talked at at every sweep
# is worse than not being told at all.
INTERRUPT_COOLDOWN_SEC = float(os.getenv("GUARD_INTERRUPT_COOLDOWN_SEC", "20.0"))

# Kinds that may interrupt. A kind absent from here is silent by construction,
# so widening the interruption surface is a deliberate edit rather than something
# that happens by accident when a new flag is added upstream.
LINES: dict[str, tuple[str, ...]] = {
    "MOBILE_DEVICE": (
        "There's a phone in frame. In a real interview that alone can end the "
        "conversation — set it aside and we'll carry on.",
        "I can see your phone. Even if you're not reading from it, an interviewer "
        "can't tell the difference. Put it down and let's continue.",
        "Your phone is still in shot. It reads as looking up answers, fairly or "
        "not, so it's worth keeping out of view for the rest of this.",
        "Phone's visible again. That's the kind of thing that costs an offer even "
        "when nothing's wrong — tuck it away and we'll keep going.",
        "Still seeing a phone on the desk. Let's move it out of frame properly, "
        "then give the question your full attention.",
    ),
    "MULTIPLE_FACES": (
        "There's someone else in frame. In a real interview that alone can end it "
        "— let's make sure you have the room to yourself.",
        "I can see another person with you. Even if they're just passing through, "
        "it looks like help. Best to be on your own for this.",
        "Second face in shot again. An interviewer can't tell a housemate from a "
        "prompter, so let's get the room clear before we continue.",
        "Someone else has come into view. That reads as coaching, fairly or not, "
        "so it's worth sorting out before we go further.",
        "More than one person on camera again. That's usually where an interview "
        "stops — let's make sure you're alone, then pick this back up.",
    ),
}


class InterruptDirector:
    """Decides when to speak up, and picks the words.

    Keyed by (session_id, kind), matching EpisodeTracker: a phone and a second
    person are two separate findings with two separate rotations, so being
    reminded about the phone does not consume the first-time wording for the
    faces.
    """

    def __init__(self, cooldown_sec: float = INTERRUPT_COOLDOWN_SEC):
        self.cooldown_sec = cooldown_sec
        # (session_id, kind) -> how many times we have spoken about it
        self._count: dict[tuple[str, str], int] = {}
        # (session_id, kind) -> monotonic-ish timestamp of the last one
        self._last_at: dict[tuple[str, str], float] = {}

    def consider(
        self, session_id: str, kind: str, t: float | None = None
    ) -> dict | None:
        """Return the interruption to deliver, or None to stay quiet.

        Call this ONLY on the rising edge of a confirmed finding — the point at
        which the risk engine commits to it. This method deliberately does not
        track whether the behaviour is still happening: that is the caller's
        confirmed/ongoing distinction to make, and duplicating it here would put
        two answers to the same question in two places.
        """
        if kind not in LINES:
            return None

        now = time.time() if t is None else t
        key = (session_id, kind)

        last = self._last_at.get(key)
        if last is not None and now - last < self.cooldown_sec:
            return None

        pool = LINES[kind]
        occurrence = self._count.get(key, 0)
        self._count[key] = occurrence + 1
        self._last_at[key] = now

        return {
            "kind": kind,
            # Cycles rather than clamping on the last line: a long session with
            # six sightings should not end up repeating the sixth wording
            # forever, and coming back around to the first is the least
            # surprising thing to do once the pool is exhausted.
            "say": pool[occurrence % len(pool)],
            # 1-based, so the frontend and the logs can say "3rd reminder"
            # without doing arithmetic on an index.
            "occurrence": occurrence + 1,
        }

    def forget_candidate(self, candidate_id: str) -> None:
        """Drop all rotation and cooldown state for one candidate's runs.

        Prefix sweep for the same reason EpisodeTracker needs one: frames are
        keyed "{candidate_id}__{rand}" while /reset-session arrives with a bare
        candidate_id. Missing this would leave a cooldown latched after the user
        cleared the session, so the first finding of the new run would be
        silently swallowed — and the rotation would resume mid-pool, telling a
        candidate on their first sighting that the phone is "visible again".
        """
        for store in (self._count, self._last_at):
            for key in [
                k for k in store
                if k[0] == candidate_id or k[0].startswith(f"{candidate_id}__")
            ]:
                store.pop(key, None)
