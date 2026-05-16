import express from 'express';
import { handleIncomingCall } from '../services/retell.js';
import { isTrustedContact } from '../services/contacts.js';

const router = express.Router();

/**
 * POST /calls/incoming
 * Webhook from Twilio when a call comes in.
 * Checks if caller is trusted; if so, routes directly.
 * Otherwise, hands off to Retell AI agent to screen.
 */
router.post('/incoming', async (req, res) => {
  try {
    const { From, To, CallSid } = req.body;
    console.log(`Incoming call from ${From} to ${To} [${CallSid}]`);

    const trusted = await isTrustedContact(From);

    if (trusted) {
      // Trusted contact: generate TwiML to ring through
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${process.env.USER_PHONE_NUMBER}</Dial>
</Response>`;
      res.type('text/xml').send(twiml);
    } else {
      // Unknown caller: hand to Retell AI agent
      const twiml = await handleIncomingCall({ from: From, to: To, callSid: CallSid });
      res.type('text/xml').send(twiml);
    }
  } catch (err) {
    console.error('Error handling incoming call:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /calls/status
 * Twilio call status callback.
 */
router.post('/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Call ${CallSid} status: ${CallStatus}`);
  res.sendStatus(200);
});

export default router;
