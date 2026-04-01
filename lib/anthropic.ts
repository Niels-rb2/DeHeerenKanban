import Anthropic from '@anthropic-ai/sdk';

function getClient(): Anthropic {
  // Use CDH_ANTHROPIC_KEY to avoid conflict with the SDK which auto-reads
  // ANTHROPIC_API_KEY at import-time (and may get an empty value in Turbopack).
  const key = process.env.CDH_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('No Anthropic API key found. Set CDH_ANTHROPIC_KEY in .env.local');
  }
  return new Anthropic({ apiKey: key });
}

export interface ExtractedEventData {
  senderName: string;
  occasionType: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  specialNotes: string | null;
  aiSummary: string | null;
}

// ─── Full-thread extraction types ────────────────────────────────────────────

export interface ThreadMessage {
  direction: 'INBOUND' | 'OUTBOUND';
  from_name: string;
  from_email: string;
  date: string;
  body_plain: string | null;
  body_html: string | null;
  snippet: string;
}

export interface ExtractedThreadData extends ExtractedEventData {
  senderEmail: string | null;
  statusHint: 'TO_ANSWER' | 'ANSWERED' | 'CONSULTATION_PLANNED' | 'GO' | 'NO_GO';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanEmailBody(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    // Skip quoted lines at the end
    if (line.trimStart().startsWith('>')) continue;
    // Stop at signature markers
    if (/^(--|Met vriendelijke groet|Kind regards|Verzonden vanuit|Verstuurd vanaf|Sent from|_{3,}|Op \d)/.test(line.trim())) break;
    cleaned.push(line);
  }
  return cleaned.join('\n').trim();
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/[\u200B\u00AD\u034F\u2007\u200C\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function buildConversationText(messages: ThreadMessage[]): string {
  const sorted = [...messages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const formatted = sorted.map((msg) => {
    const label = msg.direction === 'INBOUND' ? 'KLANT' : 'CAFÉ';
    const dateStr = formatDate(msg.date);

    let body = msg.body_plain || '';
    if (!body && msg.body_html) {
      body = htmlToPlainText(msg.body_html);
    }
    if (!body) body = msg.snippet || '';

    body = cleanEmailBody(body);

    // Cap individual message at 2000 chars
    if (body.length > 2000) body = body.substring(0, 2000) + '...';

    return `[${label}] ${msg.from_name} (${dateStr}):\n${body}`;
  });

  let result = formatted.join('\n\n---\n\n');

  // Cap total at ~12000 chars
  if (result.length > 12000 && formatted.length > 4) {
    const first2 = formatted.slice(0, 2).join('\n\n---\n\n');
    const last2 = formatted.slice(-2).join('\n\n---\n\n');
    const middle = sorted.slice(2, -2).map((m) => {
      const label = m.direction === 'INBOUND' ? 'KLANT' : 'CAFÉ';
      return `[${label}] ${m.from_name} (${formatDate(m.date)}): ${m.snippet || '(geen tekst)'}`;
    }).join('\n');
    result = `${first2}\n\n--- (tussenliggende berichten samengevat) ---\n${middle}\n\n---\n\n${last2}`;
  }

  return result;
}

// ─── Full-thread extraction ──────────────────────────────────────────────────

export async function extractEventDataFromThread(
  messages: ThreadMessage[],
  today: string = new Date().toISOString().split('T')[0],
): Promise<ExtractedThreadData> {
  const conversation = buildConversationText(messages);

  const systemPrompt = `Je bent een expert in het analyseren van e-mailgesprekken voor Café De Heeren.

BELANGRIJK OVER DATUMS:
- Berichten hebben een verzenddatum, bijv. "(14 sep 2024)". Dit is de VERZENDDATUM.
- Het JAAR van de eventdatum moet je AFLEIDEN uit het jaar van de verzenddatum.
- "zaterdag 12 oktober" in bericht van september 2024 = eventDate: "2024-10-12"
- "3 januari" in bericht van december 2024 = eventDate: "2025-01-03"
- "28 november" in bericht van maart 2026 = eventDate: "2026-11-28"
- Als NERGENS een datum wordt genoemd, gebruik null.

Retourneer ALLEEN een JSON-object:
{
  "senderName": "naam klant (niet café)",
  "senderEmail": "klant email (niet framer/elfsight/café) of null",
  "occasionType": "verjaardag|receptie|borrel|diner|diner_borrel|bruiloft|jubileum|besloten_feest|bedrijfsfeest|bedrijfspubquiz|anders of null",
  "eventDate": "YYYY-MM-DD of null",
  "startTime": "HH:MM of null",
  "endTime": "HH:MM of null",
  "guestCount": nummer of null,
  "specialNotes": "alle bijzonderheden en specifieke wensen, of null",
  "aiSummary": "samenvatting als bullet points (zie regels hieronder)",
  "statusHint": "TO_ANSWER|ANSWERED|CONSULTATION_PLANNED|GO|NO_GO"
}

REGELS VOOR specialNotes:
- Verzamel ALLE specifieke wensen, verzoeken en bijzonderheden uit het HELE gesprek.
- Denk aan: eten/drinken wensen (bittergarnituur, kaasplankjes, taart), muziek (eigen Spotify lijst, DJ), decoratie, dieetwensen, speciale verzoeken (patatje, eigen zakjes), tijdsindeling, etc.
- Als de klant iets wijzigt (bijv. "ipv kaasplankjes liever extra bittergarnituur"), noteer dan de DEFINITIEVE wens.
- Elke wens op een aparte regel, voorafgegaan door "• ".
- Voorbeeld: "• 3x bittergarnituur (ipv 2x bitter + kaasplankjes)\n• Patatje aan het einde, met eigen zakje\n• Eigen Spotify playlist"

REGELS VOOR aiSummary:
- Geef een opsomming van de BELANGRIJKSTE feiten als bullet points.
- Begin elke bullet met "• ".
- Neem op: gelegenheid, datum, tijdstip (begin-eind), aantal personen, alle bijzonderheden/wensen, en de huidige status/uitkomst van het gesprek.
- BELANGRIJK: Gebruik ALTIJD "Café De Heeren" in plaats van "café" of "Café". Nooit alleen "café" schrijven.
- Voorbeeld:
  "• Verjaardagsborrel op zaterdag 15 maart 2025\n• 18:00 – 22:00, 35 personen\n• 3x bittergarnituur, patatje aan het einde met eigen zakje\n• Eigen Spotify playlist\n• Café De Heeren heeft bevestigd, feestje gaat door"

StatusHint:
- TO_ANSWER: Café nog niet gereageerd
- ANSWERED: Café gereageerd, geen datum bevestigd
- CONSULTATION_PLANNED: Kennismaking/bezichtiging gepland
- GO: Bevestigd door beide partijen
- NO_GO: Afgezegd/niet mogelijk/al bezet

senderEmail: echte klant-email, NIET noreply@framer.com, notifications@forms.elfsightmail.com, info@cafedeheeren.nl`;

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Analyseer dit e-mailgesprek:\n\n${conversation}\n\nRetourneer ALLEEN het JSON-object.` }],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Failed to parse Claude response:', textContent.text);
    throw new Error('No JSON found in response');
  }

  return JSON.parse(jsonMatch[0]) as ExtractedThreadData;
}

// ─── Legacy single-message extraction (kept for backward compat) ─────────────

export async function extractEventDataFromEmail(emailBody: string): Promise<ExtractedEventData> {
  const systemPrompt = `Je bent een AI-assistent die e-mails analyseert voor een restaurant-reserveringssysteem.
Extraheer informatie uit de gegeven e-mail en retourneer ALLEEN een JSON-object (geen extra tekst).

JSON-format:
{
  "senderName": "naam van afzender",
  "occasionType": "type feestje (verjaardag, bruiloft, borrel, diner, receptie, etc.) of null",
  "eventDate": "YYYY-MM-DD of null",
  "startTime": "HH:MM of null",
  "endTime": "HH:MM of null",
  "guestCount": nummer of null,
  "specialNotes": "bijzonderheden in één alinea of null",
  "aiSummary": "samenvatting in 3-5 bullet points"
}`;

  const userPrompt = `Analyseer deze e-mail en extraheer de feestgegevens:

${emailBody}

Retourneer ALLEEN het JSON-object, geen extra tekst.`;

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON from response
  let parsed: ExtractedEventData;
  try {
    // Try to extract JSON from response (in case there's extra text)
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Failed to parse Claude response:', textContent.text);
    throw new Error('Failed to parse extracted data');
  }

  return parsed;
}
