/**
 * ============================================================================
 * 📜 TIMELINE EVENTS & MESSAGE TEMPLATE MODEL DEFINITIONS
 * ============================================================================
 * Links audit events, call recordings, and WhatsApp messages to universal
 * module_records via `record_id`.
 * ============================================================================
 */

export type TimelineEventType =
  | 'note'
  | 'call'
  | 'wa_sent'
  | 'wa_received'
  | 'stage_change'
  | 'portal_re_inquiry'
  | 'system_merge';

export interface TimelineEvent {
  id: string;
  tenant_id: string;
  record_id?: string; // Links to ANY module record (Lead, Property, Client, Deal)
  user_id?: string;
  event_type: TimelineEventType;
  content: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export type MessageChannel = 'whatsapp' | 'sms' | 'email';
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface MessageTemplate {
  id: string;
  tenant_id: string;
  channel: MessageChannel;
  template_name: string;
  external_template_id?: string;
  content_script: string;
  variables: string[];
  status: TemplateStatus;
  created_at?: Date;
}
