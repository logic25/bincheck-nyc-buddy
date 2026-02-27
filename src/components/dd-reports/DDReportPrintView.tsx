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
    ai_analysis: string | null;
    general_notes: string | null;
    line_item_notes?: any[];
    customer_concern?: string | null;
    property_status_summary?: string | null;
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

const DDReportPrintView = ({ report, userProfile }: DDReportPrintViewProps) => {
  const violations = report.violations_data || [];
  const applications = report.applications_data || [];
  const orders = report.orders_data || { stop_work: [], vacate: [] };
  const building = report.building_data || {};
  const complaints = report.complaints_data || [];
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
  const tableCellStyle = "border border-gray-200 px-2 py-1.5 text-[11px]";
  const tableHeaderStyle = "border border-gray-200 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 bg-gray-50";

  // Check if violation likely needs architect
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

  const renderViolationGroup = (agencyViolations: any[], agencyName: string) => {
    if (agencyViolations.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[12px] font-bold text-gray-800">{agencyName} Violations</h4>
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{agencyViolations.length} items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle}>Violation #</th>
              <th className={tableHeaderStyle}>Type / Description</th>
              <th className={tableHeaderStyle}>Severity</th>
              <th className={tableHeaderStyle}>Issued</th>
              <th className={tableHeaderStyle}>Status</th>
              <th className={`${tableHeaderStyle} w-[28%]`}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {agencyViolations.slice(0, 50).map((v: any, idx: number) => (
              <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className={`${tableCellStyle} font-mono text-[10px]`}>
                  {v.violation_number}
                  {isArchitectLikelyNeeded(v) && (
                    <span className="ml-1 text-[8px] font-bold text-blue-700 bg-blue-50 px-1 py-0 rounded" title="Architect certification typically involved">RA</span>
                  )}
                </td>
                <td className={`${tableCellStyle} max-w-[160px]`}>{(v.violation_type || v.description_raw || '—').slice(0, 55)}</td>
                <td className={tableCellStyle}>{v.severity || v.violation_class || '—'}</td>
                <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(v.issued_date)}</td>
                <td className={tableCellStyle}>{v.status}</td>
                <td className={`${tableCellStyle} text-gray-600`}>{getNote('violation', v.id || v.violation_number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderApplicationsTable = (apps: any[], title: string) => {
    if (apps.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[12px] font-bold text-gray-800">{title}</h4>
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{apps.length} items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={tableHeaderStyle}>Application #</th>
              <th className={tableHeaderStyle}>Date Filed</th>
              <th className={tableHeaderStyle}>Floor/Apt</th>
              <th className={tableHeaderStyle}>Description</th>
              <th className={`${tableHeaderStyle} w-[24%]`}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {apps.slice(0, 30).map((app: any, idx: number) => {
              const appKey = `${app.source || 'BIS'}-${app.id || app.application_number || idx}`;
              return (
                <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  <td className={`${tableCellStyle} font-mono text-[10px]`}>{app.application_number || app.job_number}</td>
                  <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(app.filing_date)}</td>
                  <td className={tableCellStyle}>{cleanFloorApt(app.floor, app.apartment)}</td>
                  <td className={`${tableCellStyle} max-w-[200px]`}>{(app.job_description || '—').slice(0, 70)}</td>
                  <td className={`${tableCellStyle} text-gray-600`}>{getNote('application', appKey)}</td>
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
      <section className="mb-6">
        <h3 className={sectionHeaderStyle}>DOB Complaints ({complaints.length})</h3>
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
            {complaints.slice(0, 30).map((c: any, idx: number) => (
              <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className={`${tableCellStyle} font-mono text-[10px]`}>{c.complaint_number || '—'}</td>
                <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(c.date_entered)}</td>
                <td className={tableCellStyle}>{c.status || '—'}</td>
                <td className={tableCellStyle}>{decodeComplaintCategory(c.complaint_category)}</td>
                <td className={`${tableCellStyle} max-w-[200px]`}>{(c.category_description || decodeComplaintCategory(c.complaint_category)).slice(0, 70)}</td>
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
      <div className="mb-8">
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
      <div className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
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
                      a.results > 0
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-400'
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
        <section className="mb-6 p-5 bg-gray-50 rounded border border-gray-200">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-gray-900 mb-3">Property Status Summary</h3>
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-200">
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">DOB Violations: {dobViolations.length}</span>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">ECB Violations: {ecbViolations.length}</span>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">HPD Violations: {hpdViolations.length}</span>
            {fdnyViolations.length > 0 && <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">FDNY: {fdnyViolations.length}</span>}
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Active Permits: {applications.length}</span>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Complaints: {complaints.length}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{report.property_status_summary}</p>
        </section>
      )}

      {/* Building Information */}
      <section className="mb-6">
        <h3 className={sectionHeaderStyle}>Building Information</h3>
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
          {[
            ['Year Built', building.year_built || '—'],
            ['Dwelling Units', building.dwelling_units || '—'],
            ['Zoning', building.zoning_district || '—'],
            ['Building Area', building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sqft` : '—'],
            ['Stories', building.stories || '—'],
            ['Landmark', building.is_landmark ? 'Yes' : 'No'],
            ['Owner', building.owner_name || '—'],
            ['Building Class', building.building_class || '—'],
          ].map(([label, value], i) => (
            <div key={i}>
              <span className="text-gray-500">{label}:</span>{' '}
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Summary */}
      <section className="mb-6">
        <h3 className={sectionHeaderStyle}>Compliance Summary</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Open Violations', value: violations.length, sub: `DOB: ${dobViolations.length} | ECB: ${ecbViolations.length} | HPD: ${hpdViolations.length}${fdnyViolations.length > 0 ? ` | FDNY: ${fdnyViolations.length}` : ''}${otherOathViolations.length > 0 ? ` | Other: ${otherOathViolations.length}` : ''}` },
            { label: 'Applications', value: applications.length, sub: `BIS: ${bisApplications.length} | DOB NOW: ${dobNowApplications.length}` },
            { label: 'Stop Work Orders', value: orders.stop_work?.length || 0, danger: (orders.stop_work?.length || 0) > 0 },
            { label: 'Vacate Orders', value: orders.vacate?.length || 0, danger: (orders.vacate?.length || 0) > 0 },
          ].map((item, i) => (
            <div key={i} className={`p-3 border rounded text-center ${item.danger ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <div className={`text-[20px] font-bold ${item.danger ? 'text-red-600' : 'text-gray-900'}`}>{item.value}</div>
              <div className="text-[10px] font-medium text-gray-600">{item.label}</div>
              {item.sub && <div className="text-[9px] text-gray-400 mt-1">{item.sub}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Critical Orders */}
      {(orders.stop_work?.length > 0 || orders.vacate?.length > 0) && (
        <section className="mb-6">
          <h3 className={`${sectionHeaderStyle} text-red-700 border-red-700`}>⚠ Active Orders</h3>
          {orders.stop_work?.map((order: any, idx: number) => (
            <div key={`swo-${idx}`} className="p-3 mb-2 border border-red-200 bg-red-50 rounded">
              <p className="font-bold text-[11px] text-red-800">Stop Work Order — {formatShortDate(order.issued_date)}</p>
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
          <p className="text-[11px] text-gray-500 italic">No open violations found.</p>
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
          <div className="mt-4 p-3 border border-blue-200 bg-blue-50/50 rounded">
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
      </section>

      {/* ACRIS - Property Transfer & Lien History */}
      <section className="mb-6">
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
                  <th className={tableHeaderStyle}>Date</th>
                  <th className={tableHeaderStyle}>Document Type</th>
                  <th className={tableHeaderStyle}>Party 1 (Grantor/Lender)</th>
                  <th className={tableHeaderStyle}>Party 2 (Grantee/Borrower)</th>
                  <th className={tableHeaderStyle}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {acrisDocuments.slice(0, 10).map((doc: any, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                    <td className={`${tableCellStyle} whitespace-nowrap`}>{formatShortDate(doc.document_date)}</td>
                    <td className={tableCellStyle}>{doc.document_type || '—'}</td>
                    <td className={`${tableCellStyle} max-w-[140px] truncate`}>{doc.party1 || '—'}</td>
                    <td className={`${tableCellStyle} max-w-[140px] truncate`}>{doc.party2 || '—'}</td>
                    <td className={`${tableCellStyle} whitespace-nowrap`}>
                      {doc.document_amount ? `$${doc.document_amount.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[9px] text-gray-400 mt-2 italic">
              Source: NYC ACRIS — recorded documents only. Unrecorded agreements not included.
            </p>
          </>
        )}
      </section>

      {/* AI Analysis / Conclusion */}
      {report.ai_analysis && (
        <section className="mb-6">
          <h3 className={sectionHeaderStyle}>Risk Assessment & Conclusion</h3>
          <div className="text-[11px] leading-relaxed">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-[14px] font-bold mt-4 mb-2 text-gray-900">{children}</h1>,
                h2: ({ children }) => <h2 className="text-[13px] font-bold mt-3 mb-1.5 text-gray-900">{children}</h2>,
                h3: ({ children }) => <h3 className="text-[12px] font-bold mt-2 mb-1 text-gray-800">{children}</h3>,
                p: ({ children }) => <p className="mb-2 text-gray-700">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-0.5 text-gray-700">{children}</li>,
                strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
              }}
            >
              {report.ai_analysis}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* General Notes */}
      {report.general_notes && (
        <section className="mb-6">
          <h3 className={sectionHeaderStyle}>Notes</h3>
          <p className="text-[11px] whitespace-pre-wrap text-gray-700">{report.general_notes}</p>
        </section>
      )}

      {/* CitiSignal Recommendation */}
      {report.citisignal_recommended && (
        <section className="mb-6 p-5 rounded border-2 border-teal-300 bg-teal-50/50">
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
      <footer className="mt-10 pt-4 border-t-2 border-gray-900">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2 text-center">Disclaimer</p>
        <p className="text-[9px] text-gray-500 text-justify leading-[1.6]">
          This report is provided for informational purposes only in connection with real estate due diligence
          and does not constitute legal, financial, or investment advice. Information is derived from publicly
          available municipal records which may contain errors, omissions, or delays.
          BinCheckNYC{userProfile?.company_name ? ` and ${userProfile.company_name}` : ''} make no warranties
          regarding accuracy or completeness. All parties should independently verify information and consult
          with licensed attorneys and professionals before closing any transaction.
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
