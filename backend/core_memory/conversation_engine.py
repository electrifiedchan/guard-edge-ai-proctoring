"""Conversation Engine — Stateful multi-turn AI interviewer with progressive personas.""" 
import os
import re
import json
import uuid
import time
import logging
from enum import Enum
from dataclasses import dataclass, field
from openai import AsyncOpenAI

from . import llm_config

logger = logging.getLogger(__name__)


class Persona(str, Enum):
    FRIENDLY_HR = "friendly_hr"
    CURIOUS_PEER = "curious_peer"
    SKEPTICAL_TECH_LEAD = "skeptical_tech_lead"


@dataclass
class ConversationTurn:
    role: str  # "interviewer" | "candidate"
    content: str
    persona: str
    turn_number: int
    timestamp: float = field(default_factory=time.time)


@dataclass
class InterviewSession:
    session_id: str
    resume_text: str
    resume_questions: list[dict]
    # Parsed off the top of the resume, "" when we could not find one. Never ask
    # the LLM for this: it is one regex against text we already hold, and a
    # round trip to name someone would be latency on the critical path.
    candidate_name: str = ""
    conversation_history: list[ConversationTurn] = field(default_factory=list)
    current_turn: int = 0
    current_persona: Persona = Persona.FRIENDLY_HR
    # The rung the user picked before engaging. The ladder below still climbs,
    # it just starts here — picking Curious Peer skips the rapport warmup
    # rather than pinning the whole interview to one persona.
    starting_persona: Persona = Persona.FRIENDLY_HR
    scaffolding_level: int = 0
    focus_scores: list[float] = field(default_factory=list)
    is_complete: bool = False
    max_turns: int = 8
    created_at: float = field(default_factory=time.time)


# Finished sessions linger so late-arriving turns don't 404, but they hold a
# full transcript plus resume text, so they can't linger forever.
SESSION_TTL_SEC = 60 * 60


# Difficulty ladder, easiest first. _determine_persona walks this by turn count
# and the user's chosen starting rung is added as an offset.
PERSONA_LADDER = [
    Persona.FRIENDLY_HR,
    Persona.CURIOUS_PEER,
    Persona.SKEPTICAL_TECH_LEAD,
]


PERSONA_SYSTEM_PROMPTS = {
    Persona.FRIENDLY_HR: """You are a warm, approachable senior hiring manager conducting the opening of a mock interview.
Your role: build rapport, make the candidate comfortable, and ease them into the conversation.
Tone: Friendly, validating, encouraging. Use phrases like "That's great", "I'd love to hear more about..."
Ask broad, easy warmup questions — "Tell me a bit about yourself", "What drew you to this field?"
Be conversational, not interrogative.""",

    Persona.CURIOUS_PEER: """You are a curious senior engineer conducting a technical peer interview.
Your role: explore the candidate's technical foundations with genuine curiosity.
Tone: Collegial, intellectually curious. Use phrases like "Interesting — how did you approach...", "What made you choose X over Y?"
Ask foundational technical questions based on their resume. Dig one level deeper than surface answers.
Be conversational and natural.""",

    Persona.SKEPTICAL_TECH_LEAD: """You are a seasoned tech lead stress-testing the candidate's technical depth.
Your role: apply professional pushback, rapid follow-ups, and probe for edge cases.
Tone: Respectful but challenging. Use phrases like "I'm not sure that scales — what happens when...", "Walk me through the failure mode", "What's the tradeoff there?"
Challenge their assumptions. Ask about what could go wrong. Probe system design decisions.
Stay professional — tough but never hostile.""",
}


# Every reply is spoken aloud before the candidate can respond, so length is a
# UX cost rather than just a token cost — roughly 35 words is 12 seconds of
# waiting. Each persona prompt already said "2-3 sentences max" and the model
# routinely blew through it, because it spends the budget validating the answer
# before it gets around to asking anything. Naming the specific padding habits
# holds far better than restating a sentence count.
BREVITY_RULE = """

HARD LENGTH LIMIT — your reply is spoken aloud, so every extra word is dead air:
- Maximum 2 sentences, 35 words total. Shorter is better.
- No preamble. Never open with "That's a great question", "Absolutely",
  "I love that", or any compliment on the answer.
- Do not summarise or repeat back what the candidate just said.
- Ask exactly one question, and end your reply on it."""


