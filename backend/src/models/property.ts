/**
 * ============================================================================
 * 🏢 PROPERTY & INVENTORY UNIT MODEL DEFINITIONS
 * ============================================================================
 * Represents real estate projects, towers, builder details, and individual
 * inventory units (e.g., A-402, 3 BHK) with dynamic pricing and status.
 * ============================================================================
 */

export interface Property {
  id: string;
  tenant_id: string;
  name: string; // Project / Tower Name
  location: string;
  builder?: string;
  custom_data: Record<string, any>; // {"rera_no": "P521000...", "amenities": ["Pool", "Gym"]}
  created_at?: Date;
}

export type UnitStatus = 'Available' | 'Blocked' | 'Under Offer' | 'Sold';

export interface PropertyUnit {
  id: string;
  tenant_id: string;
  property_id: string;
  unit_number: string; // e.g., "A-402"
  type: string; // e.g., "3 BHK", "Penthouse"
  price: number;
  carpet_area_sqft?: number;
  status: UnitStatus;
  custom_data: Record<string, any>;
  created_at?: Date;
}
