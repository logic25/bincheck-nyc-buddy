// Complete DOB Complaint Disposition Code Reference
// Source: NYC DOB BIS Complaint Disposition Codes

export interface DispositionInfo {
  code: string;
  label: string;
  description: string;
  category: 'vacate' | 'swo' | 'unsafe' | 'emergency' | 'closure' | 'vacant' | 'enforcement' | 'resolution' | 'referral' | 'inspection' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** If this code sets a property flag, which one */
  setsFlag?: {
    field: string;
    value: boolean;
    typeField?: string;
    typeValue?: string;
  };
  /** If this code rescinds/clears a flag */
  clearsFlag?: {
    field: string;
    typeField?: string;
  };
}

export const DISPOSITION_CODES: Record<string, DispositionInfo> = {
  // === VACATE ORDERS ===
  Y1: { code: 'Y1', label: 'Full Vacate Order Issued', description: 'Full vacate order issued — all occupants must leave', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'full' } },
  Y2: { code: 'Y2', label: 'Vacate Order Rescinded', description: 'Vacate order rescinded — building may be reoccupied', category: 'vacate', severity: 'medium', clearsFlag: { field: 'vacate_order', typeField: 'vacate_type' } },
  Y3: { code: 'Y3', label: 'Partial Vacate Order Issued', description: 'Partial vacate order issued — affected areas must be vacated', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'partial' } },
  Y4: { code: 'Y4', label: 'Partial Vacate Rescinded', description: 'Partial vacate order rescinded', category: 'vacate', severity: 'medium', clearsFlag: { field: 'vacate_order', typeField: 'vacate_type' } },
  ME: { code: 'ME', label: 'Full Vacate Order (Emergency)', description: 'Emergency full vacate order issued', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'full' } },
  MH: { code: 'MH', label: 'Full Vacate Order (Hazardous)', description: 'Hazardous condition full vacate order', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'full' } },
  MF: { code: 'MF', label: 'Partial Vacate Order (Emergency)', description: 'Emergency partial vacate order issued', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'partial' } },
  MI: { code: 'MI', label: 'Partial Vacate Order (Hazardous)', description: 'Hazardous condition partial vacate order', category: 'vacate', severity: 'critical', setsFlag: { field: 'vacate_order', value: true, typeField: 'vacate_type', typeValue: 'partial' } },

  // === STOP WORK ORDERS ===
  A3: { code: 'A3', label: 'Full Stop Work Order Issued', description: 'Full stop work order issued — all work must cease', category: 'swo', severity: 'critical', setsFlag: { field: 'stop_work_order', value: true, typeField: 'swo_type', typeValue: 'full' } },
  L1: { code: 'L1', label: 'Partial Stop Work Order Issued', description: 'Partial stop work order issued', category: 'swo', severity: 'critical', setsFlag: { field: 'stop_work_order', value: true, typeField: 'swo_type', typeValue: 'partial' } },
  L2: { code: 'L2', label: 'Stop Work Order Rescinded', description: 'Stop work order rescinded — work may resume', category: 'swo', severity: 'medium', clearsFlag: { field: 'stop_work_order', typeField: 'swo_type' } },
  L3: { code: 'L3', label: 'Partial SWO Rescinded', description: 'Partial stop work order rescinded', category: 'swo', severity: 'medium', clearsFlag: { field: 'stop_work_order', typeField: 'swo_type' } },
  U4: { code: 'U4', label: 'Full Stop Work Order (Emergency)', description: 'Emergency full stop work order', category: 'swo', severity: 'critical', setsFlag: { field: 'stop_work_order', value: true, typeField: 'swo_type', typeValue: 'full' } },
  U5: { code: 'U5', label: 'Partial Stop Work Order (Emergency)', description: 'Emergency partial stop work order', category: 'swo', severity: 'critical', setsFlag: { field: 'stop_work_order', value: true, typeField: 'swo_type', typeValue: 'partial' } },
  H3: { code: 'H3', label: 'SWO Violation Noted', description: 'Violation of stop work order noted', category: 'swo', severity: 'critical' },
  H4: { code: 'H4', label: 'SWO Violation — Work Stopped', description: 'Violation of stop work order — work stopped at time of inspection', category: 'swo', severity: 'high' },
  H5: { code: 'H5', label: 'SWO Issued at Inspection', description: 'Stop work order issued at inspection', category: 'swo', severity: 'critical', setsFlag: { field: 'stop_work_order', value: true, typeField: 'swo_type', typeValue: 'partial' } },

  // === UNSAFE / EMERGENCY ===
  RK: { code: 'RK', label: 'Unsafe Building', description: 'Building declared unsafe', category: 'unsafe', severity: 'critical', setsFlag: { field: 'unsafe_building', value: true } },
  RL: { code: 'RL', label: 'Unsafe Action Completed', description: 'Unsafe building action completed — condition resolved', category: 'unsafe', severity: 'medium', clearsFlag: { field: 'unsafe_building' } },
  RH: { code: 'RH', label: 'Emergency Declaration', description: 'Emergency declaration issued', category: 'emergency', severity: 'critical', setsFlag: { field: 'emergency_declaration', value: true } },
  RI: { code: 'RI', label: 'Emergency Action Taken', description: 'Emergency action taken at property', category: 'emergency', severity: 'critical', setsFlag: { field: 'emergency_declaration', value: true } },
  RJ: { code: 'RJ', label: 'Emergency Action Completed', description: 'Emergency action completed — condition resolved', category: 'emergency', severity: 'medium', clearsFlag: { field: 'emergency_declaration' } },
  Q1: { code: 'Q1', label: 'Compromised Structure', description: 'Building structurally compromised (LL33/08)', category: 'unsafe', severity: 'critical', setsFlag: { field: 'compromised_structure', value: true } },
  Q4: { code: 'Q4', label: 'Compromised Structure Remedied', description: 'Structural compromise remedied', category: 'unsafe', severity: 'medium', clearsFlag: { field: 'compromised_structure' } },

  // === CLOSURE / PADLOCK ===
  P3: { code: 'P3', label: 'Closure/Padlock Order', description: 'Closure or padlock order issued', category: 'closure', severity: 'critical', setsFlag: { field: 'closure_order', value: true } },
  P4: { code: 'P4', label: 'Closure Order Rescinded', description: 'Closure or padlock order rescinded', category: 'closure', severity: 'medium', clearsFlag: { field: 'closure_order' } },

  // === VACANT STRUCTURE ===
  A6: { code: 'A6', label: 'Vacant/Unguarded Structure', description: 'Building is vacant and unguarded', category: 'vacant', severity: 'high', setsFlag: { field: 'vacant_structure', value: true } },

  // === ENFORCEMENT / RESOLUTION ===
  A1: { code: 'A1', label: 'Condition Corrected', description: 'Condition corrected at time of inspection', category: 'resolution', severity: 'low' },
  A2: { code: 'A2', label: 'No Violation Warranted', description: 'No violation warranted at time of inspection', category: 'resolution', severity: 'low' },
  A4: { code: 'A4', label: 'Summons Issued', description: 'Summons/violation issued', category: 'enforcement', severity: 'high' },
  A5: { code: 'A5', label: 'Warning Letter Sent', description: 'Warning/notice letter sent to owner', category: 'enforcement', severity: 'medium' },
  A7: { code: 'A7', label: 'Permit Revoked', description: 'Permit revoked', category: 'enforcement', severity: 'high' },
  A8: { code: 'A8', label: 'Violation Dismissed', description: 'Violation dismissed', category: 'resolution', severity: 'low' },
  A9: { code: 'A9', label: 'No Access — Rescheduled', description: 'No access at time of inspection — rescheduled', category: 'inspection', severity: 'low' },
  C1: { code: 'C1', label: 'Complaint Not Warranted', description: 'Complaint conditions not found/not warranted', category: 'resolution', severity: 'low' },
  C2: { code: 'C2', label: 'No Violations Found', description: 'No violations or conditions found', category: 'resolution', severity: 'low' },
  C3: { code: 'C3', label: 'Referred to Another Agency', description: 'Referred to another agency', category: 'referral', severity: 'low' },
  I1: { code: 'I1', label: 'In Progress — Monitoring', description: 'Complaint in progress, being monitored', category: 'inspection', severity: 'medium' },
  I2: { code: 'I2', label: 'Inspection Pending', description: 'Inspection pending/scheduled', category: 'inspection', severity: 'low' },
  I3: { code: 'I3', label: 'Inspection Closed', description: 'Inspection complete, complaint closed', category: 'resolution', severity: 'low' },
};

