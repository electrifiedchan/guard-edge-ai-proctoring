"""Refuse a PDF that isn't a resume, and be funny about it.

The upload page accepts one thing and gets asked for one thing, but until now
"is a PDF" was the entire test. Anything else that happened to be a PDF — an
invoice, a boarding pass, a shopping list — went straight to the LLM, which
would dutifully invent four STAR questions about it, and the candidate would
land on /sentry being asked to describe a situation involving milk. The failure
was silent and expensive: a wasted question-generation call, a cached empty
resume, and a session that only reveals its problem three screens later.

WHICH DIRECTION THIS ERRS. Wrongly rejecting a real resume is much worse than
wrongly accepting a strange one: the candidate is blocked at the front door and
told a joke about it, with nothing they can do. So the accept test is deliberately
easy to pass, the strong-resume rung overrides every negative signal, and every
rejection logs the score and which signals fired, so a false rejection is
diagnosable instead of merely insulting.

WHY THE MESSAGES ROTATE. Same reasoning as interrupts.LINES: a fixed string
repeated on the second attempt stops being a joke and starts being a machine
reading a rule back at you. Rotation is by occurrence index rather than at
random, so the second attempt is guaranteed a different line — `random.choice`
would happily repeat itself — and a test can assert which line comes second.

This module holds no database handle, does no I/O, and does not raise: it decides
WHETHER to refuse and WHAT to say, and the caller turns that into an HTTP error.
"""

import re

# --- Does this read like a resume? -----------------------------------------
#
# Signal FAMILIES, not keywords. Counting keywords rewards a document for
# repeating one word; counting families asks how many independent things about
# this text look like a resume, which is the actual question.
RESUME_SIGNALS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]*[\w]"),
    # Ten digits minimum, and at most one separator between them. The obvious
    # loose version (a digit, then eight-or-more of digits-and-punctuation, then
    # a digit) matched "2021 - 2024", so a lone employment date range counted as
    # both a date AND a phone number — two families off one piece of evidence,
    # which defeats the point of counting families at all.
    "phone": re.compile(r"(?:\+?\d[\s().-]?){10,}"),
    "section": re.compile(
        r"\b(work\s+experience|experience|education|technical\s+skills|skills|"
        r"projects?|employment|work\s+history|certifications?|internships?|"
        r"achievements?|publications?|objective|summary\s+of|career\s+summary|"
        r"professional\s+summary|extracurricular|coursework)\b",
        re.I,
    ),
    # A RANGE, not a single date. Every invoice, ticket and receipt carries one
    # date; what a resume carries is spans — employment and education entries
    # that run from one point to another or to the present. The optional month
    # word before the closing year is what lets "Jun 2021 - Aug 2022" match on
    # the same pattern as "2021-2023" and "Jan 2020 - Present".
    "dates": re.compile(
        r"(?:19|20)\d{2}\s*(?:[-–—]|to|through|until)\s*"
        r"(?:[A-Za-z]{3,9}\.?\s*)?(?:(?:19|20)\d{2}|present|current|now|ongoing|date)\b",
        re.I,
    ),
    "profile": re.compile(
        r"\b(curriculum\s+vitae|r[eé]sum[eé]|linkedin\.com|github\.com|portfolio)\b",
        re.I,
    ),
}

# Contact details are not a resume. An invoice has an email address and a phone
# number on it too, so reaching the count on those two alone proves nothing —
# one of these structural families has to be present as well.
STRUCTURAL_SIGNALS = ("section", "dates")

# Two families plus something structural. A real resume clears this trivially:
# an email and one section header is already there, and most hit four. Set low on
# purpose — see the note on which direction this errs.
MIN_RESUME_SIGNALS = 2

# At this many families it is a resume and nothing overrides that. Needed because
# the negative markers below are words that can legitimately appear in real work
# history: a billing engineer's resume says "invoice", an academic CV says
# "abstract" and "et al.", an airline analyst's says "boarding pass".
#
# Only one above the floor, because the sparse-but-real resume is exactly the
# document this rung has to protect: contact line, one section header, one date
# range, and nothing else. Setting it higher would let two stray words refuse it.
# The cost of erring this way is an invoice reaching the LLM, which is visible
# and recoverable; the cost of erring the other way is a real candidate locked
# out at the front door.
STRONG_RESUME_SIGNALS = 3

# A resume is short, and that is a property of the document class rather than a
# tendency. Measured on the real PDFs sitting on this machine: three actual
# resumes come to 129, 378 and 389 words, while the shortest non-resume is a
# 1735-word project synopsis, a slide deck is 2155, a six-page paper is 3996 and
# a project report is 5999. The gap is wide and empty, so the ceiling sits
# generously inside it — three dense pages' worth — rather than anywhere near
# the resumes, because three is a small sample and two-page resumes exist.
#
# This refuses nothing on its own; see the note in `inspect`.
MAX_RESUME_WORDS = 1200

# --- If it isn't a resume, what is it? -------------------------------------
#
# Only used to pick which joke to tell, never to accept anything. Two distinct
# markers required, so one stray word does not decide what a document is.
KIND_MIN_MARKERS = 2

KIND_MARKERS: dict[str, tuple[str, ...]] = {
    "GROCERY": (
        "shopping list", "grocery", "groceries", "supermarket", "aisle",
        "per kg", "per litre", "milk", "eggs", "bread", "vegetables",
    ),
    "INVOICE": (
        "invoice", "bill to", "subtotal", "amount due", "total due",
        "amount payable", "tax invoice", "gst", "hsn", "purchase order",
        "receipt", "paid in full", "payment terms",
    ),
    "TICKET": (
        "boarding pass", "e-ticket", "pnr", "seat no", "gate no", "departure",
        "arrival", "booking reference", "booking confirmation",
        "passenger name", "baggage",
    ),
    "PAPER": (
        "abstract", "et al.", "doi:", "arxiv", "index terms", "related work",
        "we propose", "in this paper", "literature survey",
        "ieee transactions", "proceedings of",
    ),
    "CERTIFICATE": (
        "certificate of", "hereby certif", "has successfully completed",
        "certificate no", "awarded to", "in recognition of",
        "certificate id", "date of issue",
    ),
}

