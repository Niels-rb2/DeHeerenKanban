import { google } from 'googleapis';

export function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

export function decodeBase64(encoded: string): string {
  const buff = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buff.toString('utf-8');
}

export function extractEmailBody(payload: any): { plain: string | null; html: string | null } {
  let plain: string | null = null;
  let html: string | null = null;

  function traverse(part: any) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plain = decodeBase64(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html = decodeBase64(part.body.data);
    }
    if (part.parts) {
      part.parts.forEach(traverse);
    }
  }

  traverse(payload);
  return { plain, html };
}

export function parseEmailAddress(header: string): { name: string; email: string } {
  const match = header.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: '', email: header.trim() };
}

export const CAFE_EMAIL = 'info@cafedeheeren.nl';
export const GMAIL_LABEL = 'Besloten feestje';
export const FRAMER_EMAIL = 'noreply@framer.com';

/**
 * Parse a Framer form notification email.
 * Extracts customer name, email, phone, and request text from HTML body.
 */
export function parseFramerNotification(html: string): {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  request: string | null;
} {
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/[\u200B\u00AD\u034F\u2007\u200C\u200D\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  const emailMatch = text.match(/E-?mailadres[:\s]+([^\s,]+@[^\s,]+)/i);
  const firstNameMatch = text.match(/Voornaam[:\s]+([A-Za-zÀ-ÿ&\s\-\.]+?)(?=\s*(?:Achternaam|E-?mailadres|Telefoonnummer|Beschrijf|$))/i);
  const lastNameMatch = text.match(/Achternaam[:\s]+([A-Za-zÀ-ÿ\s\-\.]+?)(?=\s*(?:E-?mailadres|Telefoonnummer|Beschrijf|$))/i);
  const phoneMatch = text.match(/Telefoonnummer[:\s]+([\d\s\+\-()]{8,})/i);
  const requestMatch = text.match(/Beschrijf[^:]*:[:\s]+([\s\S]+?)(?=This email is a submission|support@framer\.com|Not expecting this|$)/i);

  return {
    firstName: firstNameMatch?.[1]?.trim() || null,
    lastName: lastNameMatch?.[1]?.trim() || null,
    email: emailMatch?.[1]?.trim() || null,
    phone: phoneMatch?.[1]?.trim() || null,
    request: requestMatch?.[1]?.trim() || null,
  };
}

/**
 * Is this Gmail message an *original* Framer website-form submission?
 *
 * We deliberately DON'T match on subject alone — replies in a Framer thread
 * carry "Re: Aanvraag Besloten Feestje" and would be falsely flagged. Instead:
 *  - sender is noreply@framer.com (classic case), OR
 *  - subject matches our form AND the body contains the Framer footer
 *    ("support@framer.com" / "submission of a Framer form"), which replies
 *    do not have.
 */
export function isFramerSubmission(
  fromEmail: string,
  subject: string,
  body?: string
): boolean {
  if (fromEmail.toLowerCase() === FRAMER_EMAIL.toLowerCase()) return true;
  const subjectMatches = /aanvraag\s+besloten\s+feestje/i.test(subject);
  if (!subjectMatches) return false;
  const bodyHasFramerFooter =
    !!body &&
    (/support@framer\.com/i.test(body) ||
      /submission of a Framer form/i.test(body) ||
      /This email is a submission/i.test(body));
  return bodyHasFramerFooter;
}