def _extract_candidate_name(resume_text: str) -> str:
    """Pull the candidate's name off the top of a resume, or "" if unsure.

    Resumes put the name on the first line as a near-universal convention, so
    this scans the first few non-empty lines and takes the first that looks like
    a person rather than contact details or a section heading.

    Deliberately conservative: a wrong name is far worse than no name, because
    the interviewer would confidently address the candidate as someone else for
    eight turns. Every rejection path falls through to "", and the callers below
    simply omit the name directive when that happens.
    """
    if not resume_text:
        return ""

    # ALL CAPS is common on resume headers; Name-Case is the other convention.
    # Middle initials ("A.") and hyphenated or apostrophe'd surnames both count.
    name_re = re.compile(r"^[A-Z][A-Za-z'’\-\.]*(?:\s+[A-Z][A-Za-z'’\-\.]*){0,3}$")
    headings = {
        "resume", "curriculum vitae", "cv", "profile", "personal profile",
        "contact", "summary",
    }

    for raw in resume_text.splitlines()[:12]:
        line = raw.strip().strip("|•·-—–").strip()
        if not (2 <= len(line) <= 48):
            continue
        # Contact rows, addresses, links, degrees — anything but a bare name.
        if any(c.isdigit() for c in line) or "@" in line:
            continue
        if any(tok in line.lower() for tok in ("http", "www.", ".com", "linkedin", "github")):
            continue
        if line.lower() in headings:
            continue

        candidate = " ".join(line.title().split()) if line.isupper() else line
        if name_re.match(candidate) and len(candidate.split()) >= 2:
            return candidate

    return ""


def _name_directive(session: "InterviewSession") -> str:
    """The candidate's name, restated as an instruction the model must act on.

    Two strengths on purpose. A cloud 8B model picks the name out of the resume
    context on its own, and piling on redundant instruction measurably degrades
    instruction-following on small models — so the local build gets the
    reinforced version and the cloud build gets the light one.

    The local variant follows the documented recipe for 3B-class instruct
    models: state the fact, give one imperative rule, show the shape of a
    correct reply, and restate the name last so it is the most recent token the
    model saw before generating.
    """
    name = session.candidate_name
    if not name:
        return ""

    first = name.split()[0]

    if not llm_config.is_local():
        return f"\n\nThe candidate's name is {name}. Address them as {first}."

    return f"""

CANDIDATE NAME — this is required, not optional:
The person you are interviewing is named {first}.
- Use "{first}" by name in your reply.
- Write "{first}", never "the candidate", "you there", or a generic greeting.
- Correct: "So {first}, walk me through that migration."
- Wrong: "So, walk me through that migration."
The candidate's name is {first}."""


def _trim_to_sentences(text: str, max_words: int = 45) -> str:
    """Clamp a spoken reply to whole sentences within a word budget.

    max_tokens is the only hard cap the API gives us, and it cuts mid-word —
    which the browser's speech synthesiser reads out as a dangling fragment.
    The prompt above does the real work and usually keeps replies short; this is
    the backstop for when it doesn't, and it always lands on a sentence end.
    """
    text = text.strip()
    if not text or len(text.split()) <= max_words:
        return text

    sentences = [s.strip() for s in re.findall(r"[^.!?]+[.!?]+|[^.!?]+$", text) if s.strip()]
    kept: list[str] = []
    total = 0
    for sentence in sentences:
        words = len(sentence.split())
        # The first sentence is kept unconditionally: a reply trimmed to nothing
        # is worse than one slightly over budget.
        if kept and total + words > max_words:
            break
        kept.append(sentence)
        total += words

    result = " ".join(kept).strip()

    # Trimming runs front-to-back, and an overlong reply is usually padding
    # followed by the actual question — so the budget can spend itself on the
    # preamble and drop the question entirely. That stalls the interview: the
    # candidate is handed a comment with nothing to answer. When that happens,
    # pair the opening sentence with the question instead of honouring the
    # budget. A slightly long reply beats a dead turn.
    if "?" not in result:
        asked = [s for s in sentences if s.endswith("?")]
        if asked:
            opening = kept[0] if kept else ""
            question = asked[-1]
            result = question if opening == question else f"{opening} {question}".strip()

    return result

