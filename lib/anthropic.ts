import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  const response = await client.messages.create({
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
