// supabase/functions/call-hangup/index.ts
// Called by Twilio when a call ends (statusCallback). Finalizes tickets
// stuck in "collecting" — e.g., caller hung up mid-screening.
// Classifies based on available transcripts, notes the hangup.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { audit, dispatchTicketWebhook, dispatchTicketNotifications } from '../_shared/cove.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const ticketId = url.searchParams.get('ticketId') ?? ''
    const callSid = url.searchParams.get('callSid') ?? ''
    const supabase = createSupabase(SUPABASE_URL, SERVICE_ROLE)

    // Look up ticket by ID or callSid
    let ticket = null
    if (ticketId) {
      const { data } = await supabase
        .from('review_tickets')
        .select('id, user_id, call_sid, status, classification')
        .eq('id', ticketId)
        .maybeSingle()
      ticket = data
    } else if (callSid) {
      const { data } = await supabase
        .from('review_tickets')
        .select('id, user_id, call_sid, status, classification')
        .eq('call_sid', callSid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      ticket = data
    }

    if (!ticket) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Only finalize if still in a non-terminal state
    if (['new', 'reviewed', 'actioned', 'failed'].includes(ticket.status)) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const ticketId = ticket.id

    // Classify based on available transcripts (if not already classified)
    if (!ticket.classification) {
      const { data: answers } = await supabase
        .from('review_ticket_answers')
        .select('transcript')
        .eq('ticket_id', ticketId)

      const allText = (answers || []).map(a => a.transcript || '').join(' ').toLowerCase()

      // Check solicitation first (highest priority)
      const { containsSolicitationKeyword } = await import('../_shared/cove.ts')
      const { data: prof } = await supabase
        .from('profiles')
        .select('solicitation_keywords')
        .eq('id', ticket.user_id)
        .maybeSingle()

      let classification = 'LEAD' // default
      if (containsSolicitationKeyword(allText, prof?.solicitation_keywords ?? [])) {
        classification = 'SOLICITATION'
      } else {
        const customerHints = [
          'my account', 'existing', 'already a', 'follow up', 'follow-up',
          'appointment', 'my order', 'invoice', 'contract', 'previous',
          'last time', 'we spoke', 'you helped', 'my case', 'member',
        ]
        if (customerHints.some(h => allText.includes(h))) {
          classification = 'CUSTOMER'
        }
      }

      await supabase
        .from('review_tickets')
        .update({ classification })
        .eq('id', ticketId)
    }

    // Finalize the ticket
    await supabase
      .from('review_tickets')
      .update({
        status: 'new',
        ended_reason: 'caller_hung_up',
      })
      .eq('id', ticketId)

    await supabase.from('call_logs').update({
      outcome: 'caller_hung_up',
      status: 'caller_hung_up',
    }).eq('call_sid', callSid || ticket.call_sid)

    await audit(supabase, ticket.user_id, ticket.call_sid, 'caller_hung_up', 'kernel', {
      ticket_id: ticketId,
    })

    // Fire webhook and notifications
    dispatchTicketWebhook(supabase, ticketId)
    dispatchTicketNotifications(ticketId)

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('call-hangup error:', err)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
})
