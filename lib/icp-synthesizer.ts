import type { LinkedInRow } from "./csv-parser";
import type { Signal } from "./sillage-client";

export interface ICPAvatar {
  id: string;
  label: string;
  dominantTitle: string;
  dominantIndustry: string;
  topKeywords: string[];
  seniority: string;
  locationHint: string;
  profileCount: number;
  representativeProfiles: { name: string; title: string; company: string; linkedinUrl?: string }[];
}

export interface ICPOutput {
  metadata: {
    synthesis_timestamp: string;
    analyzed_sample_size: number;
    signals_analyzed: number;
  };
  avatars: ICPAvatar[];
  sillage_feed_parameters: {
    target_industries: string[];
    boolean_query: string;
    high_intent_triggers: string[];
    persona: {
      job_title: string;
      location: string;
      keywords: string[];
      industries: string[];
      seniority_levels: string[];
    };
  };
  fullenrich_feed_parameters: {
    primary_titles: string[];
    secondary_titles: string[];
    seniority_level: string;
  };
  graph_network: {
    nodes: { id: string; label: string; type: "avatar" | "industry" | "signal" | "role"; weight: number }[];
    links: { source: string; target: string; relationship: string }[];
  };
}

// Each entry: [companyKeywords (matched against company name only), titleKeywords (matched against title only), anyKeywords (matched against full text)]
// Priority order matters — first match wins. More specific industries come first.
const INDUSTRY_TAXONOMY: Record<string, { company: string[]; title: string[]; any: string[] }> = {
  "Luxury & Fashion":        { company: ["lvmh", "kering", "hermès", "hermes", "chanel", "dior", "vuitton", "louis vuitton", "cartier", "bulgari", "richemont", "gucci", "balenciaga", "saint laurent", "bottega", "givenchy", "celine", "loewe", "fendi"], title: ["luxury", "fashion", "mode", "couture", "maison"], any: [] },
  "Finance & Banking":       { company: ["bnp paribas", "bnp", "société générale", "crédit agricole", "credit agricole", "axa", "amundi", "natixis", "hsbc", "goldman", "jp morgan", "morgan stanley", "blackrock", "lazard", "rothschild", "banque"], title: ["banking", "investissements solidaires", "asset management", "private equity", "wealth management", "finance"], any: ["banque", "financier"] },
  "Energy & Environment":    { company: ["total energies", "totalenergies", "edf", "engie", "shell", "bp ", "equinor", "schneider", "veolia"], title: ["energy", "énergie", "renewables", "transition énergétique", "oil", "gas"], any: [] },
  "Healthcare & Pharma":     { company: ["sanofi", "servier", "roche", "pfizer", "novartis", "astrazeneca", "johnson", "medtronic", "biotech"], title: ["health", "pharma", "medical", "santé", "hospital", "life sciences"], any: [] },
  "Non-Profit & Foundation": { company: ["fondation", "foundation", "fondation de france", "croix-rouge", "croix rouge", "secours", "unicef", "greenpeace", "wwf"], title: ["philanthropie", "mécénat", "philanthropy", "mecenat", "fondation", "nonprofit", "ngo"], any: ["fondation d'entreprise", "mécénat culturel"] },
  "Consulting":              { company: ["mckinsey", "bcg", "bain", "deloitte", "kpmg", "pwc", "ey ", "ernst", "accenture", "capgemini", "oliver wyman", "roland berger"], title: ["consulting", "conseil", "advisory", "strategy", "stratégie"], any: [] },
  "Real Estate":             { company: ["unibail", "covivio", "nexity", "bouygues", "vinci", "eiffage", "gecina"], title: ["real estate", "immobilier", "property", "foncier", "construction"], any: [] },
  "Media & Communications":  { company: ["publicis", "havas", "vivendi", "lagardère", "le monde", "figaro", "tf1", "m6", "bertelsmann", "ogilvy", "dentsu"], title: ["media", "presse", "publishing", "communication", "marketing", "agence"], any: [] },
  "Retail & Consumer":       { company: ["carrefour", "lvmh", "l'oréal", "loreal", "l'oreal", "unilever", "henkel", "procter", "michelin", "decathlon", "fnac", "darty"], title: ["retail", "consumer", "distribution", "e-commerce", "brand"], any: [] },
  "Hospitality & Travel":    { company: ["accor", "marriott", "hilton", "airbnb", "booking", "club med", "sodexo", "elior"], title: ["hospitality", "hôtellerie", "travel", "tourisme"], any: [] },
  "Technology":              { company: ["google", "microsoft", "apple", "meta", "amazon", "salesforce", "oracle", "sap", "ibm", "cisco", "intel", "nvidia", "dassault", "thales", "airbus"], title: ["software", "saas", "tech lead", "cloud", "cybersecurity", "data science", "machine learning", "cto", "chief technology"], any: [] },
  "Education":               { company: ["université", "university", "école", "hec", "sciences po", "polytechnique", "insead", "essec", "edhec"], title: ["education", "académie", "formation", "enseignement"], any: [] },
  "Sports & Entertainment":  { company: ["psg", "olympique", "amaury", "lagardère sports", "canal+"], title: ["sport", "entertainment", "événement", "culture"], any: [] },
};

