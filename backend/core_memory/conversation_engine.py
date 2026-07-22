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
    conversation_history: list[ConversationTurn] = field(default_factory=list)
    current_turn: int = 0
    current_persona: Persona = Persona.FRIENDLY_HR
    scaffolding_level: int = 0
    focus_scores: list[float] = field(default_factory=list)
    is_complete: bool = False
    max_turns: int = 8


PERSONA_SYSTEM_PROMPTS = {
    Persona.FRIENDLY_HR: """You are a warm, approachable senior hiring manager conducting the opening of a mock interview.
Your role: build rapport, make the candidate comfortable, and ease them into the conversation.
Tone: Friendly, validating, encouraging. Use phrases like "That's great", "I'd love to hear more about..."
Ask broad, easy warmup questions — "Tell me a bit about yourself", "What drew you to this field?"
Keep responses to 2-3 sentences max. Be conversational, not interrogative.""",

    Persona.CURIOUS_PEER: """You are a curious senior engineer conducting a technical peer interview.
Your role: explore the candidate's technical foundations with genuine curiosity.
Tone: Collegial, intellectually curious. Use phrases like "Interesting — how did you approach...", "What made you choose X over Y?"
Ask foundational technical questions based on their resume. Dig one level deeper than surface answers.
Keep responses to 2-3 sentences max. Be conversational and natural.""",

    Persona.SKEPTICAL_TECH_LEAD: """You are a seasoned tech lead stress-testing the candidate's technical depth.
Your role: apply professional pushback, rapid follow-ups, and probe for edge cases.
Tone: Respectful but challenging. Use phrases like "I'm not sure that scales — what happens when...", "Walk me through the failure mode", "What's the tradeoff there?"
Challenge their assumptions. Ask about what could go wrong. Probe system design decisions.
Keep responses to 2-3 sentences max. Stay professional — tough but never hostile.""",
}

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


class ConversationEngine:
    def __init__(self):
        self.sessions: dict[str, InterviewSession] = {}
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")

    async def create_session(self, resume_text: str, questions: list[dict]) -> dict:
        session_id = uuid.uuid4().hex[:12]
        session = InterviewSession(
            session_id=session_id,
            resume_text=resume_text,
            resume_questions=questions,
        )
        self.sessions[session_id] = session

        opening = await self._generate_opening(session)
        session.conversation_history.append(ConversationTurn(
            role="interviewer",
            content=opening,
            persona=Persona.FRIENDLY_HR.value,
            turn_number=0,
        ))

        return {
            "session_id": session_id,
            "opening_message": opening,
            "persona": Persona.FRIENDLY_HR.value,
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
            client = AsyncOpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.nvidia_api_key,
            )
            completion = await client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=800,
            )
            report = completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Verdict generation failed: {e}", exc_info=True)
            report = "We encountered an issue generating your detailed feedback. Based on the interview, you showed solid engagement. Keep practicing with the STAR method to strengthen your responses."

        # Clean up session
        del self.sessions[session_id]

        return {
            "report": report,
            "focus_score": round(avg_focus, 1),
            "focus_label": focus_label,
            "turns_completed": session.current_turn,
            "personas_experienced": list({t.persona for t in session.conversation_history if t.role == "interviewer"}),
        }

    def _determine_persona(self, session: InterviewSession) -> Persona:
        turn = session.current_turn
        if turn <= 2:
            return Persona.FRIENDLY_HR
        elif turn <= 5:
            return Persona.CURIOUS_PEER
        else:
            return Persona.SKEPTICAL_TECH_LEAD

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
        prompt = f"""You are a warm, friendly senior hiring manager starting a mock interview.
The candidate's background includes: {session.resume_text[:500]}
Their resume highlights topics like: {', '.join(topics)}.

Generate a brief, natural opening greeting (2-3 sentences). Welcome them warmly, mention something specific from their background that caught your eye, and ask a gentle opening question to get them talking.
Do NOT ask a hard technical question. Keep it easy and rapport-building."""

        return await self._call_llm(prompt)

    async def _generate_response(self, session: InterviewSession, is_transition: bool) -> str:
        system_prompt = PERSONA_SYSTEM_PROMPTS[session.current_persona]
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

        try:
            client = AsyncOpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.nvidia_api_key,
            )
            completion = await client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=messages,
                temperature=0.75,
                max_tokens=200,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Conversation response failed: {e}", exc_info=True)
            return "That's interesting. Could you tell me a bit more about your approach there?"

    async def _generate_wrap_up(self, session: InterviewSession) -> str:
        prompt = """You are wrapping up a mock interview as a senior hiring manager.
Generate a brief, warm closing (2 sentences). Thank the candidate for their time, mention that you'll now provide detailed feedback, and wish them well.
Keep it natural and encouraging."""
        return await self._call_llm(prompt)

    async def _call_llm(self, prompt: str) -> str:
        try:
            client = AsyncOpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.nvidia_api_key,
            )
            completion = await client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=150,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM call failed: {e}", exc_info=True)
            return "Thanks for sharing that. Let's continue — tell me more about your experience."


# Global instance
conversation_engine = ConversationEngine()
