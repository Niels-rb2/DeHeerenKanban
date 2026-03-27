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