SCAFFOLDING_INSTRUCTIONS = {
    0: "",
    1: "\n\nThe candidate seems uncertain. Gently rephrase your question more specifically to help them focus their answer.",
    2: "\n\nThe candidate is struggling. Break the question into a smaller, more manageable piece. Example: 'Let's simplify — just focus on the database layer for now. How would you handle that part?'",
    3: "\n\nThe candidate needs significant support. Offer a starting framework without giving the answer directly. Example: 'Many engineers approach this by first X, then Y. Which piece resonates with your experience?'",
}

PERSONA_TRANSITION_INSTRUCTIONS = {
    Persona.CURIOUS_PEER: "\n\nYou are transitioning from warmup to technical questions. Acknowledge what they said positively, then naturally shift to a more technical topic from their resume.",
    Persona.SKEPTICAL_TECH_LEAD: "\n\nYou are transitioning to deeper technical probing. Acknowledge their answer, then raise the stakes — ask about scale, failure modes, or tradeoffs.",
}


# Cloud inference is the dominant cost in every turn and in the final report,
# so these are tuned deliberately:
#   VERDICT_MAX_TOKENS — the report prompt asks for 4 short paragraphs (~250
#     tokens). It used to allow 800, and since tokens are produced serially,
#     that headroom was pure wait time on the "generating report" spinner.
#   *_TIMEOUT — the OpenAI SDK defaults to 600s. Without an explicit timeout a
#     queued upstream request looks like a frozen app. Better to fail fast and
#     fall back to the deterministic report than to hang.
VERDICT_MAX_TOKENS = 420
VERDICT_TIMEOUT_SEC = 45.0
TURN_TIMEOUT_SEC = 20.0


