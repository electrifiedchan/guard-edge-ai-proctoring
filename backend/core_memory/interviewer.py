"""AI Interviewer Module - Resume parsing and LLM question generation."""
import os
import json
import logging
import pdfplumber
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class AIInterviewer:
    def __init__(self):
        self.llm_mode = os.getenv("LLM_MODE", "nvidia").lower()
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")

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

Return ONLY a valid JSON array of objects. Format:
[
  {{"question": "Tell me about a time you...", "focus": "Leadership"}},
  ...
]
Do not include markdown blocks, pleasantries, or extra text. Just the JSON array."""

        try:
            if self.llm_mode == "nvidia":
                client = AsyncOpenAI(
                    base_url="https://integrate.api.nvidia.com/v1",
                    api_key=self.nvidia_api_key,
                )
                completion = await client.chat.completions.create(
                    model="meta/llama-3.1-8b-instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=600,
                )
                raw_response = completion.choices[0].message.content.strip()

                if raw_response.startswith("```json"):
                    raw_response = raw_response[7:-3].strip()
                elif raw_response.startswith("```"):
                    raw_response = raw_response[3:-3].strip()

                return json.loads(raw_response)
            else:
                # Placeholder for local Ollama implementation
                return [{"question": "Ollama mode detected. What is your strongest technical skill?", "focus": "General"}]

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
