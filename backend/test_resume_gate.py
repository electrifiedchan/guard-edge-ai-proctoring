"""Checks on the resume-only upload gate.

The gate is the front door: it runs on every upload, before the LLM call, and a
false refusal blocks a real candidate with nothing but a joke to go on. So the
tests that matter most are the ones asserting real resumes get through —
especially the sparse ones, and the ones whose actual work history uses the very
words the negative markers look for.

Run:  ../venv/Scripts/python.exe test_resume_gate.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_memory.resume_gate import (
    KIND_MARKERS,
    LINES,
    MIN_RESUME_SIGNALS,
    STRONG_RESUME_SIGNALS,
    ResumeGate,
    looks_like,
    resume_signals,
)

passed = 0
failed = 0


def check(label, actual, expected):
    global passed, failed
    if actual == expected:
        print(f"  ok   {label}")
        passed += 1
    else:
        print(f"  FAIL {label}\n       expected: {expected!r}\n       actual:   {actual!r}")
        failed += 1


FULL_RESUME = """
ANANYA SHARMA
ananya.sharma@gmail.com | +91 98765 43210 | github.com/ananyas

EDUCATION
B.Tech Computer Science, VIT Vellore, 2019 - 2023

WORK EXPERIENCE
Backend Engineer, Zerodha, Jun 2023 - Present
  Cut order-book fan-out latency from 180ms to 40ms by batching writes.
Intern, Freshworks, May 2022 - Aug 2022

TECHNICAL SKILLS
Python, Go, PostgreSQL, Redis, Kafka
"""

# The document the strong rung exists to protect: contact line, one section
# header, one date range, nothing else.
SPARSE_RESUME = """
Ravi Kumar - ravi@outlook.com
Experience
Software developer at a logistics startup, 2021 - 2024. Built the dispatch
scheduler and the driver mobile app.
"""

# A real resume whose actual job was billing. Every INVOICE marker in here is
# describing work the candidate did.
BILLING_RESUME = """
MEERA IYER | meera.iyer@proton.me | +91 90000 11111
EXPERIENCE
Payments Engineer, Razorpay, 2020 - 2023
  Owned the tax invoice pipeline: GST computation, HSN mapping, and the
  purchase order reconciliation job. Rewrote the subtotal engine.
