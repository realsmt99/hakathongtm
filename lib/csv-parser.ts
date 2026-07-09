import Papa from "papaparse";

export interface LinkedInRow {
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  company: string;
  linkedinUrl: string;
  email?: string;
  phone?: string;
  about?: string;
  location?: string;
  connectedOn?: string;
}

const HEADER_ALIASES: Record<keyof LinkedInRow, string[]> = {
  firstName:    ["First Name", "first_name", "firstname", "Prénom"],
  lastName:     ["Last Name", "last_name", "lastname", "Nom"],
  fullName:     ["Full Name", "full_name", "Name", "Nom complet"],
  title:        ["Title", "Job Title", "Position", "Poste", "Role", "Fonction"],
  company:      ["Company", "Company Name", "Entreprise", "Organization"],
  linkedinUrl:  ["LinkedIn URL", "Profile URL", "linkedin", "LinkedIn", "URL"],
  email:        ["Email Address", "Email", "E-mail", "email"],
  phone:        ["Phone", "Phone Number", "Mobile", "Téléphone"],
  about:        ["About", "Summary", "Bio", "Description"],
  location:     ["Location", "Localisation", "City", "Ville"],
  connectedOn:  ["Connected On", "connection_date", "Date"],
};

function normalizeHeader(raw: string): keyof LinkedInRow | null {
  const trimmed = raw.trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      return field as keyof LinkedInRow;
    }
  }
  return null;
}

export interface ParseResult {
  rows: LinkedInRow[];
  skipped: number;
  warnings: string[];
  totalRaw: number;
}

export function parseLinkedInCSV(csvText: string): ParseResult {
  const warnings: string[] = [];

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((e) =>
      warnings.push(`Row ${e.row ?? "?"}: ${e.message}`)
    );
  }

  const rawHeaders = parsed.meta.fields ?? [];
  const headerMap: Partial<Record<keyof LinkedInRow, string>> = {};

  for (const raw of rawHeaders) {
    const normalized = normalizeHeader(raw);
    if (normalized && !headerMap[normalized]) {
      headerMap[normalized] = raw;
    }
  }

  const missingRequired: (keyof LinkedInRow)[] = [];
  for (const req of ["company", "linkedinUrl"] as (keyof LinkedInRow)[]) {
    if (!headerMap[req]) missingRequired.push(req);
  }
  if (missingRequired.length > 0) {
    warnings.push(
      `Missing recommended columns: ${missingRequired.join(", ")}. Enrichment quality will be reduced.`
    );
  }

  let skipped = 0;
  const rows: LinkedInRow[] = [];

  for (const raw of parsed.data) {
    const company = headerMap.company ? raw[headerMap.company]?.trim() : "";
    const linkedinUrl = headerMap.linkedinUrl
      ? raw[headerMap.linkedinUrl]?.trim()
      : "";

    if (!company && !linkedinUrl) {
      skipped++;
      continue;
    }

    const firstName = headerMap.firstName
      ? raw[headerMap.firstName]?.trim() ?? ""
      : "";
    const lastName = headerMap.lastName
      ? raw[headerMap.lastName]?.trim() ?? ""
      : "";

    const fullName =
      (headerMap.fullName ? raw[headerMap.fullName]?.trim() : "") ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      "Unknown";

    rows.push({
      firstName,
      lastName,
      fullName,
      title: headerMap.title ? raw[headerMap.title]?.trim() ?? "" : "",
      company: company ?? "",
      linkedinUrl: linkedinUrl ?? "",
      email: headerMap.email ? raw[headerMap.email]?.trim() : undefined,
      phone: headerMap.phone ? raw[headerMap.phone]?.trim() : undefined,
      about: headerMap.about ? raw[headerMap.about]?.trim() : undefined,
      location: headerMap.location ? raw[headerMap.location]?.trim() : undefined,
      connectedOn: headerMap.connectedOn
        ? raw[headerMap.connectedOn]?.trim()
        : undefined,
    });
  }

  return {
    rows,
    skipped,
    warnings,
    totalRaw: parsed.data.length,
  };
}

export function extractUniqueCompanies(rows: LinkedInRow[]): string[] {
  const seen = new Set<string>();
  return rows
    .map((r) => r.company)
    .filter((c) => {
      if (!c || seen.has(c.toLowerCase())) return false;
      seen.add(c.toLowerCase());
      return true;
    });
}

export function extractLinkedInDomains(rows: LinkedInRow[]): string[] {
  return rows
    .map((r) => {
      try {
        const url = new URL(
          r.linkedinUrl.startsWith("http")
            ? r.linkedinUrl
            : `https://${r.linkedinUrl}`
        );
        return url.hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })
    .filter((d): d is string => d !== null && d !== "linkedin.com");
}
