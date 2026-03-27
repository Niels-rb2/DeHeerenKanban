# Café De Heeren — Feestje Dashboard

Gmail-automatisering voor besloten feestje aanvragen. Filtert e-mails op label **"Besloten feestje"**, groepeert per thread, extraheert afspraakgegevens met AI en toont alles in een Kanban-board.

---

## Snel starten

```bash
# 1. Kopieer env-bestand en vul in
cp .env.example .env.local

# 2. Start development server (poort 3011)
npm run dev
```

Ga naar http://localhost:3011

---

## Demo modus

Zet `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local` om de app te testen zonder Gmail koppeling.
De kanban-board laadt dan 6 voorbeeld-gesprekken.

---

## Omgevingsvariabelen

| Variabele | Beschrijving |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | NextAuth geheime sleutel (min. 32 tekens) |
| `NEXTAUTH_URL` | App URL (bijv. `http://localhost:3011`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |
| `OPENAI_API_KEY` | OpenAI API sleutel (voor AI extractie) |
| `NEXT_PUBLIC_DEMO_MODE` | `true` voor demo-modus |

---

## Google Cloud instellen

1. Ga naar [Google Cloud Console](https://console.cloud.google.com)
2. Maak een nieuw project aan
3. Activeer **Gmail API** en **Google OAuth API**
4. Maak een **OAuth 2.0 Client ID** aan (Web application)
5. Voeg toe aan **Authorized redirect URIs**:
   - `http://localhost:3011/api/auth/callback/google`
   - `https://jouw-domein.nl/api/auth/callback/google`
6. Voeg toe aan **OAuth consent screen scopes**:
   - `openid`, `email`, `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`

---

## Gmail label instellen

Maak in Gmail (info@cafedeheeren.nl) een label aan met exact de naam:
**`Besloten feestje`**

Wijs dit label toe aan alle relevante e-mails/threads.

---

## Database opzetten (Supabase)

1. Open je Supabase project → **SQL Editor**
2. Plak en voer `supabase-schema.sql` uit
3. Kopieer de API-sleutels naar `.env.local`

---

## Routes

| Route | Beschrijving |
|---|---|
| `/dashboard` | Kanban-board met alle gesprekken |
| `/thread/[id]` | Detail van één gesprek + tijdlijn |
| `/dashboard/sync` | Handmatige Gmail sync pagina |
| `/dashboard/settings` | Instellingen |
| `/login` | Google login |
| `/api/gmail/sync` | `POST` — start Gmail sync |
| `/api/extract` | `POST {threadId}` — AI extractie |
| `/api/threads` | `GET` — alle threads (met filters) |
| `/api/threads/[id]` | `GET/PATCH` — lees/update thread |
| `/api/stats` | `GET` — KPI statistieken |

---

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** + Café De Heeren stijlgids
- **NextAuth v5** (Google OAuth)
- **Supabase** (PostgreSQL)
- **Gmail API** (googleapis)
- **OpenAI gpt-4o-mini** (afspraken extractie)
- **Sonner** (toasts)
- **Lucide React** (iconen)
