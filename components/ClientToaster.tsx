'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

/**
 * Wraps sonner's Toaster so it only renders after hydration.
 * This avoids the Next.js 16 Turbopack warning about <script> tags
 * inside React components (sonner injects one internally).
 */
export function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Toaster richColors closeButton position="bottom-right" />;
}
