import OpenAI from 'openai';
import { ExtractedAppointment } from './types';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function extractAppointmentFromThread(
  messages: Array<{ direction: string; body_plain: string | null; snippet: string; date: string; from_name: string; from_email: string }>
): Promise<ExtractedAppointment> {
  const today = new Date().toISOString().split('T')[0];

  const conversation = messages
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(m => `[${m.direction === 'INBOUND' ? 'KLANT' : 'CAFÉ'}] ${m.from_name || m.from_email} (${m.date.split('T')[0]}):\n${m.body_plain || m.snippet}`)
    .join('\n\n---\n\n');

  const prompt = `Je bent een expert in het analyseren van e-mailgesprekken voor Café De Heeren in Amsterdam.
Vandaag is het: ${today}

Analyseer dit e-mailgesprek over een besloten feestje en geef het resultaat terug als strikt JSON.

GESPREK:
${conversation}

Geef ALLEEN dit JSON terug, geen uitleg:
{
  "hasAppointment": boolean,
  "appointment": {
    "date": "YYYY-MM-DD of null",
    "time": "HH:MM of null",
    "partySize": number of null,
    "occasion": "verjaardag|receptie|borrel|diner|trouwerij|anders of null",
    "notes": "string of null"
  },
  "statusHint": "TO_ANSWER|ANSWERED|CONSULTATION_PLANNED|GO|NO_GO",
  "confidence": 0.0-1.0,
  "keyEvidence": ["max 3 korte citaten"]
}

Regels:
- hasAppointment = true als er een datum OF bevestiging is ("staat in agenda", "we hebben gereserveerd", "bevestigd", "afgesproken")
- statusHint = NO_GO als "gaat niet door", "annuleren", "toch niet", "afzeggen", "zeg af"
- statusHint = GO als hasAppointment = true
- statusHint = ANSWERED als café al geantwoord heeft maar nog geen afspraak
- statusHint = TO_ANSWER als laatste bericht van klant is en café nog niet geantwoord heeft
- Zet relatieve data (vrijdag, volgende week) om naar absolute datum
- Verwerk Nederlandse datumnotaties: "8 feb", "a.s. donderdag", "vrijdag 15 maart"`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result as ExtractedAppointment;
  } catch (error) {
    console.error('Extraction error:', error);
    return {
      hasAppointment: false,
      appointment: { date: null, time: null, partySize: null, occasion: null, notes: null },
      statusHint: 'TO_ANSWER',
      confidence: 0,
      keyEvidence: [],
    };
  }
}
