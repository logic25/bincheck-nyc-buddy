import { format } from 'date-fns';
import { getAgencyDisplayName } from '@/lib/violation-utils';
import { decodeComplaintCategory } from '@/lib/complaint-category-decoder';
import { calculateComplianceScore } from '@/lib/scoring';
import type { PropertyData } from '@/types/property';

interface UserProfile {
  email: string | null;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  license_id: string | null;
}

interface DDReportPrintViewProps {
  report: {
    id: string;
    address: string;
    bin: string | null;
    bbl: string | null;
    prepared_for: string;
    prepared_by: string | null;
    report_date: string;
    building_data: any;
    violations_data: any;
    applications_data: any;
    orders_data: any;
    complaints_data?: any;
    acris_data?: any;
    ai_analysis?: string | null;
    general_notes: string | null;
    line_item_notes?: any[];
    customer_concern?: string | null;
    property_status_summary?: string | null;
    tax_lien_data?: any[];
    citisignal_recommended?: boolean;
    agencies_queried?: any[];
    dof_charges_data?: any;
    fuel_tank_data?: any;
    co_data?: any;
    sidewalk_data?: any;
    hpd_erp_data?: any;
    fdny_direct_data?: any;
    fdny_vacate_data?: any;
    fdny_bfp_data?: any;
    external_links?: any;
    generated_at?: string | null;
  };
  userProfile?: UserProfile;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const NAVY = '#1e3a5f';
const CARD_BG = '#fafaf7';
const BORDER = '#e5e7eb';
const MUTED = '#6b7280';
const SERIF = "'Libre Baskerville', Georgia, 'Times New Roman', serif";

const generateReportId = (date: string): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `BC-${year}${month}${day}-${seq}`;
};

const formatShortDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    if (/^\d{8}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return `${month}/${day}/${year.slice(-2)}`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
  } catch {
    return dateStr;
  }
};

const formatBBL = (bbl: string | null | undefined): string => {
  if (!bbl) return '—';
  const clean = bbl.replace(/\D/g, '');
  if (clean.length < 10) return bbl;
  return `${clean.slice(0, 1)}-${clean.slice(1, 6).replace(/^0+/, '') || '0'}-${clean.slice(6, 10).replace(/^0+/, '') || '0'}`;
};

const formatCurrency = (val: any): string => {
  if (!val && val !== 0) return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  return `$${num.toLocaleString()}`;
};

// ─── Tag extraction helpers ────────────────────────────────────────────────
const getItemTag = (note: string): 'action' | 'monitor' | 'clear' => {
  if (!note) return 'clear';
  if (note.includes('[ACTION REQUIRED]')) return 'action';
  if (note.includes('[MONITOR]')) return 'monitor';
  return 'clear';
};

const stripTag = (note: string): string => {
  return note.replace(/\[ACTION REQUIRED\]\s*/g, '').replace(/\[MONITOR\]\s*/g, '').trim();
};

