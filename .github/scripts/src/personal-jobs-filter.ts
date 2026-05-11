/**
 * Location filter for personal job list (Miami, Southern California, remote).
 * Matching is case-insensitive and uses the job's location string only.
 */

const REMOTE_SUBSTRINGS = [
  "remote",
  "anywhere",
  "work from home",
  "wfh",
];

const MIAMI_SUBSTRINGS = ["miami", "miami-dade", "miami dade", "coral gables", "doral, fl"];

/** Greater LA / San Diego metro and common SoCal phrasing (excludes NorCal/Bay Area). */
const SOCAL_SUBSTRINGS = [
  "southern california",
  "socal",
  "los angeles",
  "la,",
  " l.a.",
  "san diego",
  "irvine",
  "orange county",
  "santa monica",
  "pasadena",
  "long beach",
  "torrance",
  "anaheim",
  "santa ana",
  "riverside",
  "san bernardino",
  "ventura",
  "oxnard",
  "thousand oaks",
  "calabasas",
  "burbank",
  "glendale",
  "culver city",
  "el segundo",
  "newport beach",
  "costa mesa",
  "huntington beach",
  "laguna beach",
  "pomona",
  "ontario, california",
  "redlands",
  "manhattan beach",
  "hermosa beach",
  "redondo beach",
  "palos verdes",
  "west covina",
  "fullerton",
  "garden grove",
  "mission viejo",
  "carlsbad",
  "escondido",
  "oceanside",
  "chula vista",
  "encinitas",
  "la jolla",
  "del mar",
  "santa barbara",
];

/** If location mentions these, do not treat as SoCal (Bay Area / NorCal overlap). */
const NORCAL_BLOCK_SUBSTRINGS = [
  "san francisco",
  "sf,",
  " bay area",
  "silicon valley",
  "san jose",
  "santa clara",
  "palo alto",
  "mountain view",
  "sunnyvale",
  "cupertino",
  "menlo park",
  "redwood city",
  "fremont",
  "oakland",
  "berkeley",
  "walnut creek",
  "pleasanton",
  "san ramon",
  "sacramento",
  "san mateo",
];

export type PersonalLocationMatch = "miami" | "socal" | "remote";

export function classifyPersonalLocation(
  jobLocations: string | null,
): PersonalLocationMatch | null {
  if (!jobLocations || !jobLocations.trim()) {
    return null;
  }

  const loc = jobLocations.trim();
  const lower = loc.toLowerCase();

  for (const s of REMOTE_SUBSTRINGS) {
    if (lower.includes(s)) {
      return "remote";
    }
  }
  if (lower.includes("hybrid")) {
    return "remote";
  }

  for (const s of MIAMI_SUBSTRINGS) {
    if (lower.includes(s)) {
      return "miami";
    }
  }

  const blocked = NORCAL_BLOCK_SUBSTRINGS.some((b) => lower.includes(b));
  if (!blocked) {
    // City of Ontario, CA — must not match Canadian province "Ontario, CAN"
    if (/\bontario\s*,\s*ca\b/i.test(loc)) {
      return "socal";
    }
    for (const s of SOCAL_SUBSTRINGS) {
      if (lower.includes(s)) {
        return "socal";
      }
    }
  }

  return null;
}

export function matchesPersonalJobLocation(jobLocations: string | null): boolean {
  return classifyPersonalLocation(jobLocations) !== null;
}
