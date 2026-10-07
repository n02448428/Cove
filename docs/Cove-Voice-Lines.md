# Cove Voice Lines — Default Script

**Companion to:** Cove Call Kernel v0.4
**Purpose:** Out-of-box defaults. Every line, question, and keyword below is customizable in settings. This doc is what Cove starts with, not what it's locked to.

---

## Greetings

**Personal:**
"Hello, this is Cove, {name}'s assistant. This call may be recorded."

**Business:**
"Thanks for calling {business}. This call may be recorded."

`{name}` = owner's display name. `{business}` = business name. Set during onboarding.

---

## Default Questions

**Q1:** "Can I get your name?"
**Q2:** "How can I help you today?"
**Q3:** "What's the best number to reach you?"
**Q4:** _(unset)_
**Q5:** _(unset)_

---

## Closings

**Standard close** (after final answer, no flags):
"Thank you. I will pass this along. Goodbye."

**No-answer close** (after repeat with no answer):
"No answer. Goodbye."

**Solicitation close** (solicitation keywords detected):
"Thanks for calling. Goodbye."

---

## Message Prompts

**Zero-question mode / GREEN bypass:**
"Please leave your message."

**Missed live-connect** (GREEN, no answer on real number):
"Sorry, they couldn't pick up. Please leave your message."

---

## Emergency Keywords

Flag URGENT, continue screening. Broad list is safe — these only add a flag, never terminate.

emergency, urgent, ambulance, hospital, police, fire, accident, help me, 911, dying,
emergencia, urgente, ambulancia, policía, policia, bomberos, accidente, ayuda, ayúdame, ayudame, muriendo, llama al 911, nine one one

---

## Solicitation Keywords

Classify SOLICITATION, close, terminate screening. Phrases only — single words cause false positives. Conservative by design.

"we offer", "I'm calling about your business", "extended warranty", "merchant services", "credit card processing", "SEO services", "marketing services", "business loan", "timeshare", "directory listing"

---

## Spam Filtering

Included at no extra cost. Not an upsell.

- Default: detect → polite close → silent ticket (dashboard only, no email).
- User may enable "Email me about solicitations" in settings.
- User may add/remove keywords. Lists are additive.
- One-tap block: from any SOLICITATION ticket, "Block this number" → adds to RED list.
- One-tap trust: from any LEAD/CUSTOMER ticket, "Trust this number" → adds to GREEN list.
- Classification suggests. Owner decides. Lists are never written automatically.

---

## Notes

- Every item above is an out-of-box default. All customizable in settings.
- Emergency keywords are intentionally broad (flag only, no termination risk).
- Solicitation keywords are intentionally narrow (termination risk — phrases only).
- Spanish equivalents included for emergency. Solicitation list is English-only pending demand.
