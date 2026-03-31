import { supabaseAdmin } from '@/lib/supabase';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Demo mode dummy data
const demoDummyEvents = {
  '1': {
    id: '1',
    gmail_thread_id: 'thread-1',
    sender_name: 'Jan Jansen',
    sender_email: 'jan@example.com',
    occasion_type: 'verjaardag',
    event_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '19:00',
    end_time: '23:00',
    guest_count: 30,
    special_notes: 'Graag vegetarisch menu',
    ai_summary: 'Verjaardagsfeest voor 30 personen op 10 april, vegetarisch',
    status: 'TO_ANSWER',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
  '2': {
    id: '2',
    gmail_thread_id: 'thread-2',
    sender_name: 'Maria Rodriguez',
    sender_email: 'maria@example.com',
    occasion_type: 'receptie',
    event_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '17:00',
    end_time: '20:00',
    guest_count: 50,
    special_notes: null,
    ai_summary: 'Receptie voor 50 personen',
    status: 'ANSWERED',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
  '3': {
    id: '3',
    gmail_thread_id: 'thread-3',
    sender_name: 'Peter Wilders',
    sender_email: 'peter@example.com',
    occasion_type: 'diner',
    event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '19:30',
    end_time: '22:00',
    guest_count: 12,
    special_notes: 'Alleen glutenvrij',
    ai_summary: 'Bedrijfsdiner voor 12 personen, glutenvrij',
    status: 'GO',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
};

// Helper: create a date N days ago at a specific time
function daysAgo(days: number, time = '10:00'): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [h, m] = time.split(':');
  d.setHours(parseInt(h), parseInt(m), 0, 0);
  return d.toISOString();
}

const demoDummyMessages: Record<string, Array<{
  id: string; thread_id: string; from_name: string; from_email: string;
  body_plain: string; date: string; direction: 'INBOUND' | 'OUTBOUND';
}>> = {
  // ── Thread 1: Jan Jansen — volledige lifecycle ──
  'thread-1': [
    {
      id: 'msg-1a', thread_id: 'thread-1',
      from_name: 'Jan Jansen', from_email: 'jan@example.com',
      date: daysAgo(14, '09:12'),
      direction: 'INBOUND',
      body_plain: `Beste Café De Heeren,

Via jullie website wil ik graag een besloten feestje aanvragen. Mijn vrouw wordt 50 en dat willen we groots vieren!

Datum: zaterdag 10 april 2026
Aantal gasten: circa 30 personen
Tijdstip: vanaf 19:00 uur
Dieetwensen: graag een volledig vegetarisch menu

Kunnen jullie mij meer informatie sturen over de mogelijkheden en kosten?

Met vriendelijke groet,
Jan Jansen`,
    },
    {
      id: 'msg-1b', thread_id: 'thread-1',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(13, '11:30'),
      direction: 'OUTBOUND',
      body_plain: `Beste Jan,

Wat leuk dat jullie het 50e verjaardag van je vrouw bij ons willen vieren! Daar maken we graag iets moois van.

Voor 30 personen op zaterdagavond hebben we de volgende opties:

ARRANGEMENT A — Borrel & Bites (€32,50 p.p.)
• 3 uur onbeperkt drinken (bier, wijn, fris)
• 6 verschillende vegetarische borrelhapjes
• Inclusief gebruik van de zaal

ARRANGEMENT B — Diner & Feest (€52,50 p.p.)
• 3-gangen vegetarisch diner
• 4 uur onbeperkt drinken
• DJ tot 01:00 uur
• Inclusief gebruik van de zaal

EXTRA OPTIES:
• DJ + zanger: €450
• Fotograaf (2 uur): €350
• Candy table: €175
• Versiering door ons team: €150

De zaal is op 10 april nog beschikbaar. Ik houd hem alvast voor jullie vast tot vrijdag.

Zullen we een afspraak maken om alles door te nemen?

Hartelijke groet,
Suzan – Café De Heeren`,
    },
    {
      id: 'msg-1c', thread_id: 'thread-1',
      from_name: 'Jan Jansen', from_email: 'jan@example.com',
      date: daysAgo(12, '20:15'),
      direction: 'INBOUND',
      body_plain: `Hoi Suzan,

Dank voor de snelle reactie! Arrangement B klinkt perfect, inclusief de DJ + zanger. Mijn vrouw is dol op live muziek.

De fotograaf hoeft niet, dat regelen we zelf. Versiering door jullie team lijkt ons wel fijn, dan kunnen wij van tevoren nog ballonnen en slingers langbrengen.

Kunnen we volgende week woensdag of donderdag even langskomen om alles te bespreken?

Groet,
Jan`,
    },
    {
      id: 'msg-1d', thread_id: 'thread-1',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(11, '09:45'),
      direction: 'OUTBOUND',
      body_plain: `Hoi Jan,

Top! Arrangement B + DJ met zanger + versiering, dat wordt een mooi feest.

Woensdag 26 maart om 15:00 uur past ons goed. Dan laat ik ook even de zaal zien en kunnen we alles in detail doorspreken.

Tot dan!

Groet,
Suzan`,
    },
    {
      id: 'msg-1e', thread_id: 'thread-1',
      from_name: 'Jan Jansen', from_email: 'jan@example.com',
      date: daysAgo(11, '10:02'),
      direction: 'INBOUND',
      body_plain: `Perfect, woensdag 26 maart om 15:00 staat genoteerd. Tot dan!

Jan`,
    },
    {
      id: 'msg-1f', thread_id: 'thread-1',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(7, '16:30'),
      direction: 'OUTBOUND',
      body_plain: `Hoi Jan,

Fijn dat je langs bent geweest! Hierbij een samenvatting van ons gesprek:

BEVESTIGD:
• Datum: zaterdag 10 april 2026, 19:00 – 01:00
• 30 gasten (definitief aantal uiterlijk 3 april doorgeven)
• Arrangement B — Diner & Feest (€52,50 p.p.)
• DJ + zanger (€450)
• Versiering door ons team (€150)
• Jullie leveren zelf ballonnen en slingers aan, uiterlijk vrijdag 9 april

MENU (volledig vegetarisch):
• Voorgerecht: Burrata met geroosterde paprika
• Hoofdgerecht: Risotto met truffel en seizoensgroenten
• Dessert: Tiramisu (huisgemaakt)

TOTAAL GESCHAT: €2.175 (exclusief eventuele extra consumpties)

Aanbetaling van €500 graag vóór 1 april over te maken.

Laat gerust weten als er nog vragen zijn!

Groet,
Suzan`,
    },
    {
      id: 'msg-1g', thread_id: 'thread-1',
      from_name: 'Jan Jansen', from_email: 'jan@example.com',
      date: daysAgo(6, '08:20'),
      direction: 'INBOUND',
      body_plain: `Hoi Suzan,

Alles ziet er goed uit! Aanbetaling maken we vandaag over.

Nog twee dingen:
1. Het definitieve aantal wordt waarschijnlijk 35 i.p.v. 30, mag dat nog?
2. Kunnen we om 17:00 al de zaal in om te versieren?

Groet,
Jan`,
    },
    {
      id: 'msg-1h', thread_id: 'thread-1',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(6, '10:05'),
      direction: 'OUTBOUND',
      body_plain: `Hoi Jan,

Geen probleem! 35 gasten kan prima, ik pas de reservering aan. Het nieuwe totaal wordt dan circa €2.437,50.

Versieren vanaf 17:00 is goed. De zaal is dan leeg en jullie hebben ruim de tijd.

Aanbetaling ontvangen, dank!

Groet,
Suzan`,
    },
  ],

  // ── Thread 2: Maria Rodriguez — offerte fase ──
  'thread-2': [
    {
      id: 'msg-2a', thread_id: 'thread-2',
      from_name: 'Maria Rodriguez', from_email: 'maria@example.com',
      date: daysAgo(5, '14:20'),
      direction: 'INBOUND',
      body_plain: `Goedemiddag,

Ik organiseer een receptie voor het 25-jarig jubileum van ons bedrijf en zoek een geschikte locatie.

Datum: donderdag 17 april 2026
Tijd: 17:00 – 20:00
Aantal gasten: 50 personen
Wensen: staande receptie met hapjes en drankjes, korte speech mogelijkheid met microfoon

Is dit bij jullie mogelijk?

Met vriendelijke groet,
Maria Rodriguez
Office Manager – TechVentures B.V.`,
    },
    {
      id: 'msg-2b', thread_id: 'thread-2',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(4, '10:00'),
      direction: 'OUTBOUND',
      body_plain: `Beste Maria,

Wat een mooie mijlpaal, 25 jaar! Wij hebben zeker ruimte voor een staande receptie met 50 gasten.

Ons receptiearrangement (€27,50 p.p.):
• 3 uur onbeperkt drinken
• 8 stuks luxe borrelhapjes per persoon
• Gebruik van onze geluidsinstallatie met microfoon
• Inclusief zaal en garderobe

Extra optie: live achtergrondmuziek (jazz duo) voor €350.

De zaal is op 17 april beschikbaar. Zal ik een afspraak inplannen zodat u de ruimte kunt bekijken?

Hartelijke groet,
Suzan – Café De Heeren`,
    },
    {
      id: 'msg-2c', thread_id: 'thread-2',
      from_name: 'Maria Rodriguez', from_email: 'maria@example.com',
      date: daysAgo(3, '09:15'),
      direction: 'INBOUND',
      body_plain: `Beste Suzan,

Dat klinkt heel goed! Het jazz duo is een leuk idee, dat bespreek ik even intern.

Ik kan woensdag of donderdag volgende week langskomen om de zaal te bekijken. Heeft u dan een moment?

Met vriendelijke groet,
Maria`,
    },
    {
      id: 'msg-2d', thread_id: 'thread-2',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(3, '11:00'),
      direction: 'OUTBOUND',
      body_plain: `Beste Maria,

Donderdag 3 april om 14:00 past goed. Dan geef ik u een rondleiding en kunnen we de details doorspreken.

Tot dan!

Groet,
Suzan`,
    },
  ],

  // ── Thread 3: Peter Wilders — bevestigd, details afronden ──
  'thread-3': [
    {
      id: 'msg-3a', thread_id: 'thread-3',
      from_name: 'Peter Wilders', from_email: 'peter@example.com',
      date: daysAgo(21, '11:00'),
      direction: 'INBOUND',
      body_plain: `Hallo,

Wij willen graag een bedrijfsdiner organiseren voor ons team. 12 personen, bij voorkeur op donderdag 3 april.

Belangrijk: iedereen eet glutenvrij. Is dat mogelijk bij jullie?

Groet,
Peter Wilders
Directeur – Wilders Consultancy`,
    },
    {
      id: 'msg-3b', thread_id: 'thread-3',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(20, '09:30'),
      direction: 'OUTBOUND',
      body_plain: `Beste Peter,

Uiteraard, glutenvrij is geen probleem. Onze chef heeft ruime ervaring met glutenvrije menu's.

Voor 12 personen bieden wij een privé-diner aan in onze tuinkamer:

DINERARRANGEMENT (€45 p.p.):
• 3-gangen glutenvrij diner
• 3 uur onbeperkt drinken
• Privé-ruimte met eigen bar

Aanvangstijd 19:30, einde rond 22:00. Past dat?

Groet,
Suzan`,
    },
    {
      id: 'msg-3c', thread_id: 'thread-3',
      from_name: 'Peter Wilders', from_email: 'peter@example.com',
      date: daysAgo(19, '15:45'),
      direction: 'INBOUND',
      body_plain: `Hoi Suzan,

Dat klinkt perfect. Graag boeken!

Tijdstip 19:30 is goed. Kunnen wij het menu van tevoren inzien?

Groet,
Peter`,
    },
    {
      id: 'msg-3d', thread_id: 'thread-3',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(18, '10:00'),
      direction: 'OUTBOUND',
      body_plain: `Hoi Peter,

Geboekt! Hierbij het glutenvrije menu:

VOORGERECHT: Carpaccio van rode biet met geitenkaas en pijnboompitten
HOOFDGERECHT: Gebakken zalmfilet met aardappelgratin en seizoensgroenten
DESSERT: Crème brûlée

Eventuele allergieën naast gluten graag uiterlijk 1 april doorgeven.

Groet,
Suzan`,
    },
    {
      id: 'msg-3e', thread_id: 'thread-3',
      from_name: 'Peter Wilders', from_email: 'peter@example.com',
      date: daysAgo(10, '08:30'),
      direction: 'INBOUND',
      body_plain: `Hoi Suzan,

Menu ziet er heerlijk uit! Eén collega is ook lactose-intolerant, is daar een alternatief voor bij het dessert?

Verder: mogen we een beamer aansluiten? We willen een korte presentatie doen tijdens het diner.

Groet,
Peter`,
    },
    {
      id: 'msg-3f', thread_id: 'thread-3',
      from_name: 'Suzan', from_email: 'info@cafedeheeren.nl',
      date: daysAgo(10, '11:15'),
      direction: 'OUTBOUND',
      body_plain: `Hoi Peter,

Voor de lactose-intolerante collega maken we een sorbet als dessert, geen probleem.

Beamer aansluiten kan. In de tuinkamer hangt een scherm, jullie hoeven alleen een laptop mee te nemen. HDMI-kabel is aanwezig.

Tot 3 april!

Groet,
Suzan`,
    },
  ],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Handle demo mode
  if (isDemo) {
    const event = demoDummyEvents[id as keyof typeof demoDummyEvents];
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }
    return Response.json({
      data: {
        ...event,
        messages: demoDummyMessages[event.gmail_thread_id as keyof typeof demoDummyMessages] || [],
      },
    });
  }

  try {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch messages for this event
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', event.gmail_thread_id)
      .order('date', { ascending: true }); // UI reverses to show newest first

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
    }

    return Response.json({
      data: {
        ...event,
        messages: messages || [],
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return Response.json(
      { error: 'Failed to fetch event' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();

    // In demo mode, just return success (don't actually update)
    if (isDemo) {
      return Response.json({ success: true });
    }

    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .update({
        event_date: body.event_date,
        occasion_type: body.occasion_type,
        start_time: body.start_time,
        end_time: body.end_time,
        guest_count: body.guest_count,
        special_notes: body.special_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error updating event:', error);
    return Response.json(
      { error: 'Failed to update event' },
      { status: 500 }
    );
  }
}
