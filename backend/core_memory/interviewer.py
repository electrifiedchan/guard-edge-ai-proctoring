"""AI Interviewer Module - Resume parsing and LLM question generation."""
import os
import json
import logging
import pdfplumber
from openai import AsyncOpenAI

from . import llm_config

logger = logging.getLogger(__name__)


class AIInterviewer:
    def __init__(self):
        self._client: AsyncOpenAI | None = None

    def _llm(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = llm_config.make_client()
            logger.info(f"🧠 Interviewer LLM: {llm_config.describe()}")
        return self._client

    def extract_text_from_pdf(self, file_path: str) -> str:
        """Extracts and cleans text from an uploaded PDF resume."""
        try:
            text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
            return text.strip()
        except Exception as e:
            logger.error(f"Resume parsing failed: {e}")
            return ""

    async def generate_questions(self, resume_text: str) -> list[dict]:
        """Passes resume to LLM to generate 3-5 tough STAR questions."""
        if not resume_text:
            return [{"question": "Can you walk me through your background and experience?"}]

        prompt = f"""You are a tough but constructive technical interview coach.
Analyze this candidate's resume and generate exactly 4 challenging, tailored behavioral/technical interview questions using the STAR method (Situation, Task, Action, Result).

Candidate Resume:
{resume_text[:4000]}

Return ONLY a valid JSON object with a "questions" array. Format:
{{
  "questions": [
    {{"question": "Tell me about a time you...", "focus": "Leadership"}},
    ...
  ]
}}
Do not include markdown blocks, pleasantries, or extra text. Just the JSON object."""

        try:
            # `response_format` is honoured by both backends and is what keeps a
            # 3B local model from answering with prose. Without it the parse
            # fails often enough that every session falls back to the canned
            # questions — which looks like the local path "working".
            completion = await self._llm().chat.completions.create(
                model=llm_config.chat_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=600,
                response_format={"type": "json_object"},
            )
            questions = llm_config.extract_json(completion.choices[0].message.content)

            # Asking for a JSON *object* to get schema adherence means the model
            # may wrap the array in a key of its choosing, so unwrap a lone
            # list-valued field before giving up on it.
            if isinstance(questions, dict):
                for value in questions.values():
                    if isinstance(value, list):
                        questions = value
                        break

            if not isinstance(questions, list) or not questions:
                logger.warning("LLM returned no usable questions; using backups")
                return self._backup_questions()

            valid = [q for q in questions if isinstance(q, dict) and q.get("question")]
            return valid or self._backup_questions()

        except Exception as e:
            logger.error(f"LLM Question Generation failed: {type(e).__name__}: {e}", exc_info=True)
            return self._backup_questions()

    def _backup_questions(self) -> list[dict]:
        return [
            {"question": "Describe a situation where you had to balance technical rigor and foresight in designing a system. What actions did you take, and what were the results?", "focus": "System Design"},
            {"question": "Walk me through a time when you encountered a complex challenge in low-level optimization. How did you approach the problem, and what was the outcome?", "focus": "Low-Level Optimization"},
            {"question": "Tell me about a project where you had to work with a large codebase and implement automated compliance checks. What tools or techniques did you use, and what were the benefits?", "focus": "Code Analysis"},
            {"question": "Recall a situation where you had to communicate technical information to a non-technical audience. How did you tailor your message, and what was the impact?", "focus": "Communication"},
        ]


# Global instance
ai_interviewer = AIInterviewer()
