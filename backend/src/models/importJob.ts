/**
 * ============================================================================
 * 📥 IMPORT JOBS & LEAD ROUTING RULE MODEL DEFINITIONS
 * ============================================================================
 * Represents async bulk spreadsheet migration trackers and round-robin/location
 * portal lead assignment rules.
 * ============================================================================
 */

export type RoutingRuleType = 'ROUND_ROBIN' | 'LOCATION_MATCH' | 'SOURCE_DEDICATED';

export interface LeadRoutingRule {
  id: string;
  tenant_id: string;
  rule_name: string;
  rule_type: RoutingRuleType;
  source_filter?: string; // e.g., '99acres', 'MagicBricks'
  active_user_ids: string[]; // Rotational list of agent UUIDs
  last_assigned_index: number;
  is_active: boolean;
  created_at?: Date;
}

export type ImportJobStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export interface ImportJob {
  id: string;
  tenant_id: string;
  user_id?: string;
  file_name: string;
  file_url: string;
  status: ImportJobStatus;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  error_rows: number;
  error_log_url?: string;
  created_at?: Date;
  updated_at?: Date;
}
