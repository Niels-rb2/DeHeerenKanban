import { redirect } from 'next/navigation';

export default function Home() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    redirect('/dashboard');
  }

  redirect('/login');
}
