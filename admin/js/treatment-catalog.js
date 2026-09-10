/**
 * Treatment menu aligned with studio.html — used for admin labels and reference.
 */
export const TREATMENT_MENU = Object.freeze([
  { id: "consultation-advanced", title: "Skin Consultation & Advanced Facial", price: 60, category: "Consultation & Bespoke Facials" },
  { id: "advanced-facial", title: "Advanced Facial", price: 50, category: "Consultation & Bespoke Facials" },
  { id: "advanced-dermaplaning", title: "Advanced Facial & Dermaplaning", price: 60, category: "Consultation & Bespoke Facials" },
  { id: "acne-consultation", title: "Acne Consultation & Treatment", price: 70, category: "Consultation & Bespoke Facials" },
  { id: "leave-it-up-to-rachel", title: "Leave It Up To Rachel", priceLabel: "Treatment Dependent", category: "Consultation & Bespoke Facials" },
  { id: "fusion-electroporation", title: "Fusion Facial with Electroporation", price: 60, category: "Advanced Skin Treatments" },
  { id: "microneedling", title: "Microneedling", price: 80, category: "Advanced Skin Treatments" },
  { id: "microneedling-poly", title: "Microneedling × Polynucleotides", price: 115, category: "Advanced Skin Treatments" },
  { id: "chemical-peel", title: "Chemical Peel", price: 65, category: "Advanced Skin Treatments" },
  { id: "biorepeel", title: "BioRePeel", price: 70, category: "Advanced Skin Treatments" },
  { id: "biorepeel-dermaplaning", title: "BioRePeel × Dermaplaning", price: 80, category: "Advanced Skin Treatments" },
  { id: "hydradermabrasion", title: "Hydradermabrasion Facial", price: 55, category: "Advanced Skin Treatments" },
  { id: "seventy-hyal", title: "Seventy Hyal", price: 100, category: "Skin Boosters" },
  { id: "revs-pro-32", title: "Revs Pro 32", price: 135, category: "Skin Boosters" },
  { id: "ejal-40", title: "Ejal 40", price: 140, category: "Skin Boosters" },
  { id: "profhilo", title: "Profhilo", price: 200, category: "Skin Boosters" },
  { id: "vitaran-eyes", title: "Vitaran Eyes", price: 120, category: "Polynucleotides" }
]);

const byId = new Map(TREATMENT_MENU.map((t) => [t.id, t.title]));
const bySlug = new Map(
  TREATMENT_MENU.flatMap((t) => [
    [t.id, t.title],
    [t.id.replace(/-/g, "_"), t.title],
    [slugify(t.title), t.title]
  ])
);

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map platform offering id / slug to a readable treatment name. */
export function labelOffering(offeringId) {
  if (!offeringId) return "—";
  const raw = String(offeringId).trim();
  if (byId.has(raw)) return byId.get(raw);
  if (bySlug.has(raw)) return bySlug.get(raw);
  const norm = raw.toLowerCase().replace(/_/g, "-");
  if (byId.has(norm)) return byId.get(norm);
  for (const t of TREATMENT_MENU) {
    if (norm.includes(t.id) || raw.toLowerCase().includes(t.id.replace(/-/g, ""))) {
      return t.title;
    }
  }
  return raw.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isSalonAdmin() {
  return window.SITE_CONFIG?.admin?.theme === "salon";
}
