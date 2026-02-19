export interface DOBViolation {
  isn_dob_bis_viol: string;
  violation_type: string;
  violation_category: string;
  violation_type_code: string;
  violation_number: string;
  violation_date: string;
  violation_date_closed?: string;
  disposition_date?: string;
  disposition_comments?: string;
  device_type?: string;
  description?: string;
  ecb_penalty_status?: string;
  severity?: string;
  respondent_name?: string;
  status: string;
}

export interface ECBViolation {
  isn_dob_bis_viol: string;
  ecb_violation_number: string;
  ecb_violation_status: string;
  violation_type: string;
  violation_description: string;
  penalty_balance_due: string;
  amount_paid: string;
  amount_baldue: string;
  infraction_codes: string;
  violation_date: string;
  hearing_date_time?: string;
  hearing_result?: string;
  issuing_office?: string;
  respondent_name?: string;
  severity?: string;
  status: string;
}

export interface HPDViolation {
  violationid: string;
  boroid: string;
  block: string;
  lot: string;
  class: string; // A, B, or C
  inspectiondate: string;
  approveddate?: string;
  originalcertifybydate?: string;
  originalcorrectbydate?: string;
  newcertifybydate?: string;
  newcorrectbydate?: string;
  certifieddate?: string;
  ordernumber?: string;
  novid?: string;
  novdescription?: string;
  novissueddate?: string;
  currentstatusid: string;
  currentstatus: string;
  currentstatusdate: string;
  violationstatus: string;
}

export interface DOBPermit {
  job__: string;
  job_type: string;
  job_status: string;
  job_status_descrp: string;
  filing_date: string;
  filing_status: string;
  permit_type: string;
  permit_status: string;
  permit_status_date?: string;
  work_type?: string;
  applicant_s_first_name?: string;
  applicant_s_last_name?: string;
  owner_s_first_name?: string;
  owner_s_last_name?: string;
  borough?: string;
  block?: string;
  lot?: string;
  bin__?: string;
}

export interface PropertyData {
  bin: string;
  address: string;
  borough: string;
  block: string;
  lot: string;
  dobViolations: DOBViolation[];
  ecbViolations: ECBViolation[];
  hpdViolations: HPDViolation[];
  permits: DOBPermit[];
}

export interface CategoryScore {
  category: string;
  score: number;
  weight: number;
  details: string;
}

export interface ComplianceScore {
  overall: number;
  categories: CategoryScore[];
  riskLevel: 'low' | 'medium' | 'high';
  color: string;
}

export interface SavedReport {
  id: string;
  user_id: string;
  bin: string;
  address: string;
  report_data: PropertyData;
  compliance_score: number;
  risk_level: string;
  created_at: string;
}
