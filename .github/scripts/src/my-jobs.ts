import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Job } from "./types/job.schema";
import {
  collectJobsFromRepoMarkdown,
  type MarkdownJob,
} from "./parse-job-markdown";
import {
  classifyPersonalLocation,
  type PersonalLocationMatch,
} from "./personal-jobs-filter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLY_IMG_URL =
  process.env.APPLY_IMG_URL ?? "https://i.imgur.com/JpkfjIq.png";

const COMPANY_TYPES = ["faang", "financial", "other"] as const;

type Role = "intern" | "new_grad";

type TaggedJob = Job & {
  role: Role;
  is_usa: boolean;
  locationMatch: PersonalLocationMatch;
};

const MATCH_LABEL: Record<PersonalLocationMatch, string> = {
  miami: "Miami area",
  socal: "Southern California",
  remote: "Remote / hybrid",
};

function hasSupabaseCreds(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_KEY?.trim(),
  );
}

async function fetchMergedJobs(
  fetchJobs: (p: {
    job_type: string;
    is_usa: boolean;
    company_type: string;
  }) => Promise<Job[]>,
  job_type: Role,
  is_usa: boolean,
): Promise<Job[]> {
  const batches = await Promise.all(
    COMPANY_TYPES.map((company_type) =>
      fetchJobs({ job_type, is_usa, company_type }),
    ),
  );
  return batches.flat();
}

function dedupeByUrl(jobs: TaggedJob[]): TaggedJob[] {
  const byUrl = new Map<string, TaggedJob>();
  for (const job of jobs) {
    const prev = byUrl.get(job.job_url);
    if (!prev || job.age < prev.age) {
      byUrl.set(job.job_url, job);
    }
  }
  return [...byUrl.values()];
}

function dedupeMarkdownByUrl(jobs: MarkdownJob[]): MarkdownJob[] {
  const byUrl = new Map<string, MarkdownJob>();
  for (const job of jobs) {
    const prev = byUrl.get(job.job_url);
    if (!prev || job.age < prev.age) {
      byUrl.set(job.job_url, job);
    }
  }
  return [...byUrl.values()];
}

function tagAndFilter(
  jobs: Job[],
  role: Role,
  is_usa: boolean,
): TaggedJob[] {
  const out: TaggedJob[] = [];
  for (const job of jobs) {
    const locationMatch = classifyPersonalLocation(job.job_locations);
    if (!locationMatch) continue;
    out.push({ ...job, role, is_usa, locationMatch });
  }
  return out;
}

function filterMarkdownToTagged(jobs: MarkdownJob[]): TaggedJob[] {
  const out: TaggedJob[] = [];
  for (const j of jobs) {
    const locationMatch = classifyPersonalLocation(j.job_locations);
    if (!locationMatch) continue;
    const { role, is_usa, ...rest } = j;
    out.push({ ...rest, role, is_usa, locationMatch });
  }
  return out;
}

function sortByAge(a: TaggedJob, b: TaggedJob): number {
  return a.age - b.age;
}

function generateTable(jobs: TaggedJob[]): string {
  const headers = [
    "Type",
    "Area",
    "Company",
    "Position",
    "Location",
    "Posting",
    "Age",
  ];
  let table = `| ${headers.join(" | ")} |\n`;
  table += `|${headers.map(() => "---").join("|")}|\n`;

  for (const job of jobs) {
    const applyCell = `<a href="${job.job_url}"><img src="${APPLY_IMG_URL}" alt="Apply" width="70"/></a>`;
    const companyCell = job.company_url
      ? `<a href="${job.company_url}"><strong>${job.company_name || ""}</strong></a>`
      : `<strong>${job.company_name || ""}</strong>`;
    const typeCell = job.role === "intern" ? "Internship" : "New grad";
    const row = [
      typeCell,
      MATCH_LABEL[job.locationMatch],
      companyCell,
      job.job_title || "",
      job.job_locations || "",
      applyCell,
      `${job.age}d`,
    ];
    table += `| ${row.join(" | ")} |\n`;
  }

  return table;
}

async function collectFromSupabase(): Promise<TaggedJob[]> {
  const { fetchJobs } = await import("./queries");
  const [internUsa, ngUsa, internIntl, ngIntl] = await Promise.all([
    fetchMergedJobs(fetchJobs, "intern", true),
    fetchMergedJobs(fetchJobs, "new_grad", true),
    fetchMergedJobs(fetchJobs, "intern", false),
    fetchMergedJobs(fetchJobs, "new_grad", false),
  ]);

  return [
    ...tagAndFilter(internUsa, "intern", true),
    ...tagAndFilter(ngUsa, "new_grad", true),
    ...tagAndFilter(internIntl, "intern", false),
    ...tagAndFilter(ngIntl, "new_grad", false),
  ];
}

function collectFromMarkdown(repoRoot: string): TaggedJob[] {
  const raw = collectJobsFromRepoMarkdown(repoRoot);
  const deduped = dedupeMarkdownByUrl(raw);
  return filterMarkdownToTagged(deduped);
}

async function main() {
  const repoRoot = path.join(__dirname, "../../..");

  let tagged: TaggedJob[];
  let sourceNote: string;

  if (hasSupabaseCreds()) {
    tagged = await collectFromSupabase();
    sourceNote =
      "Data source: **Supabase** `get_jobs` (same live export as the main tables).";
  } else {
    tagged = collectFromMarkdown(repoRoot);
    sourceNote =
      "Data source: **Markdown tables in this repo** (`README.md`, `NEW_GRAD_USA.md`, `INTERN_INTL.md`, `NEW_GRAD_INTL.md`) — no API keys. Refresh lists by merging the latest changes from upstream, then re-run this script.";
  }

  const unique = dedupeByUrl(tagged).sort(sortByAge);

  const generated = new Date().toISOString().slice(0, 10);
  const tableBlock =
    unique.length === 0
      ? "_No internship or new-grad rows matched Miami, Southern California, or remote/hybrid in this export._\n"
      : generateTable(unique);

  const optionalSecrets =
    hasSupabaseCreds()
      ? ""
      : "\n\n_Optional:_ add repository secrets `SUPABASE_URL` and `SUPABASE_KEY` to switch this workflow to the live database instead of parsing Markdown.\n";

  const md = `# Personal job shortlist

**For you only:** filtered for **internships** and **new graduate** roles in **Miami**, **Southern California**, or **remote / hybrid** (location text only). Tune rules in \`.github/scripts/src/personal-jobs-filter.ts\`.

${sourceNote}

**${unique.length}** listings (deduped by posting URL). _Generated: ${generated}._

${tableBlock}

---

**Regenerate**

- **GitHub:** Actions → **Update MY_JOBS shortlist** → Run workflow (no secrets required unless you want Supabase mode).
- **Local:** \`cd .github/scripts && npm install && npm run my-jobs\` (optional \`.env\` with \`SUPABASE_URL\` + \`SUPABASE_KEY\` for live data). Requires [Node.js](https://nodejs.org/) (not Bun).
${optionalSecrets}
`;

  const outPath = path.join(repoRoot, "MY_JOBS.md");
  fs.writeFileSync(outPath, md, "utf8");
  console.log(
    `${hasSupabaseCreds() ? "Supabase" : "Markdown"} → ${unique.length} jobs → ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
