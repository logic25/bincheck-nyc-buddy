import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { getAgencyColor, getAgencyDisplayName } from '@/lib/violation-utils';
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
    ai_analysis: string | null;
    general_notes: string | null;
  };
  userProfile?: UserProfile;
}

const generateReportId = (date: string): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `bc-${year}-${month}-${day}-${seq}`;
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

const DDReportPrintView = ({ report, userProfile }: DDReportPrintViewProps) => {
  const violations = report.violations_data || [];
  const applications = report.applications_data || [];
  const orders = report.orders_data || { stop_work: [], vacate: [] };
  const building = report.building_data || {};
  const reportId = generateReportId(report.report_date);

  const buildPreparedByLine = () => {
    const parts: string[] = [];
    if (report.prepared_by) parts.push(report.prepared_by);
    else if (userProfile?.display_name) parts.push(userProfile.display_name);
    if (userProfile?.company_name) parts.push(userProfile.company_name);
    return parts.join(', ');
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

  return (
    <div className="print-container bg-white text-black p-8 max-w-4xl mx-auto" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold">BinCheckNYC Due Diligence Report</h1>
          <p className="text-sm text-gray-600 mt-1">
            Generated: {format(new Date(report.report_date), 'MMMM d, yyyy')} | Report ID: {reportId}
          </p>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-200">
          {preparedByLine && <p className="text-sm"><strong>Prepared By:</strong> {preparedByLine}</p>}
          {credentialsLine && <p className="text-sm text-gray-600">{credentialsLine}</p>}
        </div>
        <p className="text-xs text-gray-500 mt-2">Data Sources: NYC Department of Buildings, NYC Open Data</p>
      </div>

      {/* Property Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold">{report.address}</h2>
        <div className="flex justify-between mt-2 text-sm">
          <p><strong>Prepared For:</strong> {report.prepared_for}</p>
          <p><strong>BIN:</strong> {report.bin || '—'} | <strong>BBL:</strong> {report.bbl || '—'}</p>
        </div>
      </div>

      {/* Building Information */}
      <section className="mb-6">
        <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Building Information</h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div><strong>Year Built:</strong> {building.year_built || '—'}</div>
          <div><strong>Dwelling Units:</strong> {building.dwelling_units || '—'}</div>
          <div><strong>Zoning:</strong> {building.zoning_district || '—'}</div>
          <div><strong>Building Area:</strong> {building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sqft` : '—'}</div>
          <div><strong>Landmark:</strong> {building.is_landmark ? 'Yes' : 'No'}</div>
          <div><strong>Owner:</strong> {building.owner_name || '—'}</div>
        </div>
      </section>

      {/* Summary Stats */}
      <section className="mb-6">
        <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Compliance Summary</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="p-3 border rounded">
            <div className="text-2xl font-bold">{violations.length}</div>
            <div className="text-sm">Open Violations</div>
          </div>
          <div className="p-3 border rounded">
            <div className="text-2xl font-bold">{applications.length}</div>
            <div className="text-sm">Applications</div>
          </div>
          <div className="p-3 border rounded">
            <div className="text-2xl font-bold text-red-600">{orders.stop_work?.length || 0}</div>
            <div className="text-sm">Stop Work Orders</div>
          </div>
          <div className="p-3 border rounded">
            <div className="text-2xl font-bold text-red-600">{orders.vacate?.length || 0}</div>
            <div className="text-sm">Vacate Orders</div>
          </div>
        </div>
      </section>

      {/* Critical Orders */}
      {(orders.stop_work?.length > 0 || orders.vacate?.length > 0) && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3 text-red-600">⚠ Active Orders</h3>
          {orders.stop_work?.map((order: any, idx: number) => (
            <div key={`swo-${idx}`} className="p-3 mb-2 border border-red-300 bg-red-50 rounded">
              <p className="font-bold">Stop Work Order - {formatShortDate(order.issued_date)}</p>
              <p className="text-sm">{order.description || 'No description available'}</p>
            </div>
          ))}
          {orders.vacate?.map((order: any, idx: number) => (
            <div key={`vacate-${idx}`} className="p-3 mb-2 border border-red-300 bg-red-50 rounded">
              <p className="font-bold">Vacate Order - {formatShortDate(order.issued_date)}</p>
              <p className="text-sm">{order.description || 'No description available'}</p>
            </div>
          ))}
        </section>
      )}

      {/* AI Analysis */}
      {report.ai_analysis && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Risk Assessment</h3>
          <div className="text-sm prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                p: ({ children }) => <p className="mb-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
              }}
            >
              {report.ai_analysis}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* Violations Table */}
      <section className="mb-6">
        <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Open Violations ({violations.length})</h3>
        {violations.length === 0 ? (
          <p className="text-sm text-gray-500">No open violations found.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Violation #</th>
                <th className="border p-2 text-left">Agency</th>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Severity</th>
                <th className="border p-2 text-left">Issued</th>
                <th className="border p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {violations.slice(0, 50).map((v: any, idx: number) => (
                <tr key={idx}>
                  <td className="border p-2 font-mono">{v.violation_number}</td>
                  <td className="border p-2">{v.agency}</td>
                  <td className="border p-2 max-w-[200px] truncate">{v.violation_type || v.description_raw || '—'}</td>
                  <td className="border p-2">{v.severity || '—'}</td>
                  <td className="border p-2">{formatShortDate(v.issued_date)}</td>
                  <td className="border p-2">{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Applications Table */}
      <section className="mb-6">
        <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Permit Applications ({applications.length})</h3>
        {applications.length === 0 ? (
          <p className="text-sm text-gray-500">No applications found.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Application #</th>
                <th className="border p-2 text-left">Source</th>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Filed</th>
                <th className="border p-2 text-left">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {applications.slice(0, 30).map((app: any, idx: number) => (
                <tr key={idx}>
                  <td className="border p-2 font-mono">{app.application_number}</td>
                  <td className="border p-2">{app.source}</td>
                  <td className="border p-2">{app.application_type || app.job_type || '—'}</td>
                  <td className="border p-2">{app.status || '—'}</td>
                  <td className="border p-2">{formatShortDate(app.filing_date)}</td>
                  <td className="border p-2">{app.estimated_cost ? `$${Number(app.estimated_cost).toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* General Notes */}
      {report.general_notes && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Notes</h3>
          <p className="text-sm whitespace-pre-wrap">{report.general_notes}</p>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t-2 border-black">
        <div className="text-center mb-4">
          <p className="font-bold text-sm">DISCLAIMER</p>
        </div>
        <p className="text-xs text-gray-600 mb-4 text-justify leading-relaxed">
          This report is provided for informational purposes only and does not constitute legal, financial,
          or investment advice. Data is sourced from NYC Open Data and public records, which may contain
          errors, omissions, or be out of date. BinCheckNYC{userProfile?.company_name ? ` and ${userProfile.company_name}` : ''} make no
          warranties regarding accuracy or completeness. Users should independently verify all information
          and consult with licensed professionals before making decisions.
        </p>
        <div className="text-center text-xs text-gray-500 pt-3 border-t border-gray-200">
          <p className="font-medium">© {new Date().getFullYear()} BinCheckNYC{userProfile?.company_name ? ` | ${userProfile.company_name}` : ''}</p>
        </div>
      </footer>
    </div>
  );
};

export default DDReportPrintView;
