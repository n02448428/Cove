import Retell from 'retell-sdk';

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

/**
 * handleIncomingCall
 * Creates a Retell web call and returns TwiML to connect Twilio to it.
 * @param {{ from: string, to: string, callSid: string }} params
 * @returns {Promise<string>} TwiML string
 */
export async function handleIncomingCall({ from, to, callSid }) {
  const webCall = await client.call.createWebCall({
    agent_id: process.env.RETELL_AGENT_ID,
    metadata: { from, to, callSid },
  });

  // Return TwiML that streams audio to the Retell agent via WebSocket
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.retellai.com/audio-websocket/${webCall.call_id}" />
  </Connect>
</Response>`;

  return twiml;
}

/**
 * getCallSummary
 * Fetches the post-call summary/transcript from Retell.
 * @param {string} callId
 */
export async function getCallSummary(callId) {
  const call = await client.call.retrieve(callId);
  return {
    transcript: call.transcript,
    summary: call.call_analysis?.custom_analysis_data ?? null,
    duration: call.duration_ms,
    sentiment: call.call_analysis?.user_sentiment ?? null,
  };
}
