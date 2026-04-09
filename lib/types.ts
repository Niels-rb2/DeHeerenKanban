export type ThreadStatus = 'TO_ANSWER' | 'ANSWERED' | 'CONSULTATION_PLANNED' | 'GO' | 'NO_GO' | 'ARCHIVE';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export interface Thread {
  id: string;
  gmail_thread_id: string;
  subject: string;
  contact_name: string | null;
  contact_email: string;
  last_message_at: string;
  status: ThreadStatus;
  has_unread: boolean;
  assigned_to: string | null;
  extracted_summary: string | null;
  extracted_appointment_json: ExtractedAppointment | null;
  conversion: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface PrivateEventRequest {
  id: string;
  gmail_thread_id: string;
  sender_name: string;
  sender_email: string;
  occasion_type: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  guest_count: number | null;
  special_notes: string | null;
  ai_summary: string | null;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  first_message_at?: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  from_name: string;
  from_email: string;
  to_emails: string[];
  date: string;
  snippet: string;
  body_plain: string | null;
  body_html: string | null;
  direction: MessageDirection;
}

export interface ExtractedAppointment {
  hasAppointment: boolean;
  appointment: {
    date: string | null;
    time: string | null;
    partySize: number | null;
    occasion: 'verjaardag' | 'receptie' | 'borrel' | 'diner' | 'trouwerij' | 'anders' | null;
    notes: string | null;
  };
  statusHint: ThreadStatus;
  confidence: number;
  keyEvidence: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface KPIStats {
  total: number;
  todoReply: number;
  appointmentSet: number;
  conversionRate: number;
  cancelled: number;
}