// ─── Component ─────────────────────────────────────────────────────────────
const DDReportPrintView = ({ report, userProfile }: DDReportPrintViewProps) => {
  const violations = (report.violations_data || []).filter((v: any) => !v.hidden);
  const applications = (report.applications_data || []).filter((a: any) => !a.hidden);
  const orders = report.orders_data || { stop_work: [], vacate: [] };
  const allComplaints = (report.complaints_data || []).filter((c: any) => !c.hidden);
  const complaints = allComplaints.filter((c: any) => (c.status || '').toLowerCase() !== 'closed');
  const building = report.building_data || {};
  const acris = report.acris_data || { documents: [], deeds: [], mortgages: [], liens: [] };
  const acrisDocuments = acris.documents || [];
  const dofCharges = report.dof_charges_data || null;
  const fuelTanks = report.fuel_tank_data || null;
  const coData = report.co_data || null;
  const sidewalkData = report.sidewalk_data || null;
  const hpdErp = report.hpd_erp_data || null;
  const fdnyDirect = report.fdny_direct_data || null;
  const fdnyVacate = report.fdny_vacate_data || null;
  const fdnyBfp = report.fdny_bfp_data || null;
  const externalLinks = report.external_links || {};
  const reportId = generateReportId(report.report_date);
  const lineItemNotes = report.line_item_notes || [];

  const notesMap: Record<string, string> = {};
  lineItemNotes.forEach((n: any) => {
    notesMap[`${n.item_type}-${n.item_id}`] = n.note;
  });
  const getNote = (type: string, id: string): string => notesMap[`${type}-${id}`] || '';

  const dobViolations = violations.filter((v: any) => v.agency === 'DOB');
  const ecbViolations = violations.filter((v: any) => v.agency === 'ECB');
  const hpdViolations = violations.filter((v: any) => v.agency === 'HPD');
  const fdnyViolations = violations.filter((v: any) => v.agency === 'FDNY');
  const otherOathViolations = violations.filter((v: any) =>
    ['DEP', 'DOT', 'DSNY', 'LPC', 'DOF'].includes(v.agency)
  );
  const bisApplications = applications.filter((a: any) => a.source === 'BIS');
  const dobNowApplications = applications.filter((a: any) => a.source === 'DOB_NOW');

  const closeoutTaggedCount = applications.filter((a: any) => {
    const status = (a.status || a.status_description || a.permit_status || '').toUpperCase();
    const closedStatuses = ['SIGNED OFF', 'SIGN-OFF', 'SIGNOFF', 'CLOSED', 'COMPLETED', 'COMPLETE', 'X', 'WITHDRAWN', 'DISAPPROVED'];
    return !closedStatuses.some(cs => status.includes(cs));
  }).length;

  const buildPreparedByLine = () => {
    const parts: string[] = [];
    if (report.prepared_by) parts.push(report.prepared_by);
    else if (userProfile?.display_name) parts.push(userProfile.display_name);
    if (userProfile?.company_name) parts.push(userProfile.company_name);
    return parts.join(' · ');
  };

  const buildCredentialsLine = () => {
    const parts: string[] = [];
    if (userProfile?.license_id) parts.push(userProfile.license_id);
    if (userProfile?.email) parts.push(userProfile.email);
    if (userProfile?.phone) parts.push(userProfile.phone);
    return parts.join(' | ');
  };

  const preparedByLine = buildPreparedByLine();
  const credentialsLine = buildCredentialsLine();

  const cleanFloorApt = (floor: string | null | undefined, apt: string | null | undefined): string => {
    const parts: string[] = [];
    if (floor && floor.trim().length > 0 && !['N/A', 'NA', '-', '--'].includes(floor.trim().toUpperCase())) parts.push(floor.trim());
    if (apt && apt.trim().length > 0 && !['N/A', 'NA', '-', '--'].includes(apt.trim().toUpperCase())) parts.push(apt.trim());
    return parts.join(' / ') || '—';
  };

  const isArchitectLikelyNeeded = (v: any): boolean => {
    const desc = (v.description_raw || v.violation_type || '').toLowerCase();
    return desc.includes('illegal conversion') || desc.includes('illegal alteration') ||
      desc.includes('facade') || desc.includes('fisp') || desc.includes('local law 11') ||
      desc.includes('structural') || desc.includes('unauthorized alteration') ||
      desc.includes('change of use') || desc.includes('change of occupancy') ||
      desc.includes('contrary to approved') || desc.includes('professional certification') ||
      (desc.includes('certificate of occupancy') && desc.includes('contrary'));
  };

  const architectTaggedCount = violations.filter(isArchitectLikelyNeeded).length;

  const totalEcbPenalties = ecbViolations.reduce((sum: number, v: any) => {
    const penalty = parseFloat(v.penalty_imposed || v.penalty_amount || 0);
    const paid = parseFloat(v.amount_paid || 0);
    return sum + Math.max(0, penalty - paid);
  }, 0);

  // ─── Compliance Score ────────────────────────────────────────────────────
  const propertyData: PropertyData = {
    bin: report.bin || '',
    address: report.address,
    borough: '',
    block: '',
    lot: '',
    dobViolations: dobViolations.map((v: any) => ({
      isn_dob_bis_viol: v.id || '',
      violation_type: v.violation_type || '',
      violation_category: v.violation_category || '',
      violation_type_code: v.violation_type_code || '',
      violation_number: v.violation_number || '',
      violation_date: v.issued_date || '',
      status: v.status || 'OPEN',
      description: v.description_raw || '',
    })),
    ecbViolations: ecbViolations.map((v: any) => ({
      isn_dob_bis_viol: v.id || '',
      ecb_violation_number: v.violation_number || '',
      ecb_violation_status: v.status || '',
      violation_type: v.violation_type || '',
      violation_description: v.description_raw || '',
      penalty_balance_due: v.penalty_imposed || '0',
      amount_paid: v.amount_paid || '0',
      amount_baldue: v.penalty_imposed || '0',
      infraction_codes: '',
      violation_date: v.issued_date || '',
      status: v.status || 'OPEN',
    })),
    hpdViolations: hpdViolations.map((v: any) => ({
      violationid: v.id || '',
      boroid: '',
      block: '',
      lot: '',
      class: v.violation_class || v.severity || '',
      inspectiondate: v.issued_date || '',
      currentstatusid: '',
      currentstatus: v.status || '',
      currentstatusdate: '',
      violationstatus: v.status || 'OPEN',
    })),
    oathViolations: [...fdnyViolations, ...otherOathViolations].map((v: any) => ({
      ticket_number: v.violation_number || '',
      issuing_agency: v.agency || '',
      violation_date: v.issued_date || '',
      charge_1_code_description: v.description_raw || '',
      penalty_imposed: v.penalty_imposed || '0',
      hearing_status: '',
      hearing_result: '',
      status: v.status || 'OPEN',
    })),
    dobComplaints: complaints.map((c: any) => ({
      complaint_number: c.complaint_number || '',
      date_entered: c.date_entered || '',
      status: c.status || '',
      complaint_category: c.complaint_category || '',
      unit: '',
      description: c.category_description || '',
    })),
    permits: applications.map((a: any) => ({
      job__: a.application_number || a.job_number || '',
      job_type: a.application_type || a.work_type || '',
      job_status: a.status || '',
      job_status_descrp: a.status_description || '',
      filing_date: a.filing_date || '',
      filing_status: '',
      permit_type: '',
      permit_status: a.permit_status || a.status || '',
    })),
  };

  // Derive property flags from orders + report-level fields so the headline
  // risk score can be capped when severe conditions are present.
  const propertyFlags = {
    stop_work_order: (orders.stop_work?.length || 0) > 0 || (orders.partial_stop_work?.length || 0) > 0,
    vacate_order: (orders.vacate?.length || 0) > 0,
    unsafe_building: Boolean((report as any).flags?.unsafe_building),
    closure_order: Boolean((report as any).flags?.closure_order),
    emergency_declaration: Boolean((report as any).flags?.emergency_declaration),
    compromised_structure: Boolean((report as any).flags?.compromised_structure),
    vacant_structure: Boolean((report as any).flags?.vacant_structure),
  };

  const complianceScore = calculateComplianceScore(propertyData, propertyFlags);

  // ─── Extract KEY FINDINGS and MONITOR items from line_item_notes ─────────
  const actionItems: { note: string; agency: string; id: string }[] = [];
  const monitorItems: { note: string; agency: string; id: string }[] = [];

  lineItemNotes.forEach((n: any) => {
    const tag = getItemTag(n.note || '');
    const cleanNote = stripTag(n.note || '');
    if (tag === 'action' && cleanNote) {
      actionItems.push({ note: cleanNote, agency: n.agency || '', id: n.item_id || '' });
    } else if (tag === 'monitor' && cleanNote) {
      monitorItems.push({ note: cleanNote, agency: n.agency || '', id: n.item_id || '' });
    }
  });

  // ─── Styles ──────────────────────────────────────────────────────────────
  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: NAVY,
    borderBottom: `2px solid ${NAVY}`,
    paddingBottom: '6px',
    marginBottom: '16px',
  };

  const tableHeaderStyle = `border border-gray-200 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-800 bg-gray-100`;
  const tableCellStyle = `border border-gray-200 px-2 py-2 text-[11px] align-top text-gray-900`;

  // ─── Score colors ────────────────────────────────────────────────────────
  const getScoreBg = (score: number) => {
    if (score >= 80) return { bg: '#dcfce7', border: '#16a34a', text: '#15803d', label: 'LOW RISK' };
    if (score >= 50) return { bg: '#fef9c3', border: '#ca8a04', text: '#a16207', label: 'MODERATE RISK' };
    return { bg: '#fecaca', border: '#dc2626', text: '#b91c1c', label: 'HIGH RISK' };
  };
  const scoreStyle = getScoreBg(complianceScore.overall);

  // ─── Severity badge ──────────────────────────────────────────────────────
  const renderSeverityBadge = (note: string) => {
    const tag = getItemTag(note);
    if (tag === 'action') {
      return <span style={{ fontSize: '9px', fontWeight: 600, backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '9999px', whiteSpace: 'nowrap' }}>HIGH</span>;
    }
    if (tag === 'monitor') {
      return <span style={{ fontSize: '9px', fontWeight: 600, backgroundColor: '#fef9c3', color: '#92400e', padding: '2px 8px', borderRadius: '9999px', whiteSpace: 'nowrap' }}>MONITOR</span>;
    }
    return <span style={{ fontSize: '9px', fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '9999px', whiteSpace: 'nowrap' }}>CLEAR</span>;
  };

  // ─── Agency Sources ──────────────────────────────────────────────────────
  const aq: any[] = (report as any).agencies_queried || [];
  const queriedAgencies = aq.filter((a: any) => a.queried);

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderViolationGroup = (agencyViolations: any[], agencyName: string) => {
    if (agencyViolations.length === 0) return null;
    return (
      <div className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-center justify-between mb-2">
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: NAVY }}>{agencyName} Violations</h4>
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280', backgroundColor: CARD_BG, padding: '2px 8px', borderRadius: '6px' }}>{agencyViolations.length} items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle} style={{ width: '6%' }}>Priority</th>
              <th className={tableHeaderStyle} style={{ width: '13%' }}>Violation #</th>
              <th className={tableHeaderStyle} style={{ width: '17%' }}>Type / Description</th>
              <th className={tableHeaderStyle} style={{ width: '7%' }}>Severity</th>
              <th className={tableHeaderStyle} style={{ width: '7%' }}>Issued</th>
              <th className={tableHeaderStyle} style={{ width: '6%' }}>Status</th>
              <th className={tableHeaderStyle} style={{ width: '44%' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {agencyViolations.map((v: any, idx: number) => {
              const note = getNote('violation', v.id || v.violation_number);
              return (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                  <td className={tableCellStyle} style={{ textAlign: 'center' }}>
                    {renderSeverityBadge(note)}
                  </td>
                  <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>
                    {v.violation_number}
                    {isArchitectLikelyNeeded(v) && (
                      <span style={{ marginLeft: '4px', fontSize: '8px', fontWeight: 700, color: '#1e40af', backgroundColor: '#dbeafe', padding: '1px 3px', borderRadius: '3px' }}>RA</span>
                    )}
                  </td>
                  <td className={tableCellStyle}>
                    <div style={{ wordBreak: 'break-word' }}>{(v.violation_type || v.description_raw || '—').slice(0, 80)}</div>
                  </td>
                  <td className={tableCellStyle}>{v.severity || v.violation_class || '—'}</td>
                  <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(v.issued_date)}</td>
                  <td className={tableCellStyle}>{v.status}</td>
                  <td className={tableCellStyle} style={{ color: '#1f2937' }}>
                    <div style={{ wordBreak: 'break-word', lineHeight: '1.4' }}>{stripTag(note)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderApplicationsTable = (apps: any[], title: string) => {
    if (apps.length === 0) return null;
    const isBIS = title.includes('BIS');
    return (
      <div className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-center justify-between mb-2">
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: NAVY }}>{title}</h4>
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280', backgroundColor: CARD_BG, padding: '2px 8px', borderRadius: '6px' }}>{apps.length} items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle} style={{ width: '12%' }}>Application #</th>
              <th className={tableHeaderStyle} style={{ width: '8%' }}>Type</th>
              <th className={tableHeaderStyle} style={{ width: '8%' }}>Date Filed</th>
              <th className={tableHeaderStyle} style={{ width: '7%' }}>Status</th>
              <th className={tableHeaderStyle} style={{ width: isBIS ? '10%' : '12%' }}>{isBIS ? 'Filing Professional' : 'Applicant'}</th>
              <th className={tableHeaderStyle} style={{ width: '25%' }}>Description</th>
              <th className={tableHeaderStyle} style={{ width: '30%' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app: any, idx: number) => {
              const appKey = `${app.source || 'BIS'}-${app.id || app.application_number || idx}`;
              const applicantName = isBIS
                ? (app.filing_professional_name || '—')
                : (app.applicant_name || [app.applicant_first_name, app.applicant_last_name].filter(Boolean).join(' ') || '—');
              const note = getNote('application', appKey);
              return (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                  <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>
                    {app.application_number || app.job_number}
                    {(() => {
                      const status = (app.status || app.status_description || app.permit_status || '').toUpperCase();
                      const closedStatuses = ['SIGNED OFF', 'SIGN-OFF', 'SIGNOFF', 'CLOSED', 'COMPLETED', 'COMPLETE', 'X', 'WITHDRAWN', 'DISAPPROVED'];
                      const isOpen = !closedStatuses.some(cs => status.includes(cs));
                      return isOpen ? <span style={{ marginLeft: '4px', fontSize: '8px', fontWeight: 700, color: '#065f46', backgroundColor: '#d1fae5', padding: '1px 3px', borderRadius: '3px' }}>CO</span> : null;
                    })()}
                  </td>
                  <td className={tableCellStyle}>{app.application_type || app.work_type || '—'}</td>
                  <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(app.filing_date || app.issued_date)}</td>
                  <td className={tableCellStyle}>
                    <span style={{ fontSize: '10px' }}>{app.status_description || app.permit_status || app.status || '—'}</span>
                  </td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{applicantName}</td>
                  <td className={tableCellStyle}>
                    <div style={{ wordBreak: 'break-word' }}>{(app.job_description || '—').slice(0, 120)}</div>
                  </td>
                  <td className={tableCellStyle} style={{ color: '#1f2937' }}>
                    <div style={{ wordBreak: 'break-word', lineHeight: '1.4' }}>{stripTag(note)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderComplaintsTable = () => {
    if (!complaints || complaints.length === 0) return null;
    return (
      <section className="mb-8" style={{ pageBreakInside: 'avoid' }}>
        <h3 style={sectionHeaderStyle}>Open DOB Complaints ({complaints.length})</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle}>Complaint #</th>
              <th className={tableHeaderStyle}>Date Filed</th>
              <th className={tableHeaderStyle}>Status</th>
              <th className={tableHeaderStyle}>Category</th>
              <th className={tableHeaderStyle}>Description</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c: any, idx: number) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{c.complaint_number || '—'}</td>
                <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(c.date_entered)}</td>
                <td className={tableCellStyle}>{c.status || '—'}</td>
                <td className={tableCellStyle}>{decodeComplaintCategory(c.complaint_category)}</td>
                <td className={tableCellStyle}>
                  <div style={{ wordBreak: 'break-word' }}>{(c.category_description || decodeComplaintCategory(c.complaint_category)).slice(0, 100)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="print-container bg-white text-black max-w-4xl mx-auto" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: '12px', lineHeight: '1.5', color: '#111827', padding: '32px' }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 1: EXECUTIVE DASHBOARD
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Header */}
      <div style={{ borderBottom: `2px solid ${NAVY}`, paddingBottom: '12px', marginBottom: '24px' }}>
        <div className="flex items-end justify-between">
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: NAVY, letterSpacing: '-0.01em', margin: 0 }}>BinCheckNYC Report</h1>
            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Property Compliance Assessment</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
            <p style={{ margin: 0 }}>Report ID: <span className="font-mono" style={{ fontWeight: 600 }}>{reportId}</span></p>
            <p style={{ margin: 0 }}>{format(new Date(report.report_date), 'MMMM d, yyyy')}</p>
          </div>
        </div>

        {/* Subject Property + Prepared By */}
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>{report.address}</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>
              BIN: <span className="font-mono" style={{ fontWeight: 600 }}>{report.bin || '—'}</span>
              <span style={{ margin: '0 8px', color: '#d1d5db' }}>|</span>
              BBL: <span className="font-mono" style={{ fontWeight: 600 }}>{formatBBL(report.bbl)}</span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Prepared for</p>
            <p style={{ fontSize: '12px', fontWeight: 600, margin: '1px 0 0' }}>{report.prepared_for}</p>
            {preparedByLine && (
              <>
                <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 0 0' }}>Prepared by</p>
                <p style={{ fontSize: '12px', fontWeight: 600, margin: '1px 0 0' }}>{preparedByLine}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Property Status Banners — Vacate / SWO / Unsafe / Closure / Emergency / Compromised / Vacant */}
      {(propertyFlags.vacate_order || propertyFlags.stop_work_order || propertyFlags.unsafe_building || propertyFlags.closure_order || propertyFlags.emergency_declaration || propertyFlags.compromised_structure || propertyFlags.vacant_structure) && (
        <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
          {[
            propertyFlags.vacate_order && { label: 'VACATE ORDER ACTIVE', text: 'All occupants must leave; building cannot be reoccupied until DOB rescinds the order.', level: 'red' as const },
            propertyFlags.stop_work_order && { label: 'STOP WORK ORDER ACTIVE', text: 'Construction activity must cease; continuing work can result in criminal summonses and fines up to $25,000.', level: 'red' as const },
            propertyFlags.unsafe_building && { label: 'UNSAFE BUILDING', text: 'Building declared unsafe by DOB. Immediate corrective action required.', level: 'red' as const },
            propertyFlags.closure_order && { label: 'CLOSURE / PADLOCK ORDER', text: 'Building or portion thereof must remain closed until the order is rescinded.', level: 'red' as const },
            propertyFlags.emergency_declaration && { label: 'EMERGENCY DECLARATION', text: 'Emergency declared at this property; remediation work may be in progress.', level: 'amber' as const },
            propertyFlags.compromised_structure && { label: 'COMPROMISED STRUCTURE (LL33/08)', text: 'Structurally compromised; monitoring and remediation required.', level: 'amber' as const },
            propertyFlags.vacant_structure && { label: 'VACANT / UNGUARDED STRUCTURE', text: 'Owner must secure the building to prevent unauthorized entry.', level: 'amber' as const },
          ].filter(Boolean).map((banner: any, i: number) => (
            <div key={i} style={{
              padding: '12px 16px',
              marginBottom: '8px',
              border: `2px solid ${banner.level === 'red' ? '#dc2626' : '#d97706'}`,
              backgroundColor: banner.level === 'red' ? '#fef2f2' : '#fffbeb',
              borderRadius: '8px',
            }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: banner.level === 'red' ? '#991b1b' : '#92400e' }}>{banner.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', lineHeight: '1.5', color: banner.level === 'red' ? '#7f1d1d' : '#78350f' }}>{banner.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Compliance Risk Score — Hero Card */}
      <div style={{
        backgroundColor: scoreStyle.bg,
        border: `2px solid ${scoreStyle.border}`,
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: scoreStyle.text, margin: 0 }}>Compliance Risk Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '48px', fontWeight: 800, color: scoreStyle.text, lineHeight: 1 }}>{complianceScore.overall}</span>
            <span style={{ fontSize: '20px', fontWeight: 600, color: scoreStyle.text, opacity: 0.7 }}>/ 100</span>
          </div>
          <p style={{ fontSize: '14px', fontWeight: 700, color: scoreStyle.text, marginTop: '4px' }}>{scoreStyle.label}</p>
        </div>
        {/* Category breakdown */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {complianceScore.categories.map((cat) => {
            const catColor = getScoreBg(cat.score);
            return (
              <div key={cat.category} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{cat.category}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: catColor.text, margin: '2px 0 0' }}>{cat.score}</p>
                <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0 }}>/100</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Findings + Items to Monitor */}
      {(actionItems.length > 0 || monitorItems.length > 0) && (
        <div style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
          {actionItems.length > 0 && (
            <div style={{
              flex: monitorItems.length > 0 ? '1' : '1',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '16px 20px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#991b1b', margin: '0 0 8px' }}>Key Findings</p>
              {actionItems.map((item, i) => {
                // Extract first sentence or first ~80 chars as summary
                const summary = item.note.split('.')[0] || item.note.slice(0, 80);
                return (
                  <p key={i} style={{ fontSize: '11px', color: '#7f1d1d', margin: '0 0 4px', lineHeight: '1.4' }}>
                    • {summary}{item.agency ? ` (${item.agency})` : ''}
                  </p>
                );
              })}
            </div>
          )}
          {monitorItems.length > 0 && (
            <div style={{
              flex: '1',
              backgroundColor: '#fefce8',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '16px 20px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#92400e', margin: '0 0 8px' }}>Items to Monitor</p>
              {monitorItems.map((item, i) => {
                const summary = item.note.split('.')[0] || item.note.slice(0, 80);
                return (
                  <p key={i} style={{ fontSize: '11px', color: '#78350f', margin: '0 0 4px', lineHeight: '1.4' }}>
                    • {summary}{item.agency ? ` (${item.agency})` : ''}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Compliance Summary Cards — compact row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Violations', value: violations.length, sub: `DOB ${dobViolations.length} · ECB ${ecbViolations.length} · HPD ${hpdViolations.length}${fdnyViolations.length > 0 ? ` · FDNY ${fdnyViolations.length}` : ''}` },
          { label: 'Applications', value: applications.length, sub: `BIS ${bisApplications.length} · NOW ${dobNowApplications.length}` },
          { label: 'Stop Work', value: orders.stop_work?.length || 0, danger: (orders.stop_work?.length || 0) > 0 },
          { label: 'Vacate', value: orders.vacate?.length || 0, danger: (orders.vacate?.length || 0) > 0 },
        ].map((item, i) => (
          <div key={i} style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: (item as any).danger ? '#fef2f2' : CARD_BG,
            border: `1px solid ${(item as any).danger ? '#fecaca' : BORDER}`,
          }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: (item as any).danger ? '#dc2626' : '#111827' }}>{item.value}</div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
            {item.sub && <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* ECB Penalties callout */}
      {totalEcbPenalties > 0 && (
        <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>
            ECB Penalties Outstanding: {formatCurrency(totalEcbPenalties)}
          </span>
          <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '8px' }}>(typically become property liens)</span>
        </div>
      )}

      {/* Tax Lien Alert */}
      {(report.tax_lien_data || []).length > 0 && (() => {
        const liens = report.tax_lien_data || [];
        const waterOnly = liens.filter((l: any) => l.water_debt_only).length;
        const taxMixed = liens.length - waterOnly;
        return (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '2px solid #dc2626', borderRadius: '8px', marginBottom: '24px', pageBreakInside: 'avoid' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', margin: '0 0 4px' }}>⚠ Tax Lien Sale — Property Flagged</p>
          <p style={{ fontSize: '11px', color: '#7f1d1d', margin: 0, lineHeight: '1.5' }}>
            This property appears on the NYC DOF Tax Lien Sale List with {liens.length} record{liens.length !== 1 ? 's' : ''}
            {waterOnly > 0 && taxMixed > 0 ? ` (${waterOnly} water/sewer·only, ${taxMixed} tax+water/other)` : waterOnly > 0 ? ` (${waterOnly} water/sewer debt only)` : ''}.
            Verify current status directly with DOF before proceeding.
          </p>
        </div>
        );
      })()}

      {/* Sources Checked */}
      {queriedAgencies.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Sources Checked</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {queriedAgencies.map((a: any) => {
              const isError = a.error && a.results === 0;
              const hasData = a.results > 0;
              return (
                <span
                  key={a.agency}
                  style={{
                    display: 'inline-block',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: '6px',
                    ...(hasData
                      ? { backgroundColor: NAVY, color: '#ffffff' }
                      : isError
                        ? { backgroundColor: '#fefce8', color: '#92400e', border: '1px solid #fde68a' }
                        : { backgroundColor: '#ffffff', color: '#6b7280', border: `1px solid ${BORDER}` }
                    ),
                  }}
                >
                  {a.agency}{hasData ? ` (${a.results})` : isError ? ' ⚠' : ' ✓'}
                </span>
              );
            })}
          </div>
          {queriedAgencies.filter((a: any) => a.error && a.results === 0).length > 0 && (
            <p style={{ fontSize: '10px', color: '#92400e', marginTop: '6px' }}>
              ⚠ {queriedAgencies.filter((a: any) => a.error && a.results === 0).length} source(s) returned errors — data may be incomplete.
            </p>
          )}
        </div>
      )}

      {/* Scope of Review */}
      {(report as any).customer_concern && (
        <div style={{ padding: '12px 16px', backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px', fontWeight: 600 }}>Scope of Review</p>
          <p style={{ fontSize: '12px', color: '#374151', fontStyle: 'italic', margin: 0 }}>"{(report as any).customer_concern}"</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 2+: DATA SECTIONS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Force page break after executive dashboard */}
      <div style={{ pageBreakBefore: 'always' }} />

      {/* Property Overview Card */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={sectionHeaderStyle}>Property Overview</h3>
        <div style={{
          backgroundColor: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px 24px', fontSize: '12px' }}>
            {[
              ['Year Built', building.year_built || '—'],
              ['Stories', building.stories || '—'],
              ['Units', building.dwelling_units ?? '—'],
              ['Class', building.building_class || '—'],
              ['Zoning', building.zoning_district || '—'],
              ['Bldg Area', building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sf` : '—'],
              ['Lot Area', building.lot_area_sqft ? `${building.lot_area_sqft.toLocaleString()} sf` : '—'],
              ['Land Use', building.land_use || '—'],
              ['Assessed Value', building.assessed_total_value ? formatCurrency(building.assessed_total_value) : '—'],
              ['Landmark', building.is_landmark ? 'Yes' : building.historic_district ? `Historic — ${building.historic_district}` : 'No'],
            ].map(([label, value], i) => (
              <div key={i} style={{ marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{value}</p>
              </div>
            ))}
          </div>
          {building.owner_name && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</span>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{building.owner_name}</p>
            </div>
          )}
          {(externalLinks.co_lookup || externalLinks.tax_map || externalLinks.dof_account || externalLinks.acris_bbl || externalLinks.bis_property || externalLinks.acris_search || externalLinks.dep_portal || externalLinks.fdny_business_portal) && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agency Lookups</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {externalLinks.co_lookup && (
                  <a href={externalLinks.co_lookup} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>DOB BIS · Certificates of Occupancy</a>
                )}
                {externalLinks.bis_property && (
                  <a href={externalLinks.bis_property} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>DOB BIS · Property Profile</a>
                )}
                {externalLinks.tax_map && (
                  <a href={externalLinks.tax_map} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>DOF · Digital Tax Map</a>
                )}
                {externalLinks.dof_account && (
                  <a href={externalLinks.dof_account} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>DOF · Property Tax Account</a>
                )}
                {externalLinks.acris_bbl && (
                  <a href={externalLinks.acris_bbl} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>ACRIS · Recorded Documents</a>
                )}
                {externalLinks.acris_search && (
                  <a href={externalLinks.acris_search} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>ACRIS · Document Search</a>
                )}
                {externalLinks.dep_portal && (
                  <a href={externalLinks.dep_portal} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>DEP · Water/Sewer Portal</a>
                )}
                {externalLinks.fdny_business_portal && (
                  <a href={externalLinks.fdny_business_portal} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>FDNY Business · Permits/COFs</a>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Conclusion */}
      {report.property_status_summary && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Conclusion</h3>
          <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#111827' }}>
            {report.property_status_summary.split('\n\n').map((paragraph, i) => (
              <p key={i} style={{ margin: '0 0 12px' }}>{paragraph}</p>
            ))}
            {complianceScore.overrideReasons && complianceScore.overrideReasons.length > 0 && (
              <p style={{ margin: '0 0 12px', fontStyle: 'italic', color: '#7f1d1d' }}>
                The headline risk score has been capped due to: {complianceScore.overrideReasons.join('; ')}.
              </p>
            )}
          </div>
          <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: NAVY, margin: 0 }}>BinCheckNYC Analyst Team</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0' }}>Prepared from NYC public records on {report.generated_at ? formatShortDate(report.generated_at) : ''}</p>
          </div>
        </section>
      )}

      {/* Critical Orders */}
      {(orders.stop_work?.length > 0 || orders.vacate?.length > 0 || orders.partial_stop_work?.length > 0) && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={{ ...sectionHeaderStyle, color: '#dc2626', borderBottomColor: '#dc2626' }}>⚠ Active Orders</h3>
          {orders.stop_work?.map((order: any, idx: number) => (
            <div key={`swo-${idx}`} style={{ padding: '12px 16px', marginBottom: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
              <p style={{ fontWeight: 600, fontSize: '12px', color: '#dc2626', margin: '0 0 4px' }}>Stop Work Order — {formatShortDate(order.issued_date)}</p>
              <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}>{order.description || 'No description available'}</p>
            </div>
          ))}
          {orders.partial_stop_work?.map((order: any, idx: number) => (
            <div key={`pswo-${idx}`} style={{ padding: '12px 16px', marginBottom: '8px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', borderRadius: '8px' }}>
              <p style={{ fontWeight: 600, fontSize: '12px', color: '#c2410c', margin: '0 0 4px' }}>Partial Stop Work Order — {formatShortDate(order.issued_date)}</p>
              <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}>{order.description || 'No description available'}</p>
            </div>
          ))}
          {orders.vacate?.map((order: any, idx: number) => (
            <div key={`vacate-${idx}`} style={{ padding: '12px 16px', marginBottom: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
              <p style={{ fontWeight: 600, fontSize: '12px', color: '#dc2626', margin: '0 0 4px' }}>Vacate Order — {formatShortDate(order.issued_date)}</p>
              <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}>{order.description || 'No description available'}</p>
            </div>
          ))}
        </section>
      )}

      {/* Violations by Agency */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={sectionHeaderStyle}>Open Violations ({violations.length})</h3>
        {violations.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#374151', fontStyle: 'italic' }}>No open violations found across all agencies queried.</p>
        ) : (
          <>
            {renderViolationGroup(dobViolations, 'DOB')}
            {renderViolationGroup(ecbViolations, 'ECB')}
            {renderViolationGroup(hpdViolations, 'HPD')}
            {renderViolationGroup(fdnyViolations, 'FDNY')}
            {renderViolationGroup(otherOathViolations, 'Other Agency (OATH)')}
          </>
        )}
        {architectTaggedCount > 0 && (
          <div style={{ marginTop: '16px', padding: '12px 16px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '8px', pageBreakInside: 'avoid' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af', margin: '0 0 4px' }}>Architect Certification Typically Involved</p>
            <p style={{ fontSize: '11px', color: '#374151', lineHeight: '1.6', margin: 0 }}>
              {architectTaggedCount} open violation{architectTaggedCount !== 1 ? 's' : ''} (marked <span style={{ fontWeight: 700, color: '#1e40af', backgroundColor: '#dbeafe', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>RA</span>) {architectTaggedCount !== 1 ? 'are' : 'is'} of a type where DOB has historically accepted or required a licensed architect's certification letter as part of the dismissal process. BinCheckNYC can coordinate architect opinion letters through our professional network.
            </p>
          </div>
        )}
      </section>

      {/* Recommended Actions */}
      {actionItems.length > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Recommended Actions</h3>
          <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '20px' }}>
            <ol style={{ margin: 0, paddingLeft: '20px' }}>
              {actionItems.map((item, i) => (
                <li key={i} style={{ fontSize: '12px', color: '#111827', marginBottom: '8px', lineHeight: '1.5' }}>
                  {item.note.split('.').slice(0, 2).join('.').trim()}{item.id ? ` (${item.id})` : ''}
                </li>
              ))}
            </ol>
            <p style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic', marginTop: '12px', borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
              Estimated resolution timeline: 2–6 weeks (consult with DOB-registered expediter)
            </p>
          </div>
        </section>
      )}

      {/* DOB Complaints */}
      {renderComplaintsTable()}

      {/* Applications */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={sectionHeaderStyle}>Permit Applications ({applications.length})</h3>
        {applications.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#374151', fontStyle: 'italic' }}>No applications found.</p>
        ) : (
          <>
            {renderApplicationsTable(bisApplications, 'BIS Applications')}
            {renderApplicationsTable(dobNowApplications, 'DOB NOW Build Applications')}
          </>
        )}
        {closeoutTaggedCount > 0 && (
          <div style={{ marginTop: '16px', padding: '12px 16px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', borderRadius: '8px', pageBreakInside: 'avoid' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#065f46', margin: '0 0 4px' }}>Permit Closeout May Be Required</p>
            <p style={{ fontSize: '11px', color: '#374151', lineHeight: '1.6', margin: 0 }}>
              {closeoutTaggedCount} application{closeoutTaggedCount !== 1 ? 's' : ''} (marked <span style={{ fontWeight: 700, color: '#065f46', backgroundColor: '#d1fae5', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>CO</span>) {closeoutTaggedCount !== 1 ? 'are' : 'is'} still open and may need to be formally closed out with DOB. Open permits can affect property transfers and new filings. Green Light Expediting can manage the closeout process on your behalf.
            </p>
          </div>
        )}
      </section>

      {/* ACRIS - Property Transfer & Lien History */}
      <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
        <h3 style={sectionHeaderStyle}>Property Transfer & Lien History (ACRIS)</h3>
        {acrisDocuments.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#374151', fontStyle: 'italic' }}>
            No ACRIS records found for this BBL. This may indicate a cooperative or property with records filed under a different lot identifier.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={tableHeaderStyle} style={{ width: '9%' }}>Date</th>
                  <th className={tableHeaderStyle} style={{ width: '15%' }}>Document Type</th>
                  <th className={tableHeaderStyle} style={{ width: '22%' }}>Party 1 (Grantor/Lender)</th>
                  <th className={tableHeaderStyle} style={{ width: '22%' }}>Party 2 (Grantee/Borrower)</th>
                  <th className={tableHeaderStyle} style={{ width: '11%' }}>Amount</th>
                  <th className={tableHeaderStyle} style={{ width: '10%' }}>CRFN</th>
                  <th className={tableHeaderStyle} style={{ width: '11%' }}>Image</th>
                </tr>
              </thead>
              <tbody>
                {acrisDocuments.slice(0, 20).map((doc: any, idx: number) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                    <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(doc.document_date || doc.recorded_datetime)}</td>
                    <td className={tableCellStyle}>{doc.document_type || doc.doc_type || '—'}</td>
                    <td className={tableCellStyle}>
                      <div style={{ wordBreak: 'break-word', fontSize: '10px' }}>{doc.party1 || '—'}</div>
                    </td>
                    <td className={tableCellStyle}>
                      <div style={{ wordBreak: 'break-word', fontSize: '10px' }}>{doc.party2 || '—'}</div>
                    </td>
                    <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>
                      {doc.document_amount ? formatCurrency(doc.document_amount) : '—'}
                    </td>
                    <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '9px' }}>{doc.crfn || doc.reel_page || '—'}</td>
                    <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>
                      {doc.image_view_url ? (
                        <a href={doc.image_view_url} target="_blank" rel="noreferrer" style={{ fontSize: '9px', color: NAVY, textDecoration: 'underline', fontWeight: 600 }}>
                          View PDF
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {acrisDocuments.length > 20 && (
              <p style={{ fontSize: '10px', color: '#374151', marginTop: '6px', fontStyle: 'italic' }}>
                Showing 20 of {acrisDocuments.length} recorded documents. Additional records available upon request.
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
              Source: NYC ACRIS — recorded documents only. Each "View PDF" link opens the agency-direct document image. Unrecorded agreements not included.
            </p>
          </>
        )}
      </section>

      {/* Tax & Sidewalk Charges (DOF) */}
      {dofCharges && (dofCharges.totals?.count > 0 || dofCharges.items?.length > 0) && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Tax & Sidewalk Charges — DOF Account Balance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Outstanding Balance</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: dofCharges.totals.outstanding > 0 ? '#b91c1c' : '#15803d', margin: '4px 0 0' }}>{formatCurrency(dofCharges.totals.outstanding)}</p>
            </div>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Accrued Interest</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>{formatCurrency(dofCharges.totals.interest)}</p>
            </div>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Open Line Items</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>{dofCharges.totals.count}</p>
            </div>
          </div>
          {Object.keys(dofCharges.by_type || {}).length > 0 && (
            <table className="w-full border-collapse" style={{ marginBottom: '12px' }}>
              <thead>
                <tr>
                  <th className={tableHeaderStyle} style={{ width: '15%' }}>Code</th>
                  <th className={tableHeaderStyle} style={{ width: '40%' }}>Charge Type</th>
                  <th className={tableHeaderStyle} style={{ width: '15%' }}>Count</th>
                  <th className={tableHeaderStyle} style={{ width: '15%' }}>Balance</th>
                  <th className={tableHeaderStyle} style={{ width: '15%' }}>Oldest Due</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dofCharges.by_type).map(([code, info]: [string, any], idx: number) => (
                  <tr key={code} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                    <td className={`${tableCellStyle} font-mono`} style={{ fontWeight: 600 }}>{code}</td>
                    <td className={tableCellStyle}>{info.label}</td>
                    <td className={tableCellStyle}>{info.count}</td>
                    <td className={tableCellStyle} style={{ fontWeight: 600 }}>{formatCurrency(info.balance)}</td>
                    <td className={tableCellStyle}>{formatShortDate(info.oldest_due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {dofCharges.items && dofCharges.items.length > 0 && (
            <>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#374151', margin: '8px 0 6px' }}>Line Items (showing {Math.min(dofCharges.items.length, 15)} of {dofCharges.totals.count})</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={tableHeaderStyle}>Due Date</th>
                    <th className={tableHeaderStyle}>Type</th>
                    <th className={tableHeaderStyle}>Tax Yr</th>
                    <th className={tableHeaderStyle}>Balance</th>
                    <th className={tableHeaderStyle}>Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {dofCharges.items.slice(0, 15).map((it: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                      <td className={tableCellStyle}>{formatShortDate(it.due_date)}</td>
                      <td className={tableCellStyle}>{it.code_label}</td>
                      <td className={tableCellStyle}>{it.tax_year || '—'}</td>
                      <td className={tableCellStyle}>{formatCurrency(it.balance)}</td>
                      <td className={tableCellStyle}>{formatCurrency(it.interest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Department of Finance · Outstanding Charges (scjx-j6np). Includes property tax, sidewalk assessment (SAC/SAF), and emergency repair (EMR) charges. Verify current balance at the DOF Property Tax Account portal.
          </p>
        </section>
      )}

      {/* Certificates of Occupancy */}
      {coData && (coData.total > 0 || coData.latest) && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Certificates of Occupancy</h3>
          {coData.latest && (
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', fontSize: '11px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Latest CO</p>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{formatShortDate(coData.latest.issue_date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Type</p>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{coData.latest.issue_type || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Job Number</p>
                  <p className="font-mono" style={{ fontSize: '11px', fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{coData.latest.job_number || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Final CO on File</p>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: coData.has_final ? '#15803d' : '#b91c1c', margin: '2px 0 0' }}>{coData.has_final ? 'Yes' : 'No — Temporary only'}</p>
                </div>
              </div>
              {coData.latest.pdf_url && (
                <div style={{ marginTop: '10px' }}>
                  <a href={coData.latest.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: NAVY, border: `1px solid ${NAVY}`, padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600 }}>Open Latest CO PDF (BIS)</a>
                </div>
              )}
            </div>
          )}
          {coData.all && coData.all.length > 1 && (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={tableHeaderStyle}>Issue Date</th>
                  <th className={tableHeaderStyle}>Job Number</th>
                  <th className={tableHeaderStyle}>Job Type</th>
                  <th className={tableHeaderStyle}>Issue Type</th>
                  <th className={tableHeaderStyle}>Status</th>
                  <th className={tableHeaderStyle}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {coData.all.slice(0, 15).map((co: any, idx: number) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                    <td className={tableCellStyle}>{formatShortDate(co.issue_date)}</td>
                    <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{co.job_number || '—'}</td>
                    <td className={tableCellStyle}>{co.job_type || '—'}</td>
                    <td className={tableCellStyle}>{co.issue_type || '—'}</td>
                    <td className={tableCellStyle}>{co.application_status || '—'}</td>
                    <td className={tableCellStyle}>{co.pdf_url ? (<a href={co.pdf_url} target="_blank" rel="noreferrer" style={{ color: NAVY, fontWeight: 600, textDecoration: 'underline' }}>View</a>) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Department of Buildings · Certificates of Occupancy (bs8b-p36w). PDFs served by DOB BIS.
          </p>
        </section>
      )}

      {/* Air Resources / Fuel-Burning Equipment */}
      {fuelTanks && fuelTanks.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Air Resources — Fuel-Burning Equipment</h3>
          {fuelTanks.active && fuelTanks.active.length > 0 && (
            <>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Active Equipment ({fuelTanks.active.length})</p>
              <table className="w-full border-collapse" style={{ marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th className={tableHeaderStyle}>Device Type</th>
                    <th className={tableHeaderStyle}>Primary Fuel</th>
                    <th className={tableHeaderStyle}>Quantity</th>
                    <th className={tableHeaderStyle}>Make / Model</th>
                    <th className={tableHeaderStyle}>Issued</th>
                    <th className={tableHeaderStyle}>Expires</th>
                    <th className={tableHeaderStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelTanks.active.map((t: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                      <td className={tableCellStyle}>{t.device_type || '—'}</td>
                      <td className={tableCellStyle}>{t.primary_fuel || '—'}</td>
                      <td className={tableCellStyle}>{t.quantity || '—'}</td>
                      <td className={tableCellStyle}>{[t.make, t.model].filter(Boolean).join(' / ') || '—'}</td>
                      <td className={tableCellStyle}>{formatShortDate(t.issue_date)}</td>
                      <td className={tableCellStyle}>{formatShortDate(t.expiration_date)}</td>
                      <td className={tableCellStyle}>{t.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {fuelTanks.expired && fuelTanks.expired.length > 0 && (
            <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 6px', fontStyle: 'italic' }}>
              {fuelTanks.expired.length} expired or cancelled record{fuelTanks.expired.length !== 1 ? 's' : ''} on file (not shown).
            </p>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Department of Buildings · Fuel-Burning Equipment registrations (f4rp-2kvy). Boilers, oil burners, and other combustion devices.
          </p>
        </section>
      )}

      {/* Sidewalk Violations (DOT) */}
      {sidewalkData && sidewalkData.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Highway / Sidewalk Violations (DOT)</h3>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Open:</span> <span style={{ color: sidewalkData.open.length > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>{sidewalkData.open.length}</span></div>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Dismissed:</span> {sidewalkData.dismissed.length}</div>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Total:</span> {sidewalkData.total}</div>
          </div>
          {sidewalkData.open && sidewalkData.open.length > 0 && (
            <>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Open Notices</p>
              <table className="w-full border-collapse" style={{ marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th className={tableHeaderStyle}>SWV #</th>
                    <th className={tableHeaderStyle}>Issued</th>
                    <th className={tableHeaderStyle}>Sq Ft</th>
                    <th className={tableHeaderStyle}>Defects</th>
                    <th className={tableHeaderStyle}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {sidewalkData.open.slice(0, 15).map((s: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                      <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{s.swv_number || s.violation_id || '—'}</td>
                      <td className={tableCellStyle}>{formatShortDate(s.issue_date)}</td>
                      <td className={tableCellStyle}>{s.sq_feet || '—'}</td>
                      <td className={tableCellStyle} style={{ fontSize: '10px' }}>{[...(s.defects || []), s.other_defects].filter(Boolean).join(', ') || '—'}</td>
                      <td className={tableCellStyle} style={{ fontSize: '10px' }}>{[s.house_num, s.on_street].filter(Boolean).join(' ')}{s.from_street ? ` btw ${s.from_street}` : ''}{s.to_street ? ` & ${s.to_street}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {sidewalkData.dismissed && sidewalkData.dismissed.length > 0 && (
            <p style={{ fontSize: '10px', color: '#6b7280', margin: '6px 0 0', fontStyle: 'italic' }}>
              {sidewalkData.dismissed.length} dismissed notice{sidewalkData.dismissed.length !== 1 ? 's' : ''} on file (not shown).
            </p>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Department of Transportation · Sidewalk Violations (6kbp-uz6m). Defective sidewalk flags trigger DOF assessment (SAC/SAF) liens if not cured.
          </p>
        </section>
      )}

      {/* HPD Emergency Repair Charges */}
      {hpdErp && hpdErp.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>HPD Emergency Repair Charges</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Total Charged</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#b91c1c', margin: '4px 0 0' }}>{formatCurrency(hpdErp.total_charged)}</p>
            </div>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Open Market Orders</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>{hpdErp.omo?.length || 0}</p>
            </div>
            <div style={{ backgroundColor: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Handyman Work Orders</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '4px 0 0' }}>{hpdErp.hwo?.length || 0}</p>
            </div>
          </div>
          {hpdErp.omo && hpdErp.omo.length > 0 && (
            <>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#374151', margin: '8px 0 6px' }}>Open Market Orders</p>
              <table className="w-full border-collapse" style={{ marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th className={tableHeaderStyle}>OMO #</th>
                    <th className={tableHeaderStyle}>Date</th>
                    <th className={tableHeaderStyle}>Work Type</th>
                    <th className={tableHeaderStyle}>Award</th>
                    <th className={tableHeaderStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hpdErp.omo.slice(0, 10).map((o: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                      <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{o.omo_number || '—'}</td>
                      <td className={tableCellStyle}>{formatShortDate(o.create_date)}</td>
                      <td className={tableCellStyle}>{o.work_type || '—'}</td>
                      <td className={tableCellStyle}>{formatCurrency(o.award_amount)}</td>
                      <td className={tableCellStyle}>{o.lifecycle || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {hpdErp.hwo && hpdErp.hwo.length > 0 && (
            <>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#374151', margin: '8px 0 6px' }}>Handyman Work Orders</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={tableHeaderStyle}>HWO #</th>
                    <th className={tableHeaderStyle}>Date</th>
                    <th className={tableHeaderStyle}>Work Type</th>
                    <th className={tableHeaderStyle}>Charge</th>
                    <th className={tableHeaderStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hpdErp.hwo.slice(0, 10).map((h: any, idx: number) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                      <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{h.hwo_number || '—'}</td>
                      <td className={tableCellStyle}>{formatShortDate(h.create_date)}</td>
                      <td className={tableCellStyle}>{h.work_type || '—'}</td>
                      <td className={tableCellStyle}>{formatCurrency(h.charge_amount)}</td>
                      <td className={tableCellStyle}>{h.lifecycle || h.status_reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Housing Preservation & Development · Open Market Orders (mdbu-nrqn) + Handyman Work Orders (sbnd-xujn). HPD emergency repair work billed back to the property as a tax lien.
          </p>
        </section>
      )}

      {/* FDNY Violations (Direct) */}
      {fdnyDirect && fdnyDirect.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Fire Department Violations (FDNY)</h3>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Open:</span> <span style={{ color: fdnyDirect.open.length > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>{fdnyDirect.open.length}</span></div>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Resolved:</span> {fdnyDirect.closed.length}</div>
            <div style={{ fontSize: '11px', color: '#111827' }}><span style={{ fontWeight: 600 }}>Open Penalty Total:</span> <span style={{ fontWeight: 600, color: '#b91c1c' }}>{formatCurrency(fdnyDirect.total_penalty)}</span></div>
          </div>
          {fdnyDirect.open && fdnyDirect.open.length > 0 && (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={tableHeaderStyle}>Violation #</th>
                  <th className={tableHeaderStyle}>Date</th>
                  <th className={tableHeaderStyle}>Code</th>
                  <th className={tableHeaderStyle}>Description</th>
                  <th className={tableHeaderStyle}>Category</th>
                  <th className={tableHeaderStyle}>Penalty</th>
                </tr>
              </thead>
              <tbody>
                {fdnyDirect.open.slice(0, 15).map((v: any, idx: number) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG }}>
                    <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{v.violation_number || '—'}</td>
                    <td className={tableCellStyle}>{formatShortDate(v.inspection_date)}</td>
                    <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{v.violation_code || '—'}</td>
                    <td className={tableCellStyle} style={{ fontSize: '10px' }}>{v.description || '—'}</td>
                    <td className={tableCellStyle}>{v.category || '—'}</td>
                    <td className={tableCellStyle}>{formatCurrency(v.penalty_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Fire Department · Bureau of Fire Prevention Violations (avgm-ztsb). Additional fuel-oil and certificate-of-fitness records require FDNY Business Portal lookup.
          </p>
        </section>
      )}

      {/* FDNY Building Vacate Orders (Coverage Exceed v2) */}
      {fdnyVacate && fdnyVacate.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>FDNY Building Vacate Orders</h3>
          {fdnyVacate.active.length > 0 && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', margin: 0 }}>
                {fdnyVacate.active.length} active vacate order{fdnyVacate.active.length !== 1 ? 's' : ''} — occupancy of the affected area(s) is legally prohibited until rescinded by FDNY.
              </p>
            </div>
          )}
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={tableHeaderStyle} style={{ width: '10%' }}>Status</th>
                <th className={tableHeaderStyle} style={{ width: '10%' }}>Order Date</th>
                <th className={tableHeaderStyle} style={{ width: '10%' }}>Last Insp.</th>
                <th className={tableHeaderStyle} style={{ width: '40%' }}>Description</th>
                <th className={tableHeaderStyle} style={{ width: '15%' }}>Occupancy</th>
                <th className={tableHeaderStyle} style={{ width: '15%' }}>Address</th>
              </tr>
            </thead>
            <tbody>
              {[...fdnyVacate.active, ...fdnyVacate.lifted].slice(0, 15).map((v: any, idx: number) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                  <td className={tableCellStyle}>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', backgroundColor: v.is_lifted ? '#dcfce7' : '#fee2e2', color: v.is_lifted ? '#166534' : '#991b1b' }}>
                      {v.is_lifted ? 'LIFTED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(v.date_of_order)}</td>
                  <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(v.last_inspection_date)}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{v.description || '—'}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{v.occupancy_description || '—'}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{v.aka_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Fire Department · Building Vacate List (n5xc-7jfa). Status is inferred from the order description — verify lift status directly with FDNY Bureau of Fire Prevention.
          </p>
        </section>
      )}

      {/* FDNY Bureau of Fire Prevention — Archive (Coverage Exceed v2) */}
      {fdnyBfp && fdnyBfp.total > 0 && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>FDNY Bureau of Fire Prevention — Archive Orders</h3>
          <p style={{ fontSize: '11px', color: '#374151', marginBottom: '8px' }}>
            {fdnyBfp.total} archive record{fdnyBfp.total !== 1 ? 's' : ''} from the historical BFP Active Violation Orders dataset (decommissioned 2024-03-14). Cross-reference with current FDNY violations above.
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={tableHeaderStyle} style={{ width: '15%' }}>Violation #</th>
                <th className={tableHeaderStyle} style={{ width: '10%' }}>Date</th>
                <th className={tableHeaderStyle} style={{ width: '15%' }}>Type</th>
                <th className={tableHeaderStyle} style={{ width: '12%' }}>Status</th>
                <th className={tableHeaderStyle} style={{ width: '48%' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {fdnyBfp.items.slice(0, 15).map((item: any, idx: number) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : CARD_BG, pageBreakInside: 'avoid' }}>
                  <td className={`${tableCellStyle} font-mono`} style={{ fontSize: '10px' }}>{item.violation_number || '—'}</td>
                  <td className={tableCellStyle} style={{ whiteSpace: 'nowrap' }}>{formatShortDate(item.violation_date)}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{item.violation_type || '—'}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{item.violation_status || '—'}</td>
                  <td className={tableCellStyle} style={{ fontSize: '10px' }}>{item.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fdnyBfp.items.length > 15 && (
            <p style={{ fontSize: '10px', color: '#374151', marginTop: '6px', fontStyle: 'italic' }}>
              Showing 15 of {fdnyBfp.items.length} BFP records.
            </p>
          )}
          <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            Source: NYC Open Data · Bureau of Fire Prevention Active Violation Orders archive (bi53-yph3).
          </p>
        </section>
      )}

      {/* General Notes */}
      {report.general_notes && (
        <section style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <h3 style={sectionHeaderStyle}>Notes</h3>
          <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: '#111827', lineHeight: '1.6' }}>{report.general_notes}</p>
        </section>
      )}

      {/* Footer — Disclaimer + Copyright */}
      <footer style={{ marginTop: '40px', paddingTop: '20px', borderTop: `2px solid ${NAVY}`, pageBreakInside: 'avoid' }}>
        <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#9ca3af', marginBottom: '8px', textAlign: 'center' }}>Disclaimer</p>
        <p style={{ fontSize: '10px', color: '#6b7280', textAlign: 'justify', lineHeight: '1.7' }}>
          This report is prepared in connection with real estate due diligence using information derived from
          publicly available municipal records which may contain errors, omissions, or delays.
          BinCheckNYC{userProfile?.company_name ? ` and ${userProfile.company_name}` : ''} make no warranties
          regarding the accuracy or completeness of underlying government data. All findings should be
          independently verified with the relevant city agencies prior to reliance in any transaction.
        </p>
        <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af' }}>
            © {new Date().getFullYear()} BinCheckNYC{userProfile?.company_name ? ` · ${userProfile.company_name}` : ''}
          </p>
          <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Proprietary analysis · All rights reserved</p>
        </div>

        {/* Additional Services */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#9ca3af', marginBottom: '12px', textAlign: 'center' }}>Additional Services</p>
          
          {report.citisignal_recommended && (
            <div style={{ marginBottom: '10px', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${BORDER}`, pageBreakInside: 'avoid' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', margin: '0 0 4px' }}>Ongoing Compliance Monitoring</p>
              <p style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.6', margin: 0 }}>
                This property has {violations.length} active violation{violations.length !== 1 ? 's' : ''} and {applications.length} open application{applications.length !== 1 ? 's' : ''} across multiple agencies. CitiSignal by BinCheckNYC provides real-time monitoring, AI-powered compliance scoring, and alerts for new filings.
                Learn more at <span style={{ fontWeight: 600 }}>citisignal.com</span>
              </p>
            </div>
          )}

          <div style={{ padding: '12px 16px', borderRadius: '8px', border: `1px solid ${BORDER}`, pageBreakInside: 'avoid' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', margin: '0 0 4px' }}>Certified Physical Copy — $150</p>
            <p style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.6', margin: 0 }}>
              Bound report with professional cover page, wet signature certification, and priority shipping (2–3 business days).
              Contact <span style={{ fontWeight: 600 }}>orders@binchecknyc.com</span> with Report ID: <span className="font-mono" style={{ fontWeight: 600 }}>{reportId}</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DDReportPrintView;
