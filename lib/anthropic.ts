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
  statusHint: 'TO_ANSWER' | 'ANSWERED' | 'CONSULTATION_PLANNED' | 'GO' | 'NO_GO' | 'ARCHIVE';
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

export interface CurrentEventContext {
  specialNotes?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  guestCount?: number | null;
  occasionType?: string | null;
  senderName?: string | null;
  notesUpdatedAt?: string | null;
}

export async function extractEventDataFromThread(
  messages: ThreadMessage[],
  today: string = new Date().toISOString().split('T')[0],
  currentEvent?: CurrentEventContext,
): Promise<ExtractedThreadData> {
  const conversation = buildConversationText(messages);

  // Build context block for manually-entered data (if any)
  const hasCurrentContext = currentEvent && (
    currentEvent.specialNotes ||
    currentEvent.eventDate ||
    currentEvent.startTime ||
    currentEvent.endTime ||
    currentEvent.guestCount ||
    currentEvent.occasionType
  );

  const notesUpdatedStr = currentEvent?.notesUpdatedAt
    ? formatDate(currentEvent.notesUpdatedAt)
    : 'onbekend';

  // Last email date (inbound or outbound) for comparison
  const sortedMsgs = messages.length > 0
    ? [...messages].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];
  const lastEmailDateStr = sortedMsgs.length > 0 ? formatDate(sortedMsgs[0].date) : 'onbekend';

  const contextBlock = hasCurrentContext
    ? `

═══════════════════════════════════════════════
HANDMATIG INGEVOERDE GEGEVENS (laatst bijgewerkt op: ${notesUpdatedStr})
Deze info komt uit persoonlijk contact, telefoongesprek of bezoek met de klant:
${currentEvent?.occasionType ? `- Gelegenheid: ${currentEvent.occasionType}` : ''}
${currentEvent?.eventDate ? `- Datum: ${currentEvent.eventDate}` : ''}
${currentEvent?.startTime ? `- Begintijd: ${currentEvent.startTime}` : ''}
${currentEvent?.endTime ? `- Eindtijd: ${currentEvent.endTime}` : ''}
${currentEvent?.guestCount ? `- Aantal personen: ${currentEvent.guestCount}` : ''}
${currentEvent?.specialNotes ? `- Bijzonderheden (handmatig genoteerd):\n${currentEvent.specialNotes}` : ''}
═══════════════════════════════════════════════

LAATSTE E-MAIL IN GESPREK: ${lastEmailDateStr}
`
    : '';

  const systemPrompt = `Je bent een expert in het analyseren van e-mailgesprekken voor Café De Heeren.

BELANGRIJK OVER DATUMS:
- Berichten hebben een verzenddatum, bijv. "(14 sep 2024)". Dit is de VERZENDDATUM.
- Het JAAR van de eventdatum moet je AFLEIDEN uit het jaar van de verzenddatum.
- "zaterdag 12 oktober" in bericht van september 2024 = eventDate: "2024-10-12"
- "3 januari" in bericht van december 2024 = eventDate: "2025-01-03"
- "28 november" in bericht van maart 2026 = eventDate: "2026-11-28"
- Als NERGENS een datum wordt genoemd, gebruik null.

${hasCurrentContext ? `COMBINEREN VAN BRONNEN (MEEST RECENTE INFO WINT):
- Je krijgt TWEE bronnen: (1) het e-mailgesprek, (2) handmatig ingevoerde gegevens.
- HARDE REGEL: de MEEST RECENTE informatie is leidend. Vergelijk de datums:
  * "Handmatig bijgewerkt op" = ${notesUpdatedStr}
  * "Laatste e-mail" = ${lastEmailDateStr}
- Als de LAATSTE E-MAIL RECENTER is dan de handmatige update: gebruik de e-mailinfo als waarheid. Als de e-mail een wijziging noemt (bv. "ik wijzig de datum naar X", "toch 55 personen"), dan is dat de laatste stand.
- Als de HANDMATIGE UPDATE RECENTER is dan de laatste e-mail: gebruik de handmatige info als waarheid (dit is info uit een recent telefoon-/persoonlijk gesprek die NIET in de mails staat).
- Bij twijfel: combineer beide intelligent — geen info verliezen.

SPECIFIEK VOOR specialNotes (Bijzonderheden):
- Start met de HANDMATIGE bijzonderheden als basis — deze bevatten meestal uitgebreide info uit persoonlijk contact.
- Werk per detail bij als een RECENTERE e-mail iets wijzigt: "55 personen ipv 49" → pas aan.
- Voeg NIEUWE info uit recentere e-mails toe die nog niet in de handmatige notities stond.
- VERLIES NOOIT detail: als er uitgebreide handmatige info staat (menu, muziek, versiering), neem die volledig over.

` : ''}Retourneer ALLEEN een JSON-object:
{
  "senderName": "naam klant (niet café)",
  "senderEmail": "klant email (niet framer/elfsight/café) of null",
  "occasionType": "verjaardag|receptie|borrel|diner|diner_borrel|bruiloft|jubileum|besloten_feest|bedrijfsfeest|bedrijfspubquiz|themafeest|anders of null",
  "eventDate": "YYYY-MM-DD of null",
  "startTime": "HH:MM of null",
  "endTime": "HH:MM of null",
  "guestCount": nummer of null,
  "specialNotes": "alle bijzonderheden en specifieke wensen, of null",
  "aiSummary": "samenvatting als bullet points (zie regels hieronder)",
  "statusHint": "TO_ANSWER|ANSWERED|CONSULTATION_PLANNED|GO|NO_GO"
}

REGELS VOOR specialNotes:
- Verzamel ALLE specifieke wensen, verzoeken en bijzonderheden uit het HELE gesprek${hasCurrentContext ? ' ÉN de handmatige notities' : ''}.
${hasCurrentContext ? '- NEEM ALLE handmatige bijzonderheden VOLLEDIG over — verlies geen informatie.\n- Vul aan met wensen uit e-mails die NIET in de handmatige notities staan.\n' : ''}- Denk aan: eten/drinken wensen (bittergarnituur, kaasplankjes, taart), muziek (eigen Spotify lijst, DJ), decoratie, dieetwensen, speciale verzoeken (patatje, eigen zakjes), tijdsindeling, fotograaf, versiering, arrangement, etc.
- Als de klant iets wijzigt (bijv. "ipv kaasplankjes liever extra bittergarnituur"), noteer dan de DEFINITIEVE wens.
- Structureer logisch: groepeer per categorie (Tijd, Arrangement, Eten, Muziek, Versiering, etc.) als dat natuurlijk is.
- Gebruik "• " of "- " voor bullets, en lege regels tussen categorieën.

REGELS VOOR aiSummary:
- Geef een opsomming van de BELANGRIJKSTE feiten als bullet points${hasCurrentContext ? ' uit beide bronnen (mails + handmatige notities)' : ''}.
- Begin elke bullet met "• ".
- Neem op: gelegenheid, datum, tijdstip (begin-eind), aantal personen, belangrijkste bijzonderheden/wensen, en de huidige status/uitkomst.
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
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Analyseer dit e-mailgesprek${hasCurrentContext ? ' gecombineerd met de handmatige gegevens' : ''}:\n\n${conversation}${contextBlock}\n\nRetourneer ALLEEN het JSON-object.` }],
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