const CSR_LEXICON = [
  "mécénat", "mecenat", "philanthropie", "philanthropy", "don", "donation", "fundraising",
  "loi aillagon", "loi mécénat", "esg", "rse", "csr", "impact social", "social impact",
  "female empowerment", "women empowerment", "diversity", "diversité", "inclusion",
  "sustainable development", "développement durable", "climate", "climat",
  "corporate giving", "engaged donor", "committed donor", "donateur engagé",
  "cause", "association", "fondation", "endowment", "fondation d'entreprise",
  "purposeful", "raison d'être", "mission driven", "partage", "solidarité",
];

// Order matters: checked top-down, first match wins
const SENIORITY_LEVELS: Array<[string, string[]]> = [
  ["C-Suite",              ["chief", "ceo", "cto", "cfo", "coo", "cso", "cpo", "ciso", "pdg", "président-directeur", "directeur général", "directrice générale", "president", "présidente", "founder", "fondateur", "fondatrice", "partner", "associé gérant"]],
  ["VP / Director",        ["vp ", "vice president", "vice-president", " director", "directeur", "directrice", "head of", "head,", "responsable", "chef de", "président", "présidente"]],
  ["Manager",              ["manager", "lead", "associate director", "senior manager", "project manager"]],
  ["Individual Contributor",["analyst", "consultant", "officer", "chargé", "coordinateur", "assistant", "associate", "intern"]],
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëîïôùûüç'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function frequency<T extends string>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

function topN<T extends string>(map: Map<T, number>, n: number): T[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function normalizeWeight(count: number, max: number): number {
  if (max === 0) return 1;
  return Math.max(1, Math.min(10, Math.round((count / max) * 10)));
}

function detectIndustry(company: string, title: string, about: string): string | null {
  const lowerCompany = company.toLowerCase();
  const lowerTitle   = title.toLowerCase();
  const lowerAny     = (company + " " + title + " " + about).toLowerCase();
  for (const [industry, { company: ckw, title: tkw, any: akw }] of Object.entries(INDUSTRY_TAXONOMY)) {
    if (ckw.some((kw) => lowerCompany.includes(kw))) return industry;
    if (tkw.some((kw) => lowerTitle.includes(kw)))   return industry;
    if (akw.some((kw) => lowerAny.includes(kw)))     return industry;
  }
  return null;
}

function detectSeniority(title: string): string {
  const lower = " " + title.toLowerCase() + " ";
  for (const [level, keywords] of SENIORITY_LEVELS) {
    if (keywords.some((kw) => lower.includes(kw))) return level;
  }
  return "VP / Director"; // default assumption for donor profiles
}

function extractCSRSignals(texts: string[]): string[] {
  const found: string[] = [];
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const term of CSR_LEXICON) {
      if (lower.includes(term) && !found.includes(term)) {
        found.push(term);
      }
    }
  }
  return found;
}

function buildBooleanQuery(industries: string[], signals: string[]): string {
  const indPart = industries.slice(0, 3).map((i) => `'${i}'`).join(" OR ");
  const sigPart = signals.slice(0, 3).map((s) => `'${s}'`).join(" OR ");
  if (indPart && sigPart) return `(${indPart}) AND (${sigPart})`;
  if (indPart) return `(${indPart})`;
  return sigPart ? `(${sigPart})` : "";
}

function clusterByTitle(rows: LinkedInRow[]): Map<string, LinkedInRow[]> {
  const clusters = new Map<string, LinkedInRow[]>();
  for (const row of rows) {
    const seniority = detectSeniority(row.title || "");
    const existing = clusters.get(seniority) ?? [];
    existing.push(row);
    clusters.set(seniority, existing);
  }
  return clusters;
}

