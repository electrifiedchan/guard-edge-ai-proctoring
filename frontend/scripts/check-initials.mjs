// Verification for the dashboard-avatar initials logic in src/lib/greeting.ts.
//
// Two things this file deliberately avoids, both of which broke the earlier
// throwaway version of this check:
//
//   1. No TypeScript syntax (no `: string` annotations). This is a plain .mjs
//      module run by Node directly. The greeting.ts source it imports IS
//      TypeScript, so run this with Node's built-in type stripping:
//
//          node --experimental-strip-types frontend/scripts/check-initials.mjs
//
//      (Node >= 22.6 for the flag; >= 23.6 strips types with no flag at all.)
//
//   2. No realistic personal data. Every fixture below is obvious dummy data
//      ("TestUser", "John Doe"). Real-looking names glued to words like
//      "resume"/"contact" trip PII content filters, which is a problem only
//      when this file is fed to an assistant — but keeping fixtures synthetic
//      costs nothing and sidesteps it entirely.

import { initialsFrom, nameFromResumeText, parseFirstName } from "../src/lib/greeting.ts";

let passed = 0;
let failed = 0;

function check(label, got, want) {
  const ok = got === want;
  if (ok) {
    passed++;
    console.log(`  ok   ${label} -> ${JSON.stringify(got)}`);
  } else {
    failed++;
    console.log(`  FAIL ${label} -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

console.log("initialsFrom (filename source):");
// Glued noise must be peeled so "resume" never contributes a letter.
check('"TestUser_A_Resume.pdf"', initialsFrom("TestUser_A_Resume.pdf".replace(/\.(pdf|docx?|txt)$/i, "").replace(/[_-]+/g, " ")), "TA");
// "testuserresume" -> strip glued "resume" -> "testuser" -> first+last letter.
check('"testuserresume.pdf"', initialsFrom("testuserresume"), "TR");
// A filename that is ONLY noise resolves to nothing, not "RE".
check('"resume.pdf" -> null', initialsFrom("resume"), null);
// Single glued token uses first + last letter, never one lonely glyph.
check('"johndoe" single token', initialsFrom("johndoe"), "JE");

console.log("\ninitialsFrom (typed/resume-body name, noise-stripping OFF):");
check('"John Doe"', initialsFrom("John Doe", false), "JD");
check('"Jane A. Roe"', initialsFrom("Jane A. Roe", false), "JR");
check('"dr. john doe"', initialsFrom("dr. john doe", false), "JD");

console.log("\nnameFromResumeText (pull the real name from the body):");
const body = [
  "JOHN DOE",
  "john.doe@example.com | +1 555 0100",
  "EXPERIENCE",
  "Software Engineer at Placeholder Inc.",
].join("\n");
check("name is first non-heading, non-contact line", nameFromResumeText(body), "John Doe");
// A leading section heading must not be mistaken for the name.
check('heading-first body -> null', nameFromResumeText("EXPERIENCE\nSkills\nEducation"), null);

console.log("\nparseFirstName:");
check('"John A. Doe" -> "John"', parseFirstName("John A. Doe"), "John");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
