/**
 * ============================================================================
 * 👥 USER & TEAM HIERARCHY MODEL DEFINITIONS
 * ============================================================================
 * Represents CRM users, branch office assignments, manager reporting lines,
 * and role-based access permissions.
 * ============================================================================
 */

export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TEAM_LEAD' | 'FIELD_AGENT';
export type UserStatus = 'ACTIVE' | 'ON_LEAVE' | 'OFFLINE';

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone_number: string; // Leg 1 target for Exotel Cloud Telephony click-to-call bridge
  role: UserRole;
  reports_to_user_id?: string; // FK to Manager / Team Lead for reporting hierarchy
  branch_location: string;
  status: UserStatus;
  created_at?: Date;
  updated_at?: Date;
}