export function synthesizeICP(
  rows: LinkedInRow[],
  signals: Signal[] = []
): ICPOutput {
  const now = new Date().toISOString();

  const allText = rows.map((r) => [r.title, r.company, r.about, r.location].filter(Boolean).join(" "));

  const titleFreq = frequency(rows.map((r) => r.title).filter(Boolean));
  const topTitles = topN(titleFreq, 10);

  const industryHits: string[] = [];
  for (const row of rows) {
    const ind = detectIndustry(row.company ?? "", row.title ?? "", row.about ?? "");
    if (ind) industryHits.push(ind);
  }
  const industryFreq = frequency(industryHits);
  const topIndustries = topN(industryFreq, 5);
  const maxIndCount = Math.max(...[...industryFreq.values()], 1);

  const csrSignals = extractCSRSignals(allText);
  const signalLabels = signals
    .map((s) => s.signal_type)
    .filter(Boolean);
  const signalFreq = frequency(signalLabels);
  const topSignals = topN(signalFreq, 5);
  const allTriggers = [...new Set([...csrSignals.slice(0, 5), ...topSignals.slice(0, 3)])];

  const seniorityGroups = clusterByTitle(rows);
  // Pick seniority level by which group has the most profiles
  const topSeniority = [...seniorityGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "VP / Director";

  const locationFreq = frequency(rows.map((r) => r.location ?? "").filter(Boolean));
  const topLocation = topN(locationFreq, 1)[0] ?? "France";

  const tokenFreq = frequency(allText.flatMap(tokenize));
  const stopWords = new Set([
    // English
    "the","and","for","with","that","this","from","have","been","their","our","are","its","not",
    "more","also","focus","about","global","lead","leading","work","years","over","both",
    "corporate","company","group","across","within","through","into","based",
    // French
    "dans","pour","les","des","une","son","ses","sur","par","qui","que","avec","aux",
    "est","sont","ont","une","leur","leurs","nous","vous","ils","elle","elles",
    "plus","très","tout","tous","cette","ces","mais","comme","depuis","entre",
    // Generic noise
    "paris","france","europe","monde","international","social","impact",
    "engagement","entreprise","développement","stratégie","programme",
    "d'entreprise","partenariats","membre","comité","groupe","niveau",
    // Structural title words (not signals)
    "directrice","directeur","générale","général","fondation","foundation",
    "déléguée","délégué","exécutive","exécutif","l'oréal","loreal",
    "soutien","actions","grands","pilote","dirige","active","engagée","engagé",
    "grands","création","artistique","contemporain","contemporaine",
  ]);
  const topTokens = [...tokenFreq.entries()]
    .filter(([k]) => !stopWords.has(k) && k.length > 3 && !/^\d+$/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k]) => k);

  const clusters = [...seniorityGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  const avatars: ICPAvatar[] = clusters.slice(0, 2).map(([seniority, clusterRows], idx) => {
    const titleF = frequency(clusterRows.map((r) => r.title).filter(Boolean));
    const dominantTitle = topN(titleF, 1)[0] ?? topTitles[0] ?? "Director";
    const indHits = clusterRows.map((r) => detectIndustry(r.company ?? "", r.title ?? "", r.about ?? "")).filter((i): i is string => i !== null);
    const dominantIndustry = topN(frequency(indHits), 1)[0] ?? topIndustries[0] ?? "Finance & Banking";
    const representative = clusterRows.slice(0, 3).map((r) => ({
      name: r.fullName,
      title: r.title,
      company: r.company,
      linkedinUrl: r.linkedinUrl || undefined,
    }));
    return {
      id: `avatar_${idx + 1}`,
      label: `${seniority} — ${dominantIndustry}`,
      dominantTitle,
      dominantIndustry,
      topKeywords: topTokens.slice(0, 8),
      seniority,
      locationHint: topLocation,
      profileCount: clusterRows.length,
      representativeProfiles: representative,
    };
  });

  const nodes: ICPOutput["graph_network"]["nodes"] = [];
  const links: ICPOutput["graph_network"]["links"] = [];

  for (const avatar of avatars) {
    nodes.push({ id: avatar.id, label: avatar.label, type: "avatar", weight: Math.min(10, Math.round((avatar.profileCount / rows.length) * 10) + 3) });
  }

  topTitles.slice(0, 6).forEach((title, i) => {
    const id = `role_${i + 1}`;
    nodes.push({ id, label: title, type: "role", weight: normalizeWeight(titleFreq.get(title) ?? 1, rows.length) });
    for (const avatar of avatars) {
      links.push({ source: avatar.id, target: id, relationship: "HUNTS_TITLE" });
    }
  });

  topIndustries.slice(0, 5).forEach((industry, i) => {
    const id = `ind_${i + 1}`;
    nodes.push({ id, label: industry, type: "industry", weight: normalizeWeight(industryFreq.get(industry) ?? 1, maxIndCount) });
    for (const avatar of avatars) {
      links.push({ source: avatar.id, target: id, relationship: "TARGETS_INDUSTRY" });
    }
  });

  const maxSignalCount = Math.max(...[...signalFreq.values()], 1);
  allTriggers.slice(0, 6).forEach((sig, i) => {
    const id = `sig_${i + 1}`;
    nodes.push({ id, label: sig, type: "signal", weight: normalizeWeight(signalFreq.get(sig) ?? 1, maxSignalCount) });
    for (const avatar of avatars) {
      links.push({ source: avatar.id, target: id, relationship: "MONITORS_SIGNAL" });
    }
  });

  const seniorityLevels = [...new Set(rows.map((r) => detectSeniority(r.title || "")))].slice(0, 3);

  return {
    metadata: {
      synthesis_timestamp: now,
      analyzed_sample_size: rows.length,
      signals_analyzed: signals.length,
    },
    avatars,
    sillage_feed_parameters: {
      target_industries: topIndustries,
      boolean_query: buildBooleanQuery(topIndustries, allTriggers),
      high_intent_triggers: allTriggers,
      persona: {
        job_title: topTitles[0] ?? "Director",
        location: topLocation,
        keywords: topTokens.slice(0, 10),
        industries: topIndustries,
        seniority_levels: seniorityLevels,
      },
    },
    fullenrich_feed_parameters: {
      primary_titles: topTitles.slice(0, 5),
      secondary_titles: topTitles.slice(5, 10),
      seniority_level: topSeniority,
    },
    graph_network: { nodes, links },
  };
}