export function decodeDispositionCode(code: string | null | undefined): DispositionInfo | null {
  if (!code) return null;
  return DISPOSITION_CODES[code.trim().toUpperCase()] || null;
}

/** Property flag fields that can be set by disposition codes */
export const PROPERTY_FLAG_FIELDS = [
  'vacate_order', 'vacate_type',
  'stop_work_order', 'swo_type',
  'unsafe_building',
  'emergency_declaration',
  'compromised_structure',
  'closure_order',
  'vacant_structure',
] as const;

export type PropertyFlagField = typeof PROPERTY_FLAG_FIELDS[number];

/** Banner configuration for each property flag */
export interface PropertyBanner {
  field: string;
  typeField?: string;
  label: string;
  fullLabel?: string;
  partialLabel?: string;
  icon: string;
  level: 'red' | 'amber';
  explanation: string;
}

export const PROPERTY_BANNERS: PropertyBanner[] = [
  {
    field: 'vacate_order',
    typeField: 'vacate_type',
    label: 'VACATE ORDER',
    fullLabel: 'FULL VACATE ORDER',
    partialLabel: 'PARTIAL VACATE ORDER',
    icon: '⚠️',
    level: 'amber',
    explanation: 'A Vacate Order requires all occupants to leave the building immediately due to unsafe conditions. The building cannot be reoccupied until DOB rescinds the order.',
  },
  {
    field: 'stop_work_order',
    typeField: 'swo_type',
    label: 'STOP WORK ORDER',
    fullLabel: 'FULL STOP WORK ORDER',
    partialLabel: 'PARTIAL STOP WORK ORDER',
    icon: '🛑',
    level: 'red',
    explanation: 'A Stop Work Order means all construction activity must cease immediately. Continuing work can result in criminal summonses and fines up to $25,000.',
  },
  {
    field: 'unsafe_building',
    label: 'UNSAFE BUILDING',
    icon: '🚨',
    level: 'red',
    explanation: 'This building has been declared unsafe by DOB. Immediate action is required to correct dangerous conditions.',
  },
  {
    field: 'closure_order',
    label: 'CLOSURE/PADLOCK ORDER',
    icon: '🔒',
    level: 'red',
    explanation: 'A Closure or Padlock Order has been issued. The building or portion thereof must remain closed until the order is rescinded.',
  },
  {
    field: 'emergency_declaration',
    label: 'EMERGENCY DECLARATION',
    icon: '⚠️',
    level: 'amber',
    explanation: 'An emergency has been declared at this property. Emergency remediation work may be in progress.',
  },
  {
    field: 'compromised_structure',
    label: 'COMPROMISED STRUCTURE',
    icon: '⚠️',
    level: 'amber',
    explanation: 'This building has been identified as structurally compromised under Local Law 33/08. Structural monitoring and remediation are required.',
  },
  {
    field: 'vacant_structure',
    label: 'VACANT/UNGUARDED STRUCTURE',
    icon: '⚠️',
    level: 'amber',
    explanation: 'This building has been identified as vacant and unguarded. The owner must secure the building to prevent unauthorized entry.',
  },
];
