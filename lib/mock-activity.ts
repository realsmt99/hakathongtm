import type { LinkedInRow } from "@/lib/csv-parser";
import type { ActivityItem } from "@/lib/claude-client";

/**
 * Realistic MOCK generators for a FUNDRAISING / mécénat use case.
 *
 * The user runs a cause (arts / women's empowerment / inclusion) and wants to
 * find NEW corporate foundations to approach for funding. So:
 *  - generateMockActivity() reflects what the *seed* patrons champion, so Claude
 *    can learn the profile of a fundable patron.
 *  - generateMockSignals() surfaces NEW foundation decision-makers (at OTHER
 *    companies than the seed list) at genuine "fundable moments": a new grant
 *    program, a fresh appointment, an open call for projects, etc.
 * These are used only until Sillage's live agents surface real activity.
 */

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

// Causes the seed patrons care about — drives the language of the signals.
const CAUSE_MATCHERS: { test: RegExp; causes: string[] }[] = [
  { test: /femme|women|égalit|genre/i, causes: ["l'autonomisation des femmes", "l'égalité femmes-hommes", "le soutien aux femmes artistes"] },
  { test: /art|cultur|expo|création|artiste|résidence/i, causes: ["l'art contemporain", "les résidences d'artistes", "la création émergente"] },
  { test: /inclus|exclusion|solidar|chance|social/i, causes: ["l'inclusion sociale", "l'égalité des chances"] },
  { test: /savoir-faire|artisan|transmission|métier/i, causes: ["la transmission des savoir-faire"] },
];

function detectCauses(rows: LinkedInRow[]): string[] {
  const blob = rows.map((r) => `${r.title} ${r.about}`).join(" ");
  const found: string[] = [];
  for (const { test, causes } of CAUSE_MATCHERS) {
    if (test.test(blob)) found.push(...causes);
  }
  return found.length ? [...new Set(found)] : ["le mécénat culturel", "l'impact social"];
}

// REAL-LOOKING prospects (deliberately NOT in the seed list): VCs, angels and
// impact investors who publicly engage with the cause on LinkedIn. We only know
// their profile — no email/phone — until the user runs enrichment. Firms are
// real French/EU funds; the individuals are illustrative.
interface Investor {
  name: string;
  title: string;
  firm: string;
}
const INVESTOR_POOL: Investor[] = [
  { name: "Camille Laurent", title: "General Partner", firm: "Alven" },
  { name: "Marc Dubois", title: "Partner", firm: "Daphni" },
  { name: "Léa Rousseau", title: "Investor", firm: "Kima Ventures" },
  { name: "Thomas Renaud", title: "Angel Investor", firm: "Independent" },
  { name: "Inès Haddad", title: "Principal", firm: "Serena" },
  { name: "Sophie Kervern", title: "Partner", firm: "Elaia Partners" },
  { name: "Nicolas Petit", title: "Managing Partner", firm: "Newfund" },
  { name: "Amélie Girard", title: "Impact Investor", firm: "INCO Ventures" },
  { name: "Raphaël Marchand", title: "Partner", firm: "Partech" },
  { name: "Chloé Vasseur", title: "Investment Director", firm: "Bpifrance" },
  { name: "Julie Fontaine", title: "Founding Partner", firm: "SISTA Fund" },
  { name: "Karim Benslimane", title: "Angel Investor", firm: "Independent" },
];

// What they engaged with — the cause the user is raising for. Defaults to
// women's empowerment / impact, but blended with any causes detected in the CSV.
const THEMES = [
  "l'entrepreneuriat féminin",
  "le financement des femmes fondatrices",
  "la mixité dans la tech",
  "l'égalité femmes-hommes dans le venture",
  "l'empowerment des femmes",
  "l'inclusion et la diversité",
];

// Programs referenced in the seed patrons' mock POSTS (used by Claude analysis).
const PROGRAMS = [
  "Women In Motion", "Elles font l'art", "Résidences Émergentes", "Talents Solidaires",
  "Art pour Tous", "Prix des Créatrices", "Femmes & Culture", "Nouveaux Mécènes",
];

