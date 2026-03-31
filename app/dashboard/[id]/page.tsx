import { notFound } from 'next/navigation';
import { EventDetailPanel } from '@/components/EventDetailPanel';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch event data from the API
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3011';

  try {
    const response = await fetch(`${baseUrl}/api/private-events/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      notFound();
    }

    const data = await response.json();
    const event = data.data;

    return <EventDetailPanel event={event} />;
  } catch (error) {
    console.error('Error fetching event:', error);
    notFound();
  }
}