# What to say. Three per kind so the rotation has somewhere to go, and the kind
# is named in the line — a joke that knows it is looking at a boarding pass is
# also, usefully, telling the user what the system thought it saw.
LINES: dict[str, tuple[str, ...]] = {
    "GROCERY": (
        "I don't want your grocery list — keep it. Bring me the PDF with your "
        "job history, not your dairy aisle.",
        "Two litres of milk is not a career highlight. Upload the actual resume.",
        "This reads like a shopping run. I can't ask STAR questions about bread.",
    ),
    "INVOICE": (
        "That's an invoice. I'm here to interview you, not to pay you.",
        "Amount due: one resume. Try that file instead.",
        "You've sent me a bill. Send me the reason someone would hire you.",
    ),
    "TICKET": (
        "That's a travel document. I'm not checking you in — upload your resume.",
        "Boarding pass received, resume not. Right folder, wrong PDF.",
        "I can see where you're flying, not where you've worked. Try again.",
    ),
    "PAPER": (
        "That's a paper, not a resume. I want your work history, not your "
        "related-work section.",
        "Strong abstract. Now send me the two pages that are about you.",
        "This is a publication. Upload the CV it belongs to instead.",
    ),
    "CERTIFICATE": (
        "That's a certificate. One achievement isn't an interview — send the "
        "resume it sits on.",
        "Congratulations on completing the course. Now upload the resume.",
        "A certificate proves one thing. A resume gives me something to ask about.",
    ),
    "GENERIC": (
        "That's a PDF, but it isn't a resume. I can't interview a document that "
        "has no idea who you are.",
        "Nothing in there looks like experience, education, or skills. Wrong file?",
        "I need a resume — sections, dates, the work you've actually done. "
        "This isn't it.",
    ),
}


def resume_signals(text: str) -> list[str]:
    """Which resume signal families this text hits, in declaration order."""
    return [name for name, pattern in RESUME_SIGNALS.items() if pattern.search(text)]


def looks_like(text: str) -> str | None:
    """Name the non-resume document this most resembles, or None.

    Says nothing about whether the text is a resume — a resume that discusses
    billing work will match INVOICE markers. Only the ladder in `inspect`
    decides, and it consults this second.
    """
    lowered = text.lower()
    best, best_hits = None, 0
    for kind, markers in KIND_MARKERS.items():
        hits = sum(1 for marker in markers if marker in lowered)
        # Strictly greater, so a tie keeps the earlier declaration rather than
        # letting dict order silently pick the winner.
        if hits >= KIND_MIN_MARKERS and hits > best_hits:
            best, best_hits = kind, hits
    return best


class ResumeGate:
    """Decides whether to refuse an upload, and picks the words.

    One rotation for the whole gate rather than one per kind: unlike a proctoring
    session, where the phone reminder and the second-face reminder are about
    different findings, every refusal here is about the same mistake — the wrong
    file — so hearing a fresh line each attempt is the whole point.
    """

    def __init__(self) -> None:
        # kind -> how many times we have refused something that looked like it
        self._count: dict[str, int] = {}

    def inspect(self, text: str) -> dict | None:
        """Return the refusal to send back, or None when this reads as a resume.

        The ladder, in order, each rung with its own reason:

          1. Short and strongly
             resume-shaped     accept. Nothing overrides three independent
                               families plus structure.
          2. Recognised as
             something else    refuse, and name it in the joke.
          3. Passable resume   accept. Two families plus structure.
          4. Anything else     refuse generically. No idea what it is, but it
                               does not have the shape of a resume.
        """
        signals = resume_signals(text)
        structural = any(name in signals for name in STRUCTURAL_SIGNALS)

        # Length refuses nothing by itself: a long document with resume structure
        # and nothing else recognisable still gets in at rung 3. What being long
        # costs a document is rung 1's veto, because the very signals that earn
        # that veto — an author email, the word "experience", a year range in a
        # citation — are signals a six-page technical paper carries too. Measured
        # before this existed: a 3996-word paper scored three families and
        # overrode its own three PAPER markers, and a 2155-word slide deck did
        # the same. Both are now refused; both real resumes tested are ~380 words
        # and untouched.
        #
        # The known cost is a genuinely long academic CV that also trips two
        # PAPER markers, which will be refused as a paper. Accepted deliberately:
        # this tool's users upload one- and two-page resumes, and the alternative
        # is letting every long document in.
        brief = len(text.split()) <= MAX_RESUME_WORDS

        if brief and len(signals) >= STRONG_RESUME_SIGNALS and structural:
            return None

        kind = looks_like(text)

        if kind is None and len(signals) >= MIN_RESUME_SIGNALS and structural:
            return None

        pool_key = kind if kind in LINES else "GENERIC"
        pool = LINES[pool_key]
        occurrence = self._count.get(pool_key, 0)
        self._count[pool_key] = occurrence + 1

        return {
            "kind": pool_key,
            # Cycles rather than clamping on the last line, so a user on their
            # fifth wrong file does not get the third joke forever.
            "say": pool[occurrence % len(pool)],
            "occurrence": occurrence + 1,
            # Carried so the caller can log WHY, which is the only way a false
            # rejection ever gets diagnosed.
            "score": len(signals),
            "signals": signals,
        }


# Global instance, matching ai_interviewer and interrupt_director.
resume_gate = ResumeGate()
