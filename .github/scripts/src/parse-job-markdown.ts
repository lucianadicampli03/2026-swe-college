import * as fs from "fs";
import * as path from "path";
import { MARKERS } from "./config";
import type { Job } from "./types/job.schema";

export type MarkdownRole = "intern" | "new_grad";

export type MarkdownJob = Job & {
  role: MarkdownRole;
  is_usa: boolean;
};

const MARKER_ORDER: (keyof typeof MARKERS)[] = ["faang", "quant", "other"];

const SOURCE_FILES: ReadonlyArray<{
  filename: string;
  role: MarkdownRole;
  is_usa: boolean;
}> = [
  { filename: "README.md", role: "intern", is_usa: true },
  { filename: "NEW_GRAD_USA.md", role: "new_grad", is_usa: true },
  { filename: "INTERN_INTL.md", role: "intern", is_usa: false },
  { filename: "NEW_GRAD_INTL.md", role: "new_grad", is_usa: false },
];

function extractBetween(md: string, start: string, end: string): string {
  const i0 = md.indexOf(start);
  if (i0 === -1) return "";
  const from = i0 + start.length;
  const i1 = md.indexOf(end, from);
  if (i1 === -1) return "";
  return md.slice(from, i1);
}

function splitMarkdownRow(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  return inner.split("|").map((c) => c.trim());
}

function parseCompanyCell(cell: string): { name: string; url: string | null } {
  const linked = cell.match(
    /<a href="([^"]*)"[^>]*>\s*<strong>([^<]*)<\/strong>\s*<\/a>/i,
  );
  if (linked) {
    return { url: linked[1] || null, name: (linked[2] || "").trim() };
  }
  const strong = cell.match(/<strong>([^<]*)<\/strong>/i);
  if (strong) {
    return { url: null, name: (strong[1] || "").trim() };
  }
  return { url: null, name: cell.replace(/<[^>]+>/g, "").trim() };
}

function parseJobUrl(postingCell: string): string | null {
  const m = postingCell.match(/<a href="([^"]+)"[^>]*>\s*<img/i);
  return m?.[1] ?? null;
}

function parseAgeDays(ageCell: string): number {
  const m = ageCell.match(/(\d+)\s*d\b/i);
  return m ? parseInt(m[1], 10) : NaN;
}

function parseTableBlock(block: string): Job[] {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const header = lines[0];
  const hasSalary = header.includes("Salary");
  const postingIdx = hasSalary ? 4 : 3;
  const ageIdx = hasSalary ? 5 : 4;
  const minCols = hasSalary ? 6 : 5;

  let i = 1;
  if (lines[i]?.includes("---")) i += 1;

  const jobs: Job[] = [];

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;

    const cells = splitMarkdownRow(line);
    if (cells.length < minCols) continue;

    const companyCell = cells[0] ?? "";
    const job_title = (cells[1] ?? "").replace(/<[^>]+>/g, "").trim();
    const job_locations = (cells[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const postingCell = cells[postingIdx] ?? "";
    const ageCell = cells[ageIdx] ?? "";

    const { name: company_name, url: company_url } = parseCompanyCell(companyCell);
    const job_url = parseJobUrl(postingCell);
    const age = parseAgeDays(ageCell);

    if (!company_name || !job_url || Number.isNaN(age)) continue;

    jobs.push({
      company_name,
      company_url,
      job_title: job_title || "—",
      job_locations: job_locations || null,
      job_url,
      age,
    });
  }

  return jobs;
}

function parseFileContent(
  md: string,
  role: MarkdownRole,
  is_usa: boolean,
): MarkdownJob[] {
  const out: MarkdownJob[] = [];

  for (const key of MARKER_ORDER) {
    const { start, end } = MARKERS[key];
    const section = extractBetween(md, start, end);
    if (!section.trim()) continue;
    for (const job of parseTableBlock(section)) {
      out.push({ ...job, role, is_usa });
    }
  }

  return out;
}

export function collectJobsFromRepoMarkdown(repoRoot: string): MarkdownJob[] {
  const all: MarkdownJob[] = [];

  for (const src of SOURCE_FILES) {
    const fp = path.join(repoRoot, src.filename);
    if (!fs.existsSync(fp)) continue;
    const md = fs.readFileSync(fp, "utf8");
    all.push(...parseFileContent(md, src.role, src.is_usa));
  }

  return all;
}
