# Cove

> AI phone concierge — screens calls, handles voicemail, and lets trusted contacts reach you directly.

## How It Works

1. **You forward your number** to your Cove Twilio number.
2. **Every incoming call** hits Cove's `/calls/incoming` webhook.
3. **Trusted contacts** (stored in Supabase) ring straight through to your real phone.
4. **Everyone else** is answered by your Retell AI agent, which screens the call and takes a voicemail if needed.
5. **Voicemails** are transcribed and saved to Supabase for you to review.

## Tech Stack

| Layer | Tech |
|-------|------|
| Server | Node.js + Express |
| Phone/SMS | Twilio |
| AI Voice Agent | Retell AI |
| Database | Supabase (PostgreSQL) |
| Hosting | Railway / Render / Fly.io |

## Project Structure

```
Cove/
├── src/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   ├── calls.js          # Incoming call routing & screening
│   │   ├── voicemail.js      # Voicemail receive & storage
│   │   └── contacts.js       # Trusted contacts CRUD API
│   └── services/
│       ├── retell.js         # Retell AI call handling
│       ├── twilio.js         # Twilio voicemail download
│       ├── supabase.js       # Supabase client + schema docs
│       └── contacts.js       # isTrustedContact() helper
├── .env.example              # Required environment variables
├── .gitignore
├── package.json
└── README.md
```

## Supabase Schema

Run these in the Supabase SQL editor:

```sql
-- Trusted contacts
create table contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null unique,
  created_at timestamptz default now()
);

-- Voicemail log
create table voicemails (
  id             uuid primary key default gen_random_uuid(),
  from_number    text,
  recording_url  text,
  transcription  text,
  call_sid       text,
  created_at     timestamptz default now()
);
```

## Setup

### 1. Clone & install
```bash
git clone https://github.com/n02448428/Cove.git
cd Cove
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your Twilio, Retell, and Supabase credentials
```

### 3. Run locally
```bash
npm run dev
```

### 4. Expose with ngrok (for Twilio webhooks during dev)
```bash
ngrok http 3000
```
Set your Twilio number's webhook to:
- **Incoming call:** `https://<ngrok-url>/calls/incoming`
- **Call status:** `https://<ngrok-url>/calls/status`
- **Voicemail:** `https://<ngrok-url>/voicemail/receive`

### 5. Deploy
Deploy to Railway, Render, or Fly.io and update Twilio webhooks to your production URL.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/calls/incoming` | Twilio call webhook — routes or screens |
| `POST` | `/calls/status` | Twilio call status callback |
| `POST` | `/voicemail/receive` | Twilio voicemail recording webhook |
| `GET` | `/voicemail` | List all voicemails |
| `GET` | `/contacts` | List all trusted contacts |
| `POST` | `/contacts` | Add a trusted contact |
| `DELETE` | `/contacts/:id` | Remove a trusted contact |
| `GET` | `/health` | Health check |

## Roadmap

- [ ] Voicemail transcription via OpenAI Whisper
- [ ] SMS/push notification when new voicemail arrives
- [ ] Dashboard UI (React) to manage contacts & review voicemails
- [ ] Call summary & sentiment from Retell post-call analysis
- [ ] Multi-user support
- [ ] Stripe billing for SaaS tier

## License

Private — all rights reserved.
