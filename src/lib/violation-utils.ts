// Agency-specific violation lookup URLs
export const getAgencyLookupUrl = (agency: string, violationNumber: string, bbl?: string | null) => {
  const borough = bbl ? bbl.charAt(0) : '3';
  const block = bbl ? bbl.slice(1, 6) : '';
  const lot = bbl ? bbl.slice(6, 10) : '';

  switch (agency) {
    case 'DOB':
      if (bbl) {
        return `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${borough}&block=${block}&lot=${lot}`;
      }
      return `https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp`;
    case 'ECB':
      return `http://a820-ecbticketfinder.nyc.gov/searchHome.action`;
    case 'HPD':
      if (bbl) {
        return `https://hpdonline.nyc.gov/HPDonline/Provide_address.aspx`;
      }
      return `https://hpdonline.nyc.gov/HPDonline/`;
    case 'FDNY':
      return `https://fires.fdnycloud.org/CitizenAccess/`;
    case 'DEP':
      return `https://www1.nyc.gov/site/dep/about/contact-us.page`;
    case 'DOT':
      return `https://nycstreets.net/`;
    case 'DSNY':
      return `https://portal.311.nyc.gov/`;
    case 'LPC':
      return `https://www1.nyc.gov/site/lpc/index.page`;
    case 'DOF':
      if (bbl) {
        return `https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop`;
      }
      return `https://www1.nyc.gov/site/finance/taxes/property.page`;
    default:
      return `http://a820-ecbticketfinder.nyc.gov/searchHome.action`;
  }
};

export const getAgencyDisplayName = (agency: string) => {
  const names: Record<string, string> = {
    DOB: 'Dept. of Buildings',
    ECB: 'Environmental Control Board',
    HPD: 'Housing Preservation',
    FDNY: 'Fire Department',
    DEP: 'Environmental Protection',
    DOT: 'Dept. of Transportation',
    DSNY: 'Sanitation',
    LPC: 'Landmarks',
    DOF: 'Dept. of Finance',
  };
  return names[agency] || agency;
};

export const getAgencyColor = (agency: string) => {
  const colors: Record<string, string> = {
    FDNY: 'bg-red-500/10 text-red-400 border-red-500/20',
    DOB: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    ECB: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    HPD: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    DEP: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    DOT: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    DSNY: 'bg-green-500/10 text-green-400 border-green-500/20',
    LPC: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    DOF: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  };
  return colors[agency] || 'bg-muted text-muted-foreground border-border';
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-destructive/10 text-destructive';
    case 'in_progress': return 'bg-score-yellow/10 text-score-yellow';
    case 'closed': return 'bg-score-green/10 text-score-green';
    default: return 'bg-muted text-muted-foreground';
  }
};

export const getOATHLookupUrl = (ticketNumber: string) => {
  return `http://a820-ecbticketfinder.nyc.gov/searchHome.action`;
};

export const RESOLVED_VIOLATION_STATUSES = [
  'written off', 'closed', 'dismissed', 'paid', 'paid in full',
  'resolved', 'complied', 'withdrawn', 'stipulation',
  'default - paid', 'in violation - resolved', 'in violation - paid',
];

export const RESOLVED_OATH_PATTERNS = [
  'paid in full', 'dismissed', 'written off', 'withdrawn', 'stipulation complied',
];

export const isResolvedOATHStatus = (oathStatus: string | null | undefined): boolean => {
  if (!oathStatus) return false;
  const normalized = oathStatus.toLowerCase().trim();
  if (RESOLVED_OATH_PATTERNS.some(pattern => normalized.includes(pattern))) return true;
  if (normalized.includes('all terms met') && !normalized.includes('due')) return true;
  return false;
};

export const isResolvedViolationStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const normalizedStatus = status.toLowerCase().trim();
  return RESOLVED_VIOLATION_STATUSES.some((resolved) =>
    normalizedStatus.includes(resolved) || resolved.includes(normalizedStatus)
  );
};

export const isResolvedViolationClass = (violationClass: string | null | undefined): boolean => {
  if (!violationClass) return false;
  const normalized = violationClass.toLowerCase().trim();
  return RESOLVED_VIOLATION_STATUSES.some((resolved) => normalized.includes(resolved));
};

export const isActiveViolation = (violation: {
  status?: string | null;
  oath_status?: string | null;
  violation_class?: string | null;
  suppressed?: boolean | null;
}): boolean => {
  if (violation.suppressed) return false;
  if (violation.status === 'closed') return false;
  if (isResolvedViolationStatus(violation.status)) return false;
  if (isResolvedOATHStatus(violation.oath_status)) return false;
  if (isResolvedViolationClass(violation.violation_class)) return false;
  return true;
};
