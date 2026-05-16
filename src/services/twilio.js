import twilio from 'twilio';
import { supabase } from './supabase.js';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * transcribeVoicemail
 * Downloads and transcribes a Twilio recording using OpenAI Whisper.
 * @param {string} recordingUrl
 * @returns {Promise<string>} transcription text
 */
export async function transcribeVoicemail(recordingUrl) {
  // Twilio recordings are accessible with credentials
  const authHeader = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');

  const response = await fetch(`${recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${authHeader}` },
  });

  if (!response.ok) throw new Error(`Failed to fetch recording: ${response.status}`);

  // TODO: pipe audio to OpenAI Whisper or Deepgram for transcription
  // Placeholder return until AI transcription is wired up
  return '[Transcription pending]';
}

/**
 * saveVoicemail
 * Persists a voicemail record to Supabase.
 */
export async function saveVoicemail({ from, recordingUrl, transcription, callSid }) {
  const { error } = await supabase.from('voicemails').insert([{
    from_number: from,
    recording_url: recordingUrl,
    transcription,
    call_sid: callSid,
  }]);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}
