# Cove Call Kernel

Version: 0.4

## ROUTING

- RED → reject.
- GREEN → bypass screening. Take message. Classify as CUSTOMER. Ticket. Email per settings.
- All others → screen.

RED overrides GREEN. Caller never self-classifies.

## SCREENING

1. Play greeting.
2. Ask saved questions (1–5) in order, exactly as written.
3. Record and transcribe each answer.
4. After each transcript:
   - Emergency keywords → flag URGENT, continue.
   - Solicitation keywords → classify SOLICITATION, close, ticket, email per settings. Terminate.
5. No answer → repeat question once. No answer → no-answer close. Terminate.
6. Final answer, no flags → close. Terminate.
7. Classify: LEAD, CUSTOMER, or SOLICITATION.
8. Ticket with classification, answers, transcripts.
9. Email per notification settings.
10. Zero questions → greeting → message prompt. Record, transcribe, classify, ticket, email.

## CLASSIFICATION

- LEAD: caller states a need, problem, or inquiry.
- CUSTOMER: caller references existing work or relationship.
- SOLICITATION: caller offers, pitches, or sells.

## LISTS

- RED: blocked. Reject immediately. Owner adds manually or one-tap from a SOLICITATION ticket.
- GREEN: trusted. Bypass screening. Take message. Owner adds manually or one-tap from a LEAD/CUSTOMER ticket.
- Classification suggests. Owner decides. Lists are never written automatically.

## NOTIFICATION SETTINGS

All toggles, user may change any.

- Email on LEAD: on.
- Email on CUSTOMER: on.
- Email on SOLICITATION: off.
- Email on URGENT: on. Overrides all above.

## DEFAULTS

Active on install, user may override.

- Greeting: per voice lines doc.
- Q1–Q3: per voice lines doc. Q4–Q5: unset.
- Emergency keywords: per voice lines doc.
- Solicitation keywords: per voice lines doc.
- RED list: empty. GREEN list: empty.
- Notifications: per NOTIFICATION SETTINGS defaults.

## CUSTOMIZABLE

- Greeting. Questions (1–5). Emergency keywords (additive). Solicitation keywords (additive). RED list. GREEN list. All notification toggles.

## NOT CUSTOMIZABLE

- Routing order. Screening sequence. Classification categories. Invariants.

## INVARIANTS

- No call meets silence.
- Every call produces a ticket.
- Classification never deletes. It filters notification only.
