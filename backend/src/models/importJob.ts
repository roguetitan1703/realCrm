/**
 * ============================================================================
 * 📥 IMPORT JOBS & ROUTING RULE MODEL DEFINITIONS
 * ============================================================================
 * Represents bulk async spreadsheet migration trackers and round-robin/location
 * routing rules applicable across any module.
 * ============================================================================
 */

export type RoutingRuleType = 'ROUND_ROBIN' | 'LOCATION_MATCH' | 'SOURCE_DEDICATED';

export interface RoutingRule {
  id: string;
  tenant_id: string;
  module_key: string; // Applies to any module ('leads', 'support_tickets')
  rule_name: string;
  rule_type: RoutingRuleType;
  source_filter?: string;
  active_user_ids: string[];
  last_assigned_index: number;
  is_active: boolean;
  created_at?: Date;
}

export type ImportJobStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export interface ImportJob {
  id: string;
  tenant_id: string;
  user_id?: string;
  module_key: string; // Migrates Excel rows into any module!
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
