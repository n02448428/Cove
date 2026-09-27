# Cove Call Kernel

Version: 0.3

This document defines how Cove routes every incoming call. All Cove
systems must conform to it. Where any behavior conflicts with this
document, this document wins.

## Routing

- RED number → reject immediately.
- GREEN number → connect live. If the live connect is not answered, take
  a voicemail: "Sorry, they couldn't pick up. Please leave a message after
  the tone." Record it, transcribe it, ticket it.
- All other callers → Yellow screening.

RED overrides GREEN. The caller never chooses their own classification.

## Yellow screening

1. Play the greeting.
2. Ask the saved questions (1–5), in order, exactly as written.
3. Record and transcribe each answer.
4. No answer → repeat the question once. Still no answer → "No answer.
   Goodbye." End the call.
5. After the final answered question: "Thank you. I will pass this along.
   Goodbye."
6. Create a review ticket with the call details and all answers and
   transcripts.
7. Zero questions: the greeting plays, then take a message — "Please leave
   a message after the tone." Record it, transcribe it, ticket it. A call is
   never met with silence.
