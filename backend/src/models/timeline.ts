/**
 * ============================================================================
 * 📜 TIMELINE EVENTS & MESSAGE TEMPLATE MODEL DEFINITIONS
 * ============================================================================
 * Represents immutable audit logs for call recordings, WhatsApp messages,
 * stage transitions, notes, and TRAI/Meta approved messaging templates.
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
  lead_id?: string;
  user_id?: string;
  event_type: TimelineEventType;
  content: string; // Note text or message body snippet
  metadata: Record<string, any>; // {"duration": 184, "call_sid": "...", "waba_id": "...", "old_stage": "New"}
  created_at: Date;
}

export type MessageChannel = 'whatsapp' | 'sms' | 'email';
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface MessageTemplate {
  id: string;
  tenant_id: string;
  channel: MessageChannel;
  template_name: string;
  external_template_id?: string; // Meta WABA Template ID or Indian TRAI DLT SMS Template ID
  content_script: string;
  variables: string[]; // e.g., ["buyer_name", "project_name", "agent_phone"]
  status: TemplateStatus;
  created_at?: Date;
}
