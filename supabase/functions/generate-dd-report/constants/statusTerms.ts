// Static lookup data moved verbatim from generate-dd-report/index.ts.
// No values, ordering, or keys may be altered.

export const BOROUGH_CODES: Record<string, string> = {
  "MANHATTAN": "1", "MN": "1", "NEW YORK": "1",
  "BRONX": "2", "BX": "2", "THE BRONX": "2",
  "BROOKLYN": "3", "BK": "3", "KINGS": "3",
  "QUEENS": "4", "QN": "4",
  "STATEN ISLAND": "5", "SI": "5", "RICHMOND": "5",
};

// Maps borough code (1-5) to full borough name used by OATH dataset
export const OATH_BOROUGH_NAMES: Record<string, string> = {
  "1": "MANHATTAN",
  "2": "BRONX",
  "3": "BROOKLYN",
  "4": "QUEENS",
  "5": "STATEN ISLAND",
};

// Maps agency code to OATH issuing_agency name
export const OATH_AGENCIES: Array<{ code: string; oathName: string }> = [
  { code: "FDNY", oathName: "FIRE DEPARTMENT OF NYC" },
  { code: "DEP",  oathName: "DEPT OF ENVIRONMENT PROT" },
  { code: "DOT",  oathName: "DEPT OF TRANSPORTATION" },
  { code: "DSNY", oathName: "DEPT OF SANITATION" },
  { code: "LPC",  oathName: "LANDMARKS PRESERV COMM" },
  { code: "DOF",  oathName: "DEPT OF FINANCE" },
];

export const OATH_RESOLVED_TERMS = ["paid", "written off", "dismissed", "defaulted", "satisfied", "complied", "waived"];

export const CLOSED_STATUSES = ['closed', 'resolved', 'dismissed', 'paid', 'complied', 'certified closed'];
