import { readFileSync } from "node:fs";

const requiredFiles = [
  "docs/api-use.md",
  "docs/privacy.md",
  "docs/compliance.md",
  "docs/local-setup.md"
];

const requiredTerms = [
  "official OAuth",
  "metadata",
  "excerpts",
  "deletion",
  "no model training"
];

const docs = requiredFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const missing = requiredTerms.filter((term) => !docs.toLowerCase().includes(term.toLowerCase()));

if (missing.length > 0) {
  console.error(`Missing documentation terms: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Documentation check passed.");
