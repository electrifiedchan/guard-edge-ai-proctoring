"""Checks on the spoken-reply trimmer.

The trimmer is the backstop for when the model ignores the brevity prompt. It
runs on every interviewer turn, so the thing that matters is that it never
truncates mid-sentence — a dangling fragment is read aloud verbatim by the
browser's speech synthesiser and sounds broken.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_memory.conversation_engine import _trim_to_sentences

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


print("\nshort replies pass through untouched:")
check(
    "single question",
    _trim_to_sentences("What was the hardest part of that project?"),
    "What was the hardest part of that project?",
)
check("empty stays empty", _trim_to_sentences(""), "")
check("whitespace only", _trim_to_sentences("   \n  "), "")

print("\nlong replies are cut at a sentence boundary:")
long_reply = (
    "That's a really great question and I appreciate you walking me through it. "
    "It sounds like you had a lot of ownership over the migration work there. "
    "I'm curious about the rollback strategy you mentioned earlier in passing. "
    "What would have happened if the primary database had failed mid-migration? "
    "I'd also love to hear about how the team coordinated the release window."
)
trimmed = _trim_to_sentences(long_reply, max_words=35)
check("ends on sentence punctuation", trimmed[-1] in ".!?", True)
check("dropped the tail", "release window" in trimmed, False)
check("kept the opening sentence", trimmed.startswith("That's a really great"), True)
check("within a reasonable budget", len(trimmed.split()) <= 45, True)

print("\nquestion preservation — padding drops but the question stays:")
padding_then_question = (
    "That's a really great question and I appreciate you walking me through that example. "
    "It sounds like you had a lot of ownership over the work. "
    "I'm curious about one specific detail. "
    "What would have happened if the primary database had failed mid-migration?"
)
trimmed_pq = _trim_to_sentences(padding_then_question, max_words=20)
check("still has a question mark", "?" in trimmed_pq, True)
check("kept the actual question", "failed mid-migration?" in trimmed_pq, True)
check(
    "opening or question present",
    trimmed_pq.startswith("That's a really great") or "failed mid-migration?" in trimmed_pq,
    True,
)

print("\na single overlong sentence is never trimmed to nothing:")
one_sentence = " ".join(["word"] * 80) + "."
result = _trim_to_sentences(one_sentence, max_words=35)
check("kept rather than emptied", len(result) > 0, True)

print("\nsentence splitting handles real punctuation:")
check(
    "exclamation and period",
    _trim_to_sentences("Great! Tell me about the caching layer you built. " + " ".join(["extra"] * 60), max_words=12),
    "Great! Tell me about the caching layer you built.",
)
check(
    "text with no terminator survives",
    _trim_to_sentences("no punctuation here at all"),
    "no punctuation here at all",
)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