// Engagement-based signal types (highest-intent first). These are what the user
// actually sees on LinkedIn before they have any contact details.
const SIGNAL_TYPES = [
  "commented",
  "liked_post",
  "shared_post",
  "new_fund",
  "event_speaker",
] as const;

function slug(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, "-");
}

export interface MockSignal {
  id: number;
  type: string;
  summary: string;
  detected_at: string;
  lead: { name: string; title: string; linkedin_url?: string } | null;
  account: { name: string; domain?: string } | null;
  mock: true;
}

/**
 * Mock LinkedIn activity from the SEED patrons, so Claude can learn what a
 * fundable patron looks like (what they champion, how they talk about giving).
 */
export function generateMockActivity(rows: LinkedInRow[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const people = rows.filter((r) => r.fullName && r.fullName !== "Unknown");
  const causes = detectCauses(rows);

  people.forEach((r, i) => {
    const cause = pick(causes, i);
    const program = pick(PROGRAMS, i);
    const other = people[(i + 1) % people.length];

    items.push({
      text: `Nous sommes fiers d'annoncer le soutien de ${r.company} à ${cause}. À travers notre programme « ${program} », nous accompagnons celles et ceux qui font vivre la création et l'engagement. Merci à nos partenaires associatifs.`,
      type: "linkedinPost",
      company: r.company,
      author: r.fullName,
    });

    if (other && other.fullName !== r.fullName) {
      items.push({
        text: `Bravo ${other.fullName.split(" ")[0]} et toute l'équipe de ${other.company} pour votre engagement en faveur de ${pick(causes, i + 1)}. Le mécénat culturel n'a jamais été aussi essentiel.`,
        type: "linkedinComment",
        company: r.company,
        author: r.fullName,
      });
    }
  });

  return items;
}

function summaryFor(type: string, p: Investor, theme: string): string {
  const firm = p.firm === "Independent" ? "à titre personnel" : `chez ${p.firm}`;
  switch (type) {
    case "liked_post":
      return `${p.name} (${p.title} ${firm}) a aimé une publication sur ${theme}.`;
    case "shared_post":
      return `${p.name} a partagé un article sur ${theme} — signal d'intérêt public.`;
    case "new_fund":
      return `${p.firm} annonce un véhicule d'investissement dédié à ${theme}. ${p.name} pilote les décisions.`;
    case "event_speaker":
      return `${p.name} intervient sur ${theme} lors d'une table ronde — thèse d'investissement affichée.`;
    case "commented":
    default:
      return `${p.name} a commenté un post sur ${theme} : « il faut financer davantage les femmes fondatrices ».`;
  }
}

/**
 * Mock "warm prospects": real-looking VCs / angels / impact investors who have
 * PUBLICLY engaged with the cause on LinkedIn. We only know their profile — no
 * email or phone — until the user runs enrichment to reveal contact details.
 */
export function generateMockSignals(rows: LinkedInRow[]): MockSignal[] {
  // Blend the CSV-detected causes with the default women-empowerment themes so
  // the engagement language matches what the user is raising for.
  const detected = detectCauses(rows).filter((c) => !/mécénat culturel|impact social/i.test(c));
  const themes = [...new Set([...detected, ...THEMES])];
  const now = Date.now();
  const signals: MockSignal[] = [];
  let id = 900000;

  INVESTOR_POOL.forEach((p, i) => {
    const type = SIGNAL_TYPES[i % SIGNAL_TYPES.length];
    const theme = pick(themes, i);
    signals.push({
      id: id++,
      type,
      summary: summaryFor(type, p, theme),
      detected_at: new Date(now - (i + 1) * 3300_000).toISOString(),
      // Profile only — deliberately no email/phone here. Enrichment fills those.
      lead: { name: p.name, title: p.title, linkedin_url: `https://www.linkedin.com/in/${slug(p.name)}` },
      account: { name: p.firm },
      mock: true,
    });
  });

  return signals;
}
