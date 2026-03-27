import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Gisteren';
  } else if (days < 7) {
    return date.toLocaleDateString('nl-NL', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }
}

export function formatDateFull(dateString: string): string {
  return new Date(dateString).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

export const STATUS_LABELS: Record<string, string> = {
  TO_ANSWER: 'Nog te antwoorden',
  ANSWERED: 'Beantwoord',
  CONSULTATION_PLANNED: 'Overleg gepland',
  GO: 'Gaan we doen',
  NO_GO: 'Gaat niet door',
  ARCHIVE: 'Archief',
};

export const STATUS_COLORS: Record<string, string> = {
  TO_ANSWER: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
  ANSWERED: 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
  CONSULTATION_PLANNED: 'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
  GO: 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/40',
  NO_GO: 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/40',
  ARCHIVE: 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/40',
};