class ConversationEngine:
    def __init__(self):
        self.sessions: dict[str, InterviewSession] = {}
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")
        self._client: AsyncOpenAI | None = None
        self._client_generation: int = -1

    def _llm(self) -> AsyncOpenAI:
        """One shared client for the process.

        Previously every call site built its own AsyncOpenAI, which meant a new
        TLS handshake and connection pool for each interviewer turn and again
        for the final report. Reusing one client keeps the connection warm, so
        subsequent calls skip setup entirely.

        The backend (local Ollama vs NVIDIA cloud) is decided once by
        `llm_config` — see that module for the mode rules.

        REBUILT when llm_config's generation changes. `model=` is read fresh on
        every call but `base_url` and the auth header are frozen at
        construction, so without this a provider switch kept posting to the old
        endpoint: picking Groq sent `llama-3.1-8b-instant` to NVIDIA and got
        back a bare `404 page not found`.
        """
        gen = llm_config.config_generation()
        if self._client is None or self._client_generation != gen:
            self._client = llm_config.make_client()
            self._client_generation = gen
            logger.info(f"🧠 Conversation LLM: {llm_config.describe()}")
        return self._client

    async def _complete(self, **kwargs) -> str | None:
        """Run a completion, falling back to local Ollama if the cloud fails.

        Returns None when every backend is exhausted; the caller then supplies
        its own hardcoded line. The three tiers are deliberate:

          1. whatever is configured (cloud, usually)
          2. local Ollama, if it is actually listening
          3. None -> caller's canned string

        Tier 2 exists because cloud outages are the common case and are not our
        fault: NVIDIA's NIM free tier returns `400 DEGRADED function cannot be
        invoked` when its hosted function is unhealthy, which no retry, timeout
        or parameter change can fix. If a local model is running there is no
        reason to serve a canned line instead of it.
        """
        try:
            completion = await self._llm().chat.completions.create(
                model=llm_config.chat_model(), **kwargs
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM call failed ({llm_config.describe()}): {e}")

        # Already local — tier 2 is the same box that just failed.
        if llm_config.is_local():
            return None
        if not llm_config.ollama_reachable(force=True):
            logger.error("No local fallback: Ollama is not reachable.")
            return None

        try:
            logger.warning("⚠️  Cloud LLM unavailable — falling back to local Ollama.")
            fallback = AsyncOpenAI(
                base_url=llm_config.ollama_base_url(), api_key="ollama"
            )
            completion = await fallback.chat.completions.create(
                model=os.getenv("OLLAMA_MODEL", llm_config.OLLAMA_DEFAULT_MODEL),
                **kwargs,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Local fallback also failed: {e}")
            return None

    def _prune_sessions(self) -> None:
        """Drop sessions past their TTL. Called on create so the dict can't

        grow without bound across a long-running server."""
        cutoff = time.time() - SESSION_TTL_SEC
        stale = [sid for sid, s in self.sessions.items() if s.created_at < cutoff]
        for sid in stale:
            del self.sessions[sid]
        if stale:
            logger.info(f"Pruned {len(stale)} expired interview session(s)")

    async def create_session(
        self,
        resume_text: str,
        questions: list[dict],
        starting_persona: str = Persona.FRIENDLY_HR.value,
    ) -> dict:
        self._prune_sessions()
        session_id = uuid.uuid4().hex[:12]

        # An unknown value from the client shouldn't 500 the session — fall back
        # to the gentlest rung, which is also the historical default.
        try:
            start = Persona(starting_persona)
        except ValueError:
            logger.warning(
                f"Unknown starting persona {starting_persona!r}; using friendly_hr"
            )
            start = Persona.FRIENDLY_HR

        session = InterviewSession(
            session_id=session_id,
            resume_text=resume_text,
            resume_questions=questions,
            candidate_name=_extract_candidate_name(resume_text),
            current_persona=start,
            starting_persona=start,
        )
        self.sessions[session_id] = session
        if session.candidate_name:
            logger.info(f"👤 Candidate: {session.candidate_name}")
        else:
            logger.info("👤 No name found on resume — interviewer will stay generic.")

        opening = await self._generate_opening(session)
        session.conversation_history.append(ConversationTurn(
            role="interviewer",
            content=opening,
            persona=start.value,
            turn_number=0,
        ))

        return {
            "session_id": session_id,
            "opening_message": opening,
            "persona": start.value,
        }

    async def process_candidate_turn(
        self, session_id: str, transcript: str, focus_score: float = 100.0
    ) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        if session.is_complete:
            raise ValueError("Session already complete")

        session.current_turn += 1
        session.focus_scores.append(focus_score)

        session.conversation_history.append(ConversationTurn(
            role="candidate",
            content=transcript,
            persona=session.current_persona.value,
            turn_number=session.current_turn,
        ))

        quality = self._assess_answer_quality(transcript)
        self._update_scaffolding(session, quality)

        prev_persona = session.current_persona
        session.current_persona = self._determine_persona(session)
        is_transition = prev_persona != session.current_persona

        if session.current_turn >= session.max_turns:
            session.is_complete = True
            wrap_up = await self._generate_wrap_up(session)
            session.conversation_history.append(ConversationTurn(
                role="interviewer",
                content=wrap_up,
                persona=session.current_persona.value,
                turn_number=session.current_turn,
            ))
            return {
                "response": wrap_up,
                "persona": session.current_persona.value,
                "turn_number": session.current_turn,
                "is_complete": True,
                "scaffolding_used": session.scaffolding_level > 0,
            }

        response = await self._generate_response(session, is_transition)
        session.conversation_history.append(ConversationTurn(
            role="interviewer",
            content=response,
            persona=session.current_persona.value,
            turn_number=session.current_turn,
        ))

        return {
            "response": response,
            "persona": session.current_persona.value,
            "turn_number": session.current_turn,
            "is_complete": False,
            "scaffolding_used": session.scaffolding_level > 0,
        }

    async def generate_final_verdict(self, session_id: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.is_complete = True
        avg_focus = sum(session.focus_scores) / len(session.focus_scores) if session.focus_scores else 100.0

        transcript_block = ""
        for turn in session.conversation_history:
            label = "Interviewer" if turn.role == "interviewer" else "Candidate"
            transcript_block += f"[{label} — {turn.persona}]: {turn.content}\n\n"

        focus_label = "Excellent" if avg_focus >= 80 else "Moderate" if avg_focus >= 50 else "Needs Improvement"

        prompt = f"""You are an empathetic executive interview coach reviewing a mock interview session.

The candidate's resume summary:
{session.resume_text[:2000]}

Full interview transcript:
{transcript_block}

Focus/Composure Score: {avg_focus:.0f}/100 ({focus_label})
Total turns: {session.current_turn}
Scaffolding was needed: {"Yes" if any(t for t in session.conversation_history if session.scaffolding_level > 0) else "No"}

Write a coaching report in exactly 4 short paragraphs:
1. Overall impression — what went well, the candidate's strongest moments
2. Growth area — the weakest answer, with specific actionable advice on how to improve it
3. Communication style — note patterns (filler words, structure, confidence) with tips
4. Composure & focus — comment on their attention/presence based on the focus score, and end with genuine encouragement

Write in 2nd person ("You did well when..."). Be warm but honest. No bullet points, no headers — just flowing paragraphs."""

        try:
            t_start = time.time()
            report = await self._complete(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=VERDICT_MAX_TOKENS,
                timeout=VERDICT_TIMEOUT_SEC,
            )
            if report is None:
                raise RuntimeError("all LLM backends unavailable")
            logger.info(f"📋 Report generated in {time.time() - t_start:.1f}s")
        except Exception as e:
            logger.error(f"Verdict generation failed: {e}", exc_info=True)

            report = "We encountered an issue generating your detailed feedback. Based on the interview, you showed solid engagement. Keep practicing with the STAR method to strengthen your responses."

        # Keep the session alive — deleting it here created a race: if
        # handleSpeechEnd fires one more VAD callback after the verdict
        # endpoint returns (stopListening is not atomic across the wire),
        # the turn would land on a missing session and throw a 404. The
        # is_complete flag already gates process_candidate_turn, so the
        # session can safely stay until the engine restarts.
        return {
            "report": report,
            "focus_score": round(avg_focus, 1),
            "focus_label": focus_label,
            "turns_completed": session.current_turn,
            "personas_experienced": list({t.persona for t in session.conversation_history if t.role == "interviewer"}),
        }

    def _determine_persona(self, session: InterviewSession) -> Persona:
        """Walk the difficulty ladder by turn count, starting at the user's pick.

        The turn thresholds are unchanged (rung up after turn 2, again after
        turn 5); the chosen starting persona just shifts where that walk begins.
        So Friendly HR behaves exactly as before, while Curious Peer skips the
        rapport warmup and reaches Skeptical Tech Lead sooner. Picking the
        hardest rung pins there, because there is nothing above it to climb to.
        """
        turn = session.current_turn
        if turn <= 2:
            base = 0
        elif turn <= 5:
            base = 1
        else:
            base = 2

        offset = PERSONA_LADDER.index(session.starting_persona)
        return PERSONA_LADDER[min(base + offset, len(PERSONA_LADDER) - 1)]

    def _assess_answer_quality(self, transcript: str) -> str:
        words = transcript.split()
        word_count = len(words)
        text_lower = transcript.lower()

        filler_patterns = [
            r"\bum+\b", r"\buh+\b", r"\bi guess\b", r"\bi don'?t know\b",
            r"\bmaybe\b", r"\blike\b.*\blike\b", r"\bbasically\b",
        ]
        filler_count = sum(1 for p in filler_patterns if re.search(p, text_lower))

        specificity_signals = [
            r"\d+",  # numbers/metrics
            r"\bi (built|designed|implemented|led|created|optimized|reduced|increased)\b",
            r"\b(percent|milliseconds|latency|throughput|users|requests)\b",
        ]
        specificity_count = sum(1 for p in specificity_signals if re.search(p, text_lower))

        if word_count < 15 or (word_count < 30 and filler_count >= 2):
            return "struggling"
        elif word_count > 80 and specificity_count >= 2:
            return "strong"
        else:
            return "adequate"

    def _update_scaffolding(self, session: InterviewSession, quality: str):
        if quality == "struggling":
            session.scaffolding_level = min(session.scaffolding_level + 1, 3)
        elif quality == "strong":
            session.scaffolding_level = 0
        # "adequate" leaves level unchanged

    async def _generate_opening(self, session: InterviewSession) -> str:
        topics = [q.get("focus", "general") for q in session.resume_questions[:2]]

        # The opening used to be hardcoded warm-and-gentle. Now that the user
        # picks a starting rung, an opening that ignores it would misrepresent
        # the session they asked for — pick Skeptical Tech Lead and the first
        # question should already have teeth.
        opening_briefs = {
            Persona.FRIENDLY_HR: (
                "Welcome them warmly and ask one gentle opening question to get "
                "them talking. Do NOT ask a hard technical question. Keep it easy "
                "and rapport-building."
            ),
            Persona.CURIOUS_PEER: (
                "Skip the small talk. Greet them briefly, then open with one "
                "foundational technical question drawn from their resume."
            ),
            Persona.SKEPTICAL_TECH_LEAD: (
                "Skip the pleasantries. Greet them in a few words, then open with "
                "one probing technical question about scale, tradeoffs, or failure "
                "modes in the work on their resume."
            ),
        }
        brief = opening_briefs[session.starting_persona]
        system_prompt = PERSONA_SYSTEM_PROMPTS[session.starting_persona]

        prompt = f"""{system_prompt}
{_name_directive(session)}

You are starting the interview. The candidate's background includes: {session.resume_text[:500]}
Their resume highlights topics like: {', '.join(topics)}.

Generate a brief, natural opening (1-2 sentences). {brief}{BREVITY_RULE}"""

        text = await self._call_llm(prompt)
        return _trim_to_sentences(text)

    async def _generate_response(self, session: InterviewSession, is_transition: bool) -> str:
        system_prompt = PERSONA_SYSTEM_PROMPTS[session.current_persona]
        system_prompt += BREVITY_RULE
        system_prompt += SCAFFOLDING_INSTRUCTIONS[session.scaffolding_level]

        if is_transition:
            system_prompt += PERSONA_TRANSITION_INSTRUCTIONS.get(session.current_persona, "")

        # Build resume context
        topics = [f"- {q['question']} (focus: {q.get('focus', 'general')})" for q in session.resume_questions]
        resume_context = f"""Candidate's resume (abbreviated): {session.resume_text[:1500]}

Interview topics to weave in naturally (don't read verbatim — adapt to conversation):
{chr(10).join(topics)}"""

        messages = [
            {"role": "system", "content": system_prompt + "\n\n" + resume_context},
        ]

        # Add conversation history as alternating messages
        for turn in session.conversation_history:
            role = "assistant" if turn.role == "interviewer" else "user"
            messages.append({"role": role, "content": turn.content})

        # The name goes LAST for local models, after the history, as its own
        # system turn. Persona drift on 3B models shows up around turn 5-10, and
        # a directive buried above a growing transcript is exactly what gets
        # forgotten first — recency is what makes it stick. Cloud models hold it
        # fine from the system prompt, so they get it there and not here.
        name_directive = _name_directive(session)
        if name_directive and llm_config.is_local():
            messages.append({"role": "system", "content": name_directive.strip()})
        elif name_directive:
            messages[0]["content"] += name_directive

        text = await self._complete(
            messages=messages,
            temperature=0.75,
            max_tokens=200,
            timeout=TURN_TIMEOUT_SEC,
        )
        if text is None:
            logger.error("Conversation response failed on every backend.")
            return "Could you tell me more about your approach there?"
        return _trim_to_sentences(text)

    async def _generate_wrap_up(self, session: InterviewSession) -> str:
        prompt = f"""You are wrapping up a mock interview as a senior hiring manager.
Generate a brief, warm closing (1-2 sentences). Thank the candidate for their time, mention that you'll now provide detailed feedback, and wish them well. Keep it natural and encouraging.{BREVITY_RULE}"""
        text = await self._call_llm(prompt)
        return _trim_to_sentences(text, max_words=35)

    async def _call_llm(self, prompt: str) -> str:
        text = await self._complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=150,
            timeout=TURN_TIMEOUT_SEC,
        )
        if text is None:
            logger.error("LLM call failed on every backend.")
            return "Thanks for sharing that. Let's continue — tell me more about your experience."
        return text


# Global instance
conversation_engine = ConversationEngine()