SKILLS
Java, Kotlin, MySQL
"""

# An academic CV. Hits PAPER markers because publications ARE the work history.
ACADEMIC_CV = """
Dr. S. Venkatesh - venkatesh@iitm.ac.in
Curriculum Vitae
EDUCATION
PhD, Signal Processing, IIT Madras, 2014 - 2019
PUBLICATIONS
Venkatesh et al. "Sparse recovery under bounded noise", IEEE Transactions on
Signal Processing, 2021. doi:10.1109/TSP.2021.000
In this paper we propose a relaxation of the RIP condition.
"""

GROCERY_LIST = """
Shopping list - Sunday
Milk 2 litres
Eggs one dozen
Bread brown
Vegetables: onions, tomatoes, spinach
Detergent
Total approx 780
"""

INVOICE = """
TAX INVOICE
Invoice No: INV-2024-0912
Bill To: Sunrise Traders, 4th Cross, Indiranagar
support@quickship.in  +91 80 4000 1234
Item            Qty     Rate
Courier         12      450
Subtotal                5400
GST 18%                  972
Amount Due               6372
Payment Terms: Net 30
"""

BOARDING_PASS = """
BOARDING PASS
Passenger Name: KUMAR/ARJUN MR
PNR: 4XKQ2M   Seat No: 14C   Gate No: 22
Departure: BLR 06:40   Arrival: DEL 09:25
Booking Reference: IND8871
Baggage: 15 KG
"""

CERTIFICATE = """
CERTIFICATE OF COMPLETION
This is to certify that Priya Nair
has successfully completed the course Deep Learning Specialisation
Certificate No: CT-99120
Date of Issue: 14 March 2024
Awarded to the above in recognition of sustained effort.
"""

RANDOM_PDF = """
Chapter Four
The rain had stopped by the time he reached the ridge, and the valley below
was the colour of wet slate. He sat down on the flat rock and waited.
"""


print("\nreal resumes get through — the failure that actually matters:")
gate = ResumeGate()
check("a full resume", gate.inspect(FULL_RESUME), None)
check("a sparse one-section resume", gate.inspect(SPARSE_RESUME), None)
check("a resume whose job WAS invoicing", gate.inspect(BILLING_RESUME), None)
check("an academic CV full of paper markers", gate.inspect(ACADEMIC_CV), None)

print("\nsignal families are counted independently:")
check(
    "full resume hits every family",
    sorted(resume_signals(FULL_RESUME)),
    ["dates", "email", "phone", "profile", "section"],
)
check(
    "sparse resume hits exactly the three that carry it",
    sorted(resume_signals(SPARSE_RESUME)),
    ["dates", "email", "section"],
)
check("a shopping list hits none", resume_signals(GROCERY_LIST), [])
check(
    "an invoice's contact block is NOT structural",
    [s for s in resume_signals(INVOICE) if s in ("section", "dates")],
    [],
)
check(
    "a single date is not a date range",
    resume_signals("Date of Issue: 14 March 2024"),
    [],
)
check(
    "a month-to-month span is",
    resume_signals("Freshworks, May 2022 - Aug 2022"),
    ["dates"],
)

print("\nwrong documents are refused, and the joke names what it saw:")
for label, text, expect_kind in (
    ("grocery list", GROCERY_LIST, "GROCERY"),
    ("invoice", INVOICE, "INVOICE"),
    ("boarding pass", BOARDING_PASS, "TICKET"),
    ("certificate", CERTIFICATE, "CERTIFICATE"),
):
    fresh = ResumeGate()
    result = fresh.inspect(text)
    check(f"{label} refused", result is not None, True)
    check(f"{label} identified", result and result["kind"], expect_kind)
    check(f"{label} joke comes from its own pool", result["say"] in LINES[expect_kind], True)

print("\nan unrecognisable PDF is still refused, generically:")
fresh = ResumeGate()
result = fresh.inspect(RANDOM_PDF)
check("refused", result is not None, True)
check("falls to GENERIC", result["kind"], "GENERIC")
check("empty text is refused too", ResumeGate().inspect("")["kind"], "GENERIC")

print("\nrefusals carry the diagnosis, not just the joke:")
fresh = ResumeGate()
result = fresh.inspect(INVOICE)
check("score is the family count", result["score"], len(resume_signals(INVOICE)))
check("signals are named", "email" in result["signals"], True)
check("occurrence is 1-based", result["occurrence"], 1)

print("\nrotation is deterministic, not random:")
a = ResumeGate()
b = ResumeGate()
seq_a = [a.inspect(GROCERY_LIST)["say"] for _ in range(4)]
seq_b = [b.inspect(GROCERY_LIST)["say"] for _ in range(4)]
check("two gates produce the same sequence", seq_a, seq_b)
check("first line is the pool's first", seq_a[0], LINES["GROCERY"][0])
check("second attempt gets a different line", seq_a[0] != seq_a[1], True)
check("cycles rather than clamping", seq_a[3], LINES["GROCERY"][0])
check("occurrence keeps counting past the pool", a.inspect(GROCERY_LIST)["occurrence"], 5)

print("\none rotation for the whole gate, but per pool:")
c = ResumeGate()
c.inspect(GROCERY_LIST)
check(
    "the invoice pool is still on its first line",
    c.inspect(INVOICE)["say"],
    LINES["INVOICE"][0],
)

print("\nkind detection needs corroboration:")
check("one stray marker decides nothing", looks_like("we sent the invoice"), None)
check("two do", looks_like("tax invoice, amount due 400"), "INVOICE")
check(
    "ties keep the earlier declaration",
    looks_like("grocery aisle invoice subtotal"),
    "GROCERY",
)

print("\npools are well formed:")
check("every kind has a line pool", sorted(LINES) == sorted(list(KIND_MARKERS) + ["GENERIC"]), True)
for kind, pool in LINES.items():
    check(f"{kind} has room to rotate", len(pool) >= 2, True)
    check(f"{kind} has no duplicate line", len(set(pool)), len(pool))
    check(f"{kind} lines are all non-empty", all(line.strip() for line in pool), True)

print("\nthresholds stay in the order the ladder assumes:")
check("strong is above the floor", STRONG_RESUME_SIGNALS > MIN_RESUME_SIGNALS, True)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
