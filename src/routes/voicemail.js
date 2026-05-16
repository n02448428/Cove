import express from 'express';
import { transcribeVoicemail, saveVoicemail } from '../services/twilio.js';

const router = express.Router();

/**
 * POST /voicemail/receive
 * Twilio webhook triggered when a caller leaves a voicemail.
 * Transcribes and saves the recording.
 */
router.post('/receive', async (req, res) => {
  try {
    const { From, RecordingUrl, RecordingSid, CallSid } = req.body;
    console.log(`Voicemail received from ${From} [${RecordingSid}]`);

    const transcription = await transcribeVoicemail(RecordingUrl);
    await saveVoicemail({ from: From, recordingUrl: RecordingUrl, transcription, callSid: CallSid });

    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing voicemail:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * GET /voicemail
 * Returns list of saved voicemails.
 */
router.get('/', async (req, res) => {
  try {
    // TODO: fetch from Supabase
    res.json({ voicemails: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
