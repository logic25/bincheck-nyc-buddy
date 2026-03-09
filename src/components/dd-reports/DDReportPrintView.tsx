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
  };
  userProfile?: UserProfile;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const NAVY = '#1e3a5f';
const CARD_BG = '#f9fafb';
const BORDER = '#e5e7eb';

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

  const complianceScore = calculateComplianceScore(propertyData);

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
      {(report.tax_lien_data || []).length > 0 && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '2px solid #dc2626', borderRadius: '8px', marginBottom: '24px', pageBreakInside: 'avoid' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', margin: '0 0 4px' }}>⚠ Tax Lien Sale — Property Flagged</p>
          <p style={{ fontSize: '11px', color: '#7f1d1d', margin: 0, lineHeight: '1.5' }}>
            This property appears on the NYC DOF Tax Lien Sale List with {(report.tax_lien_data || []).length} record{(report.tax_lien_data || []).length !== 1 ? 's' : ''}.
            Verify current status directly with DOF before proceeding.
          </p>
        </div>
      )}

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
        </div>
      </section>

      {/* Property Status Summary */}
      {report.property_status_summary && (
        <section style={{ marginBottom: '32px' }}>
          <h3 style={sectionHeaderStyle}>Property Status Summary</h3>
          <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#111827' }}>
            {report.property_status_summary.split('\n\n').map((paragraph, i) => (
              <p key={i} style={{ margin: '0 0 12px' }}>{paragraph}</p>
            ))}
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
                  <th className={tableHeaderStyle} style={{ width: '10%' }}>Date</th>
                  <th className={tableHeaderStyle} style={{ width: '18%' }}>Document Type</th>
                  <th className={tableHeaderStyle} style={{ width: '25%' }}>Party 1 (Grantor/Lender)</th>
                  <th className={tableHeaderStyle} style={{ width: '25%' }}>Party 2 (Grantee/Borrower)</th>
                  <th className={tableHeaderStyle} style={{ width: '12%' }}>Amount</th>
                  <th className={tableHeaderStyle} style={{ width: '10%' }}>CRFN/Reel</th>
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
              Source: NYC ACRIS — recorded documents only. Unrecorded agreements not included.
            </p>
          </>
        )}
      </section>

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
