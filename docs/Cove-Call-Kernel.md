# Cove Call Kernel

Status: AUTHORITATIVE
Version: 0.1 Architecture Source of Truth

This document defines the non-negotiable call-routing behavior of Cove.

All application code, database design, dashboard controls, integrations, automations, AI features, prompts, and future architecture must conform to this kernel.

If any system behavior conflicts with this document, this document wins.

For every incoming call:

RED number → Reject immediately.
GREEN number → Connect live.
All other callers → Yellow.

Routing priority: RED overrides GREEN.

During Yellow:
- A valid private keypad code followed by # → Connect live. Code entry
  happens WHILE Cove is speaking, never in silence: the code instruction is
  part of the greeting speech (interruptible mid-sentence), and a short
  "Thank you. If you have an extension code, enter it, followed by the pound
  key." follows each recorded answer. Keypad Gather timeouts are short
  (1–2s) and inter-digit — any keypress resets the clock, so they only ever
  cut silence, never someone mid-entry. Keypad presses cannot interrupt the
  recording itself.
- An invalid, expired, revoked, or incomplete code → Continue silently.
- Ask the user's 1–5 saved questions, in order.
- Speak each question exactly as saved.
- Capture and transcribe each answer.
- When the caller stops speaking, say:
  "Thank you. If you have an extension code, enter it, followed by the pound key."
- Continue to the next question.
- If no answer: repeat the same question once.
- If no answer again: say "No answer. Goodbye." and end the call.
- After the final answered question, say:
  "If you have an extension code, enter it, followed by the pound key."
  then "Thank you. I will pass this along. Goodbye."
- Create a review ticket containing call details and all captured answers.

The caller never chooses their own classification.

## Authority

This file is Cove's call-routing source of truth.

No code, dashboard setting, AI feature, automation, or integration may
override this logic.

Changes require an explicit decision by Cove's architect and a version update.
