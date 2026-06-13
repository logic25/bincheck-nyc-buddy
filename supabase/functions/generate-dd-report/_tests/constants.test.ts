// Locks the extracted constants to their pre-refactor values.
// Anchors picked from the original inline definitions in index.ts.
//
// If any of these fail, the refactor changed data — back it out.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { COMPLAINT_CATEGORIES } from "../constants/violationCodes.ts";
import {
  BOROUGH_CODES,
  OATH_BOROUGH_NAMES,
  OATH_AGENCIES,
  OATH_RESOLVED_TERMS,
  CLOSED_STATUSES,
} from "../constants/statusTerms.ts";

Deno.test("COMPLAINT_CATEGORIES: known codes map to exact original descriptions", () => {
  assertEquals(
    COMPLAINT_CATEGORIES["1J"],
    "Jewelry/Dentistry Torch — Gas Piping Removed w/o Permit",
  );
  assertEquals(COMPLAINT_CATEGORIES["01"], "Accident — Construction/Plumbing");
  assertEquals(COMPLAINT_CATEGORIES["45"], "Illegal Conversion");
  assertEquals(
    COMPLAINT_CATEGORIES["8P"],
    "Proactive Enforcement — Building Inspection",
  );
  assertEquals(COMPLAINT_CATEGORIES["99"], "Other — General Complaint");
});

Deno.test("COMPLAINT_CATEGORIES: code count matches pre-refactor inventory", () => {
  // 99 numeric (01-99) + 71 alphanumeric entries = 170 total.
  assertEquals(Object.keys(COMPLAINT_CATEGORIES).length, 170);
});

Deno.test("OATH_RESOLVED_TERMS: exact same items, same order", () => {
  assertEquals(OATH_RESOLVED_TERMS, [
    "paid",
    "written off",
    "dismissed",
    "defaulted",
    "satisfied",
    "complied",
    "waived",
  ]);
});

Deno.test("CLOSED_STATUSES: exact same items, same order", () => {
  assertEquals(CLOSED_STATUSES, [
    "closed",
    "resolved",
    "dismissed",
    "paid",
    "complied",
    "certified closed",
  ]);
});

Deno.test("BOROUGH_CODES: known aliases resolve to original codes", () => {
  assertEquals(BOROUGH_CODES["MANHATTAN"], "1");
  assertEquals(BOROUGH_CODES["NEW YORK"], "1");
  assertEquals(BOROUGH_CODES["BX"], "2");
  assertEquals(BOROUGH_CODES["KINGS"], "3");
  assertEquals(BOROUGH_CODES["QN"], "4");
  assertEquals(BOROUGH_CODES["RICHMOND"], "5");
});

Deno.test("OATH_BOROUGH_NAMES: codes 1-5 map to original names", () => {
  assertEquals(OATH_BOROUGH_NAMES, {
    "1": "MANHATTAN",
    "2": "BRONX",
    "3": "BROOKLYN",
    "4": "QUEENS",
    "5": "STATEN ISLAND",
  });
});

Deno.test("OATH_AGENCIES: exact same entries, same order", () => {
  assertEquals(OATH_AGENCIES, [
    { code: "FDNY", oathName: "FIRE DEPARTMENT OF NYC" },
    { code: "DEP", oathName: "DEPT OF ENVIRONMENT PROT" },
    { code: "DOT", oathName: "DEPT OF TRANSPORTATION" },
    { code: "DSNY", oathName: "DEPT OF SANITATION" },
    { code: "LPC", oathName: "LANDMARKS PRESERV COMM" },
    { code: "DOF", oathName: "DEPT OF FINANCE" },
  ]);
});
