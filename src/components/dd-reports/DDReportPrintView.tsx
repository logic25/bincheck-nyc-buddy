import { format } from 'date-fns';
import { getAgencyDisplayName } from '@/lib/violation-utils';
import { decodeComplaintCategory } from '@/lib/complaint-category-decoder';
import ReactMarkdown from 'react-markdown';

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
  };
  userProfile?: UserProfile;
}

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

const DDReportPrintView = ({ report, userProfile }: DDReportPrintViewProps) => {
  const violations = (report.violations_data || []).filter((v: any) => !v.hidden);
  const applications = (report.applications_data || []).filter((a: any) => !a.hidden);
  const orders = report.orders_data || { stop_work: [], vacate: [] };
  const allComplaints = (report.complaints_data || []).filter((c: any) => !c.hidden);
  // Only show open complaints in DD report
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

  const sectionHeaderStyle = "text-[13px] font-bold uppercase tracking-[0.08em] text-gray-900 border-b-2 border-gray-900 pb-1.5 mb-4";
  const tableCellStyle = "border border-gray-400 px-2.5 py-2 text-[11px] align-top text-gray-900";
  const tableHeaderStyle = "border border-gray-400 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-800 bg-gray-100";

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

  // Calculate total ECB penalty balance
  const totalEcbPenalties = ecbViolations.reduce((sum: number, v: any) => {
    const penalty = parseFloat(v.penalty_imposed || v.penalty_amount || 0);
    const paid = parseFloat(v.amount_paid || 0);
    return sum + Math.max(0, penalty - paid);
  }, 0);

  const renderViolationGroup = (agencyViolations: any[], agencyName: string) => {
    if (agencyViolations.length === 0) return null;
    return (
      <div className="mb-5" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[12px] font-bold text-gray-800">{agencyName} Violations</h4>
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{agencyViolations.length} items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle} style={{ width: '14%' }}>Violation #</th>
              <th className={tableHeaderStyle} style={{ width: '18%' }}>Type / Description</th>
              <th className={tableHeaderStyle} style={{ width: '8%' }}>Severity</th>
              <th className={tableHeaderStyle} style={{ width: '8%' }}>Issued</th>
              <th className={tableHeaderStyle} style={{ width: '7%' }}>Status</th>
              <th className={tableHeaderStyle} style={{ width: '45%' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {agencyViolations.map((v: any, idx: number) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} style={{ pageBreakInside: 'avoid' }}>
                <td className={`${tableCellStyle} font-mono text-[10px]`}>
                  {v.violation_number}
                  {isArchitectLikelyNeeded(v) && (
                    <span className="ml-1 text-[8px] font-bold text-blue-700 bg-blue-50 px-1 py-0 rounded">RA</span>
                  )}
                </td>
                <td className={`${tableCellStyle}`}>
                  <div className="break-words">{(v.violation_type || v.description_raw || '—').slice(0, 80)}</div>
                </td>
                <td className={tableCellStyle}>{v.severity || v.violation_class || '—'}</td>
                <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(v.issued_date)}</td>
                <td className={tableCellStyle}>{v.status}</td>
                <td className={`${tableCellStyle} text-gray-700`}>
                  <div className="break-words leading-[1.4]">{getNote('violation', v.id || v.violation_number)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderApplicationsTable = (apps: any[], title: string) => {
    if (apps.length === 0) return null;
    const isBIS = title.includes('BIS');
    return (
      <div className="mb-5" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[12px] font-bold text-gray-800">{title}</h4>
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{apps.length} items</span>
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
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} style={{ pageBreakInside: 'avoid' }}>
                  <td className={`${tableCellStyle} font-mono text-[10px]`}>
                    {app.application_number || app.job_number}
                    {(() => {
                      const status = (app.status || app.status_description || app.permit_status || '').toUpperCase();
                      const closedStatuses = ['SIGNED OFF', 'SIGN-OFF', 'SIGNOFF', 'CLOSED', 'COMPLETED', 'COMPLETE', 'X', 'WITHDRAWN', 'DISAPPROVED'];
                      const isOpen = !closedStatuses.some(cs => status.includes(cs));
                      return isOpen ? <span className="ml-1 text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0 rounded">CO</span> : null;
                    })()}
                  </td>
                  <td className={tableCellStyle}>{app.application_type || app.work_type || '—'}</td>
                  <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(app.filing_date || app.issued_date)}</td>
                  <td className={tableCellStyle}>
                    <span className="text-[10px]">{app.status_description || app.permit_status || app.status || '—'}</span>
                  </td>
                  <td className={`${tableCellStyle} text-[10px]`}>{applicantName}</td>
                  <td className={`${tableCellStyle}`}>
                    <div className="break-words">{(app.job_description || '—').slice(0, 120)}</div>
                  </td>
                  <td className={`${tableCellStyle} text-gray-700`}>
                    <div className="break-words leading-[1.4]">{getNote('application', appKey)}</div>
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
      <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <h3 className={sectionHeaderStyle}>Open DOB Complaints ({complaints.length})</h3>
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
              <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                <td className={`${tableCellStyle} font-mono text-[10px]`}>{c.complaint_number || '—'}</td>
                <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(c.date_entered)}</td>
                <td className={tableCellStyle}>{c.status || '—'}</td>
                <td className={tableCellStyle}>{decodeComplaintCategory(c.complaint_category)}</td>
                <td className={`${tableCellStyle}`}>
                  <div className="break-words">{(c.category_description || decodeComplaintCategory(c.complaint_category)).slice(0, 100)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };

  return (
    <div className="print-container bg-white text-black p-8 max-w-4xl mx-auto" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: '12px', lineHeight: '1.5' }}>
      {/* Letterhead */}
      <div className="mb-8" style={{ pageBreakAfter: 'avoid' }}>
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900">Due Diligence Report</h1>
            <p className="text-[11px] text-gray-500 mt-0.5 font-medium tracking-wide uppercase">Property Compliance Assessment</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold text-gray-900">BinCheck<span className="text-red-600">NYC</span></p>
            <p className="text-[10px] text-gray-500 mt-1">Report ID: {reportId}</p>
            <p className="text-[10px] text-gray-500">{format(new Date(report.report_date), 'MMMM d, yyyy')}</p>
          </div>
        </div>
        {/* Meta Row */}
        <div className="grid grid-cols-2 gap-6 mt-4 text-[11px]">
          <div>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-0.5">Prepared For</p>
            <p className="font-medium text-gray-900">{report.prepared_for}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-0.5">Prepared By</p>
            <p className="font-medium text-gray-900">{preparedByLine || '—'}</p>
            {credentialsLine && <p className="text-gray-500 text-[10px] mt-0.5">{credentialsLine}</p>}
          </div>
        </div>
      </div>

      {/* Subject Property */}
      <div className="mb-6 p-4 bg-gray-50 rounded border border-gray-200" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-0.5">Subject Property</p>
            <p className="text-[15px] font-bold text-gray-900">{report.address}</p>
          </div>
          <div className="text-right text-[11px]">
            <p><span className="text-gray-500">BIN:</span> <span className="font-mono font-medium">{report.bin || '—'}</span></p>
            <p><span className="text-gray-500">BBL:</span> <span className="font-mono font-medium">{formatBBL(report.bbl)}</span></p>
          </div>
        </div>
        {/* Agency Sources */}
        {(() => {
          const aq: any[] = (report as any).agencies_queried || [];
          if (aq.length === 0) return null;
          const queried = aq.filter((a: any) => a.queried);
          const withData = queried.filter((a: any) => a.results > 0);
          return (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Sources Checked ({withData.length} of {queried.length} returned records)
              </p>
              <div className="flex flex-wrap gap-1">
                {queried.map((a: any) => (
                  <span
                    key={a.agency}
                    className={`inline-flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded ${
                      a.results > 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {a.agency}{a.results > 0 ? ` (${a.results})` : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {(report as any).customer_concern && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-0.5">Scope of Review</p>
            <p className="text-[11px] text-gray-700 italic">"{(report as any).customer_concern}"</p>
          </div>
        )}
      </div>

      {/* Property Status Summary */}
      {report.property_status_summary && (
        <section className="mb-6 p-5 bg-gray-50 rounded border border-gray-200" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-gray-900 mb-3">Property Status Summary</h3>
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-200">
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">DOB: {dobViolations.length}</span>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">ECB: {ecbViolations.length}</span>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">HPD: {hpdViolations.length}</span>
            {fdnyViolations.length > 0 && <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">FDNY: {fdnyViolations.length}</span>}
            {otherOathViolations.length > 0 && <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Other: {otherOathViolations.length}</span>}
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Applications: {applications.length}</span>
            {complaints.length > 0 && <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Open Complaints: {complaints.length}</span>}
            {totalEcbPenalties > 0 && (
              <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                ECB Penalties Due: {formatCurrency(totalEcbPenalties)}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{report.property_status_summary}</p>
        </section>
      )}

      {/* Tax Lien Sale Alert */}
      {(report.tax_lien_data || []).length > 0 && (
        <section className="mb-6 p-4 bg-red-50 rounded border-2 border-red-400" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-red-800 mb-2">⚠ Tax Lien Sale List — Property Flagged</h3>
          <p className="text-[12px] leading-relaxed text-red-900">
            This property appears on the NYC Department of Finance Tax Lien Sale List with {(report.tax_lien_data || []).length} record{(report.tax_lien_data || []).length !== 1 ? 's' : ''}. 
            This indicates delinquent property taxes, water/sewer charges, or other municipal debt eligible for sale to a third-party lien purchaser. 
            Buyers should verify current status directly with DOF before proceeding.
          </p>
        </section>
      )}

      <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <h3 className={sectionHeaderStyle}>Building Information</h3>
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
          {[
            ['Year Built', building.year_built || '—'],
            ['Stories', building.stories || '—'],
            ['Dwelling Units', building.dwelling_units ?? '—'],
            ['Building Class', building.building_class || '—'],
            ['Zoning', building.zoning_district || '—'],
            ['Building Area', building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sqft` : '—'],
            ['Lot Area', building.lot_area_sqft ? `${building.lot_area_sqft.toLocaleString()} sqft` : '—'],
            ['Assessed Value', building.assessed_total_value ? formatCurrency(building.assessed_total_value) : '—'],
            ['Owner', building.owner_name || '—'],
            ['Landmark', building.is_landmark ? 'Yes' : building.historic_district ? `Historic: ${building.historic_district}` : 'No'],
            ['Land Use', building.land_use || '—'],
          ].map(([label, value], i) => (
            <div key={i}>
              <span className="text-gray-500">{label}:</span>{' '}
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance Summary */}
      <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <h3 className={sectionHeaderStyle}>Compliance Summary</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: 'Open Violations',
              value: violations.length,
              sub: `DOB: ${dobViolations.length} | ECB: ${ecbViolations.length} | HPD: ${hpdViolations.length}${fdnyViolations.length > 0 ? ` | FDNY: ${fdnyViolations.length}` : ''}${otherOathViolations.length > 0 ? ` | Other: ${otherOathViolations.length}` : ''}`,
            },
            {
              label: 'Applications',
              value: applications.length,
              sub: `BIS: ${bisApplications.length} | DOB NOW: ${dobNowApplications.length}`,
            },
            {
              label: 'Stop Work Orders',
              value: orders.stop_work?.length || 0,
              danger: (orders.stop_work?.length || 0) > 0,
            },
            {
              label: 'Vacate Orders',
              value: orders.vacate?.length || 0,
              danger: (orders.vacate?.length || 0) > 0,
            },
          ].map((item, i) => (
            <div key={i} className={`p-3 border rounded text-center ${item.danger ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <div className={`text-[20px] font-bold ${item.danger ? 'text-red-600' : 'text-gray-900'}`}>{item.value}</div>
              <div className="text-[10px] font-medium text-gray-600">{item.label}</div>
              {item.sub && <div className="text-[9px] text-gray-400 mt-1">{item.sub}</div>}
            </div>
          ))}
        </div>
        {totalEcbPenalties > 0 && (
          <div className="mt-3 p-2.5 border border-red-200 bg-red-50/60 rounded text-center">
            <span className="text-[11px] font-semibold text-red-800">
              Total Outstanding ECB Penalties: {formatCurrency(totalEcbPenalties)}
            </span>
            <span className="text-[10px] text-gray-600 ml-2">
              (Unpaid ECB penalties typically become property liens)
            </span>
          </div>
        )}
      </section>

      {/* Critical Orders */}
      {(orders.stop_work?.length > 0 || orders.vacate?.length > 0 || orders.partial_stop_work?.length > 0) && (
        <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
          <h3 className={`${sectionHeaderStyle} text-red-700 border-red-700`}>⚠ Active Orders</h3>
          {orders.stop_work?.map((order: any, idx: number) => (
            <div key={`swo-${idx}`} className="p-3 mb-2 border border-red-200 bg-red-50 rounded">
              <p className="font-bold text-[11px] text-red-800">Stop Work Order — {formatShortDate(order.issued_date)}</p>
              <p className="text-[11px] text-gray-700">{order.description || 'No description available'}</p>
            </div>
          ))}
          {orders.partial_stop_work?.map((order: any, idx: number) => (
            <div key={`pswo-${idx}`} className="p-3 mb-2 border border-orange-200 bg-orange-50 rounded">
              <p className="font-bold text-[11px] text-orange-800">Partial Stop Work Order — {formatShortDate(order.issued_date)}</p>
              <p className="text-[11px] text-gray-700">{order.description || 'No description available'}</p>
            </div>
          ))}
          {orders.vacate?.map((order: any, idx: number) => (
            <div key={`vacate-${idx}`} className="p-3 mb-2 border border-red-200 bg-red-50 rounded">
              <p className="font-bold text-[11px] text-red-800">Vacate Order — {formatShortDate(order.issued_date)}</p>
              <p className="text-[11px] text-gray-700">{order.description || 'No description available'}</p>
            </div>
          ))}
        </section>
      )}

      {/* Violations by Agency */}
      <section className="mb-6">
        <h3 className={sectionHeaderStyle}>Open Violations ({violations.length})</h3>
        {violations.length === 0 ? (
          <p className="text-[11px] text-gray-500 italic">No open violations found across all agencies queried.</p>
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
          <div className="mt-4 p-3 border border-blue-200 bg-blue-50/50 rounded" style={{ pageBreakInside: 'avoid' }}>
            <p className="text-[11px] font-semibold text-blue-900 mb-1">Architect Certification Typically Involved</p>
            <p className="text-[10px] text-gray-700 leading-relaxed">
              {architectTaggedCount} open violation{architectTaggedCount !== 1 ? 's' : ''} (marked <span className="font-bold text-blue-700 bg-blue-100 px-1 rounded text-[9px]">RA</span>) {architectTaggedCount !== 1 ? 'are' : 'is'} of a type where DOB has historically accepted or required a licensed architect's certification letter as part of the dismissal process. BinCheckNYC can coordinate architect opinion letters through our professional network.
            </p>
          </div>
        )}
      </section>

      {/* DOB Complaints */}
      {renderComplaintsTable()}

      {/* Applications */}
      <section className="mb-6">
        <h3 className={sectionHeaderStyle}>Permit Applications ({applications.length})</h3>
        {applications.length === 0 ? (
          <p className="text-[11px] text-gray-500 italic">No applications found.</p>
        ) : (
          <>
            {renderApplicationsTable(bisApplications, 'BIS Applications')}
            {renderApplicationsTable(dobNowApplications, 'DOB NOW Build Applications')}
          </>
        )}
        {closeoutTaggedCount > 0 && (
          <div className="mt-4 p-3 border border-emerald-200 bg-emerald-50/50 rounded" style={{ pageBreakInside: 'avoid' }}>
            <p className="text-[11px] font-semibold text-emerald-900 mb-1">Permit Closeout May Be Required</p>
            <p className="text-[10px] text-gray-700 leading-relaxed">
              {closeoutTaggedCount} application{closeoutTaggedCount !== 1 ? 's' : ''} (marked <span className="font-bold text-emerald-700 bg-emerald-100 px-1 rounded text-[9px]">CO</span>) {closeoutTaggedCount !== 1 ? 'are' : 'is'} still open and may need to be formally closed out with DOB. Open permits can affect property transfers and new filings. Green Light Expediting can manage the closeout process on your behalf.
            </p>
          </div>
        )}
      </section>

      {/* ACRIS - Property Transfer & Lien History */}
      <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
        <h3 className={sectionHeaderStyle}>Property Transfer & Lien History (ACRIS)</h3>
        {acrisDocuments.length === 0 ? (
          <p className="text-[11px] text-gray-500 italic">
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
                  <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                    <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(doc.document_date || doc.recorded_datetime)}</td>
                    <td className={tableCellStyle}>{doc.document_type || doc.doc_type || '—'}</td>
                    <td className={`${tableCellStyle}`}>
                      <div className="break-words text-[10px]">{doc.party1 || '—'}</div>
                    </td>
                    <td className={`${tableCellStyle}`}>
                      <div className="break-words text-[10px]">{doc.party2 || '—'}</div>
                    </td>
                    <td className={`${tableCellStyle} whitespace-nowrap`}>
                      {doc.document_amount ? formatCurrency(doc.document_amount) : '—'}
                    </td>
                    <td className={`${tableCellStyle} font-mono text-[9px]`}>{doc.crfn || doc.reel_page || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {acrisDocuments.length > 20 && (
              <p className="text-[9px] text-gray-500 mt-1 italic">
                Showing 20 of {acrisDocuments.length} recorded documents. Additional records available upon request.
              </p>
            )}
            <p className="text-[9px] text-gray-400 mt-2 italic">
              Source: NYC ACRIS — recorded documents only. Unrecorded agreements not included.
            </p>
          </>
        )}
      </section>

      {/* General Notes */}
      {report.general_notes && (
        <section className="mb-6" style={{ pageBreakInside: 'avoid' }}>
          <h3 className={sectionHeaderStyle}>Notes</h3>
          <p className="text-[11px] whitespace-pre-wrap text-gray-700 leading-relaxed">{report.general_notes}</p>
        </section>
      )}

      {/* CitiSignal Recommendation */}
      {report.citisignal_recommended && (
        <section className="mb-6 p-5 rounded border-2 border-teal-300 bg-teal-50/50" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-[13px] font-bold text-teal-900 mb-2">Ongoing Compliance Monitoring Available</h3>
          <p className="text-[11px] text-gray-700 leading-relaxed mb-3">
            This property has {violations.length} active violation{violations.length !== 1 ? 's' : ''} and {applications.length} open application{applications.length !== 1 ? 's' : ''} being tracked by multiple NYC agencies. Properties of this size and complexity benefit from continuous monitoring to catch new filings, violation updates, and permit changes as they happen — not just at the point of transaction.
          </p>
          <p className="text-[11px] font-semibold text-gray-800 mb-1.5">CitiSignal by BinCheckNYC provides:</p>
          <ul className="text-[11px] text-gray-700 list-disc ml-5 space-y-0.5 mb-3">
            <li>Real-time violation and permit monitoring across DOB, ECB, FDNY, HPD, and OATH</li>
            <li>AI-powered compliance scoring and alerts</li>
            <li>Property management tools including work orders and vendor coordination</li>
            <li>Telegram and email notifications for new filings</li>
          </ul>
          <p className="text-[11px] text-gray-600">
            Learn more at <span className="font-semibold text-teal-700">citisignal.com</span> or contact us to set up monitoring for this property.
          </p>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-10 pt-4 border-t-2 border-gray-900" style={{ pageBreakInside: 'avoid' }}>
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2 text-center">Disclaimer</p>
        <p className="text-[9px] text-gray-500 text-justify leading-[1.6]">
          This report is prepared in connection with real estate due diligence using information derived from
          publicly available municipal records which may contain errors, omissions, or delays.
          BinCheckNYC{userProfile?.company_name ? ` and ${userProfile.company_name}` : ''} make no warranties
          regarding the accuracy or completeness of underlying government data. All findings should be
          independently verified with the relevant city agencies prior to reliance in any transaction.
        </p>
        <div className="text-center mt-4 pt-3 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-gray-600">
            © {new Date().getFullYear()} BinCheckNYC{userProfile?.company_name ? ` · ${userProfile.company_name}` : ''}
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">Proprietary analysis · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
};

export default DDReportPrintView;
