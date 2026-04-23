import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Wand2, RotateCcw } from "lucide-react";

const GNOMAD_POPULATIONS = {
  AFR: "African/African-American",
  AMR: "Latino/Admixed American",
  ASJ: "Ashkenazi Jewish",
  EAS: "East Asian",
  FIN: "European Finnish",
  NFE: "European non-Finnish",
  SAS: "South Asian",
  MID: "Middle Eastern",
  OTH: "Other",
};

const POPULATION_ALIASES = {
  AFR: "AFR",
  "AFRICAN/AFRICAN-AMERICAN": "AFR",
  AMR: "AMR",
  "LATINO/ADMIXED AMERICAN": "AMR",
  ASJ: "ASJ",
  "ASHKENAZI JEWISH": "ASJ",
  EAS: "EAS",
  "EAST ASIAN": "EAS",
  FIN: "FIN",
  "EUROPEAN FINNISH": "FIN",
  NFE: "NFE",
  "EUROPEAN NON-FINNISH": "NFE",
  SAS: "SAS",
  "SOUTH ASIAN": "SAS",
  MID: "MID",
  "MIDDLE EASTERN": "MID",
  OTH: "OTH",
  OTHER: "OTH",
};

const FOUNDER_POPULATIONS = new Set(["ASJ", "FIN"]);

const AA_FULL_NAMES = {
  Ala: "Alanine",
  Arg: "Arginine",
  Asn: "Asparagine",
  Asp: "Aspartic acid",
  Cys: "Cysteine",
  Gln: "Glutamine",
  Glu: "Glutamic acid",
  Gly: "Glycine",
  His: "Histidine",
  Ile: "Isoleucine",
  Leu: "Leucine",
  Lys: "Lysine",
  Met: "Methionine",
  Phe: "Phenylalanine",
  Pro: "Proline",
  Ser: "Serine",
  Thr: "Threonine",
  Trp: "Tryptophan",
  Tyr: "Tyrosine",
  Val: "Valine",
};

const POPULATION_PLACEHOLDER = [
  "AFR 1 200000 0 0.0005",
  "African/African-American 1 200000 0 0.0005",
  "European non-Finnish 38 1111910 0 0.0034174",
].join("\n");

const emptyForm = {
  rawInput:
    "BARD1\tPrimary\tc.476G>A\tp.Ser159Asn\nEuropean non-Finnish 38\t1,111,910\t0\t0.0034174\nAFR 1\t200,000\t0\t0.0005\ntotal 39\t1,461,430\t0\t0.0026688\nREVEL (v2021-05-03): Score: 0.117.\nSpliceAI 0.00\nUncertain significance(4); Likely benign(1)\nVariation ID: 186797",
  gene: "",
  tier: "",
  cdna: "",
  protein: "",
  rsid: "",
  variantType: "auto",
  populationsText: "",
  totalAc: "",
  totalAn: "",
  totalHom: "",
  revel: "",
  spliceAi: "",
  clinvarSummary: "",
  variationId: "",
  spliceSiteType: "donor",
  truncationDomain: "",
  inframeResidueCount: "",
  inframeKnownFunction: "without known function",
  downstreamAaCount: "",
  intronNumber: "",
};

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(String(value).replace(/,/g, "").replace(/%/g, ""));
}

function toPercent(ac, an) {
  const acNum = cleanNumber(ac);
  const anNum = cleanNumber(an);
  if (!anNum || Number.isNaN(acNum) || Number.isNaN(anNum)) return "";
  const value = (acNum / anNum) * 100;
  return `${Number(value.toPrecision(5))}%`;
}

function formatPercentFromRaw(value) {
  const num = cleanNumber(value);
  if (Number.isNaN(num)) return "";
  if (String(value).includes("%")) return `${Number(num.toPrecision(5))}%`;
  return `${Number((num * 100).toPrecision(5))}%`;
}

function normalizePopulationLabel(label) {
  return String(label || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseClinVarSummary(text) {
  const result = {
    uncertain: "",
    likelyBenign: "",
    benign: "",
    likelyPathogenic: "",
    pathogenic: "",
  };

  if (!text) return result;

  const normalized = String(text)
    .replace(/\r/g, "\n")
    .replace(/;+/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();

  const inlinePatterns = [
    ["uncertain", /uncertain significance\s*\((\d+)\)/i],
    ["likelyBenign", /likely benign\s*\((\d+)\)/i],
    ["benign", /(^|[^a-z])benign\s*\((\d+)\)/i],
    ["likelyPathogenic", /likely pathogenic\s*\((\d+)\)/i],
    ["pathogenic", /(^|[^a-z])pathogenic\s*\((\d+)\)/i],
  ];

  inlinePatterns.forEach(([key, regex]) => {
    const match = normalized.match(regex);
    if (match) result[key] = match[match.length - 1];
  });

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    const next = lines[i + 1] || "";
    const nextNumberMatch = next.match(/^(\d+)$/);
    if (!nextNumberMatch) continue;

    if (/^uncertain significance$/i.test(current) && !result.uncertain) result.uncertain = nextNumberMatch[1];
    if (/^likely benign$/i.test(current) && !result.likelyBenign) result.likelyBenign = nextNumberMatch[1];
    if (/^benign$/i.test(current) && !result.benign) result.benign = nextNumberMatch[1];
    if (/^likely pathogenic$/i.test(current) && !result.likelyPathogenic) result.likelyPathogenic = nextNumberMatch[1];
    if (/^pathogenic$/i.test(current) && !result.pathogenic) result.pathogenic = nextNumberMatch[1];
  }

  return result;
}

function parsePopulationLine(line) {
  const normalized = (line || "").trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.+?)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+([0-9.]+%?)$/i);
  if (!match) return null;

  const code = POPULATION_ALIASES[normalizePopulationLabel(match[1])];
  if (!code) return null;

  return {
    code,
    ac: match[2],
    an: match[3],
    hom: match[4],
    afRaw: match[5],
  };
}

function buildPopulationsText(populations) {
  return populations
    .map((pop) => `${GNOMAD_POPULATIONS[pop.code] || pop.code} ${pop.ac}\t${pop.an}\t${pop.hom}\t${pop.afRaw || toPercent(pop.ac, pop.an)}`)
    .join("\n");
}

function parseRawInput(raw) {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = {
    gene: "",
    tier: "",
    cdna: "",
    protein: "",
    rsid: "",
    populationsText: "",
    totalAc: "",
    totalAn: "",
    totalHom: "",
    revel: "",
    spliceAi: "",
    clinvarSummary: "",
    variationId: "",
  };

  const populationRows = [];
  const clinvarLines = [];

  if (lines[0]) {
    const firstLine = lines[0].replace(/\s+/g, " ").trim();
    const cdnaMatch = firstLine.match(/\bc\.[^\s]+/i);
    const proteinMatch = firstLine.match(/\bp\.[^\s]+/i);
    const rsMatch = firstLine.match(/\b(rs\d+)\b/i);
    const tokens = firstLine.split(" ");

    parsed.gene = tokens[0] || "";
    parsed.cdna = cdnaMatch ? cdnaMatch[0] : "";
    parsed.protein = proteinMatch ? proteinMatch[0] : "";
    parsed.rsid = rsMatch ? rsMatch[1] : "";

    const tierTokens = tokens.filter(
      (token, index) => index > 0 && token !== parsed.cdna && token !== parsed.protein && token !== parsed.rsid
    );
    parsed.tier = tierTokens[0] || "";
  }

  lines.forEach((line, index) => {
    let match;
    const normalized = line.replace(/\s+/g, " ").trim();

    const pop = parsePopulationLine(normalized);
    if (pop) {
      populationRows.push(pop);
      return;
    }

    if (/^total\s+/i.test(normalized)) {
      match = normalized.match(/^total\s+([\d,]+)\s+([\d,]+)\s+(\d+)(?:\s+([0-9.]+%?))?/i);
      if (match) {
        parsed.totalAc = match[1];
        parsed.totalAn = match[2];
        parsed.totalHom = match[3];
      }
      return;
    }

    if (/REVEL/i.test(normalized)) {
      match = normalized.match(/(?:Score[:\s]*|REVEL(?:\s*\([^)]*\))?[:\s]*)([0-9]*\.?[0-9]+)/i);
      if (match) parsed.revel = match[1];
      return;
    }

    if (/Splice?AI/i.test(normalized)) {
      match = normalized.match(/([0-9.]+)\s*$/);
      if (match) parsed.spliceAi = match[1];
      return;
    }

    if (/Variation ID/i.test(normalized)) {
      match = normalized.match(/Variation ID:\s*(\d+)/i);
      if (match) parsed.variationId = match[1];
      return;
    }

    if (/\brs\d+\b/i.test(normalized) && !parsed.rsid) {
      match = normalized.match(/\b(rs\d+)\b/i);
      if (match) parsed.rsid = match[1];
      return;
    }

    if (/uncertain significance|likely benign|^benign$|likely pathogenic|^pathogenic$/i.test(normalized)) {
      clinvarLines.push(normalized);
      const next = lines[index + 1] ? lines[index + 1].trim() : "";
      if (/^\d+$/.test(next)) clinvarLines.push(next);
    }
  });

  parsed.clinvarSummary = clinvarLines.join("\n");
  parsed.populationsText = buildPopulationsText(populationRows);
  return parsed;
}

function parsePopulationsText(populationsText) {
  return populationsText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parsePopulationLine)
    .filter(Boolean);
}

function inferVariantType(protein, cdna) {
  const proteinValue = (protein || "").replace(/[()]/g, "");
  const cdnaValue = cdna || "";

  if (/p\.=$/i.test(proteinValue) || /=/.test(proteinValue)) return "synonymous";
  if (/fs/i.test(proteinValue)) return "frameshift";
  if (/delins/i.test(proteinValue) || /delins/i.test(cdnaValue)) return "inframe_indel";
  if (/dup/i.test(proteinValue) && !/fs/i.test(proteinValue)) return "inframe_duplication";
  if (/del/i.test(proteinValue) && !/fs/i.test(proteinValue)) return "inframe_deletion";
  if (/ins/i.test(proteinValue) && !/fs/i.test(proteinValue)) return "inframe_insertion";
  if (/Ter|\*/i.test(proteinValue)) return "nonsense";
  if (/^[cn]\./i.test(cdnaValue) && /[+-](?:1|2)(?!\d)/.test(cdnaValue)) return "splice";
  if (/^[cn]\./i.test(cdnaValue) && /[+-](?:[3-9]|1\d|20)(?!\d)/.test(cdnaValue)) return "intronic";
  if (/p\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2}$/i.test(proteinValue)) return "missense";
  return "other";
}

function classifyRevel(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return "";
  if (n >= 0.772) return "high";
  if (n <= 0.185) return "low";
  return "mid";
}

function classifySpliceAi(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return "";
  if (n <= 0.1) return "low";
  if (n < 0.2) return "mid";
  return "high";
}

function parseProteinChange(protein) {
  const cleaned = (protein || "").replace(/[()]/g, "");
  const match = cleaned.match(/^p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2}|Ter|\*)/);
  if (!match) return null;
  return {
    fromFull: AA_FULL_NAMES[match[1]] || match[1],
    codon: match[2],
    toFull: match[3] === "Ter" || match[3] === "*" ? "premature stop codon" : AA_FULL_NAMES[match[3]] || match[3],
  };
}

function getPopulationStats(populations) {
  const enriched = populations.map((pop) => {
    const computedAf = cleanNumber(pop.ac) / cleanNumber(pop.an);
    const explicitAf = pop.afRaw
      ? String(pop.afRaw).includes("%")
        ? cleanNumber(pop.afRaw) / 100
        : cleanNumber(pop.afRaw)
      : NaN;
    const afNumeric = Number.isFinite(explicitAf) ? explicitAf : computedAf;

    return {
      ...pop,
      afNumeric,
      afPercent: pop.afRaw ? formatPercentFromRaw(pop.afRaw) : toPercent(pop.ac, pop.an),
      name: GNOMAD_POPULATIONS[pop.code] || pop.code,
      isFounder: FOUNDER_POPULATIONS.has(pop.code),
    };
  });

  const valid = enriched.filter((pop) => Number.isFinite(pop.afNumeric));
  if (valid.length === 0) return { highest: null, highestNonFounder: null };

  const highest = [...valid].sort((a, b) => b.afNumeric - a.afNumeric)[0];
  const nonFounder = valid.filter((pop) => !pop.isFounder);
  const highestNonFounder = nonFounder.length > 0 ? [...nonFounder].sort((a, b) => b.afNumeric - a.afNumeric)[0] : null;

  return { highest, highestNonFounder };
}

function getIntronicSpliceRegion(cdna) {
  const value = cdna || "";
  if (value.includes("+")) return "5’";
  if (value.includes("-")) return "3'";
  return "5’/3'";
}

function buildVariantIntroLine(data, variantType) {
  const gene = data.gene || "GENE";
  const rs = data.rsid ? ` (${data.rsid})` : "";

  if (variantType === "missense") {
    const parsed = parseProteinChange(data.protein);
    if (!parsed) return `The heterozygous germline variant, ${gene} ${data.cdna} requires further evaluation.`;
    return `The heterozygous germline variant, ${gene} ${data.cdna} changes a(n) ${parsed.fromFull} to ${parsed.toFull} at amino acid position ${parsed.codon} (${data.protein}).`;
  }

  if (variantType === "nonsense") {
    const parsed = parseProteinChange(data.protein);
    const fromAa = parsed?.fromFull || "amino acid";
    return `This heterozygous ${gene} ${data.cdna} variant is a nonsense mutation that changes a(n) ${fromAa} to a premature stop codon (${data.protein}) and is predicted to lead to a truncated or absent protein.`;
  }

  if (variantType === "frameshift") {
    const parsed = parseProteinChange((data.protein || "").replace(/fs.*/i, ""));
    const fromAa = parsed?.fromFull || "amino acid";
    return `This heterozygous ${gene} ${data.cdna} variant is predicted to cause a frameshift and leads to a premature termination codon ${data.downstreamAaCount || "YYY"} amino acids downstream ${fromAa}. This alteration is predicted to lead to a truncated or absent protein, and truncating variants in ${gene} are known to be pathogenic.`;
  }

  if (variantType === "splice") {
    return `This heterozygous ${gene} ${data.cdna} variant occurs in the invariant region (+/- 1,2) of the splice consensus sequence and is predicted to cause altered splicing leading to an abnormal or absent protein.`;
  }

  if (variantType === "intronic") {
    return `This heterozygous ${gene} ${data.cdna} variant occurs in the ${getIntronicSpliceRegion(data.cdna)} splice region of intron ${data.intronNumber || "X"} of the ${gene} gene.`;
  }

  if (variantType === "synonymous") {
    return `This heterozygous ${gene} ${data.cdna} variant is a synonymous variant that does not alter the amino acid at this position (${data.protein}).`;
  }

  if (variantType === "inframe_deletion") {
    return `The ${data.cdna} (${data.protein}) in-frame deletion variant${rs} involves residues in a tract of ${data.inframeResidueCount || "XXX"} residues ${data.inframeKnownFunction || "without known function"} [PM4/BP3].`;
  }

  if (variantType === "inframe_duplication") {
    return `The ${data.cdna} (${data.protein}) in-frame duplication variant${rs} involves residues in a tract of ${data.inframeResidueCount || "XXX"} residues ${data.inframeKnownFunction || "without known function"} [PM4/BP3].`;
  }

  if (variantType === "inframe_insertion") {
    return `The ${data.cdna} (${data.protein}) in-frame insertion variant${rs} involves residues in a tract of ${data.inframeResidueCount || "XXX"} residues ${data.inframeKnownFunction || "without known function"} [PM4/BP3].`;
  }

  if (variantType === "inframe_indel") {
    return `The ${data.cdna} (${data.protein}) in-frame deletion/duplication/insertion variant${rs} involves residues in a tract of ${data.inframeResidueCount || "XXX"} residues ${data.inframeKnownFunction || "without known function"} [PM4/BP3].`;
  }

  return `The ${data.cdna} variant${rs} requires further evaluation.`;
}

function buildGnomadLine(data) {
  if (!data.totalAc || !data.totalAn) {
    return "This variant is absent from the population database gnomAD v4.1.0 (Genome Aggregation Database; http://gnomad.broadinstitute.org/).";
  }

  const populations = parsePopulationsText(data.populationsText);
  const totalAf = toPercent(data.totalAc, data.totalAn);
  const hom = cleanNumber(data.totalHom);
  const { highest, highestNonFounder } = getPopulationStats(populations);

  let line = "";
  if (!Number.isNaN(hom) && hom > 0) {
    line = `This variant has been identified in ${totalAf} (${data.totalAc}/${data.totalAn}) of total chromosomes including ${data.totalHom} homozygote(s) by gnomAD v4.1.0 (Genome Aggregation Database; http://gnomad.broadinstitute.org/)`;
  } else {
    line = `This variant has been identified in ${totalAf} (${data.totalAc}/${data.totalAn}) of total chromosomes by gnomAD v4.1.0 (Genome Aggregation Database; http://gnomad.broadinstitute.org/)`;
  }

  if (highest) {
    line += `, with the highest allele frequency of ${highest.afPercent} (${highest.ac}/${highest.an}) observed in the ${highest.name} population`;
  }

  line += ".";

  if (highest && highest.isFounder && highestNonFounder) {
    line += ` The highest allele frequency among non-founder populations is ${highestNonFounder.afPercent} (${highestNonFounder.ac}/${highestNonFounder.an}) in the ${highestNonFounder.name} population.`;
  }

  return line;
}

function buildRevelLine(data, variantType) {
  if (variantType !== "missense" || !data.revel) return "";
  const revelClass = classifyRevel(data.revel);

  if (revelClass === "high") {
    return `The computational prediction tool REVEL (https://sites.google.com/site/revelgenomics/) suggests that the ${data.protein} variant may impact the protein, though this information is not predictive enough to determine pathogenicity. (REVEL score ${data.revel})`;
  }

  if (revelClass === "low") {
    return `The computational prediction tool REVEL (https://sites.google.com/site/revelgenomics/) suggests that the ${data.protein} variant may not impact the protein, though this information is not predictive enough to determine pathogenicity. (REVEL score ${data.revel})`;
  }

  return `The computational prediction tool REVEL (https://sites.google.com/site/revelgenomics/) does not provide strong support for or against an impact to the protein. (REVEL score ${data.revel})`;
}

function buildSpliceAiLine(data) {
  if (!data.spliceAi) return "";
  const spliceClass = classifySpliceAi(data.spliceAi);

  if (spliceClass === "low") {
    return "Computational splice prediction tool Splice AI (https://spliceailookup.broadinstitute.org/) does not predict an impact on splicing, although experimental studies have not confirmed this prediction.";
  }

  if (spliceClass === "mid") {
    return "Computational splice prediction tool Splice AI (https://spliceailookup.broadinstitute.org/) does not provide strong support for or against an impact to splicing.";
  }

  return `Computational splice prediction tool Splice AI (https://spliceailookup.broadinstitute.org/) suggests that this variant may impact splicing, although this prediction has not been confirmed by experimental studies. Alamut tools have identified a potential splice alteration near ${data.cdna || "this position"}.`;
}

function buildClinVarLine(data) {
  if (!data.clinvarSummary && !data.variationId) {
    return "This variation has not been documented in the ClinVar database.";
  }

  const c = parseClinVarSummary(data.clinvarSummary);
  const parts = [];
  if (c.uncertain) parts.push(`uncertain significance (n=${c.uncertain})`);
  if (c.likelyBenign) parts.push(`likely benign (n=${c.likelyBenign})`);
  if (c.benign) parts.push(`benign (n=${c.benign})`);
  if (c.likelyPathogenic) parts.push(`likely pathogenic (n=${c.likelyPathogenic})`);
  if (c.pathogenic) parts.push(`pathogenic (n=${c.pathogenic})`);

  if (parts.length === 0) {
    return `This variation has been documented in the ClinVar database${data.variationId ? ` (Variation ID: ${data.variationId})` : ""}.`;
  }

  return `This variation has been documented in the ClinVar database with records suggesting classification as ${parts.join(" or ")}${data.variationId ? ` (Variation ID: ${data.variationId})` : ""}.`;
}

function buildNote(data) {
  const inferredType = data.variantType === "auto" ? inferVariantType(data.protein, data.cdna) : data.variantType;
  const lines = [buildVariantIntroLine(data, inferredType), buildGnomadLine(data)];

  const revelLine = buildRevelLine(data, inferredType);
  if (revelLine) lines.push(revelLine);

  const spliceAiLine = buildSpliceAiLine(data);
  if (spliceAiLine) lines.push(spliceAiLine);

  lines.push(buildClinVarLine(data));

  return { note: lines.join("\n\n"), inferredType };
}

export default function CurationAssistant() {
  const [form, setForm] = useState(emptyForm);

  const parsedPreview = useMemo(() => parseRawInput(form.rawInput), [form.rawInput]);

  const mergedData = useMemo(() => {
    const merged = { ...parsedPreview, ...form };
    Object.keys(merged).forEach((key) => {
      if (form[key] === "" && key !== "rawInput" && Object.prototype.hasOwnProperty.call(parsedPreview, key)) {
        merged[key] = parsedPreview[key];
      }
    });
    return merged;
  }, [parsedPreview, form]);

  const { note, inferredType } = useMemo(() => buildNote(mergedData), [mergedData]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyParse() {
    const parsed = parseRawInput(form.rawInput);
    setForm((prev) => ({ ...prev, ...parsed }));
  }

  function resetForm() {
    setForm(emptyForm);
  }

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(note);
    } catch (error) {
      console.error(error);
    }
  }

  const showIntronWarning = inferredType === "intronic" && !mergedData.intronNumber;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">CurationAssistant</CardTitle>
                  <p className="mt-2 text-sm text-slate-600">
                    The system generates a curation note based on the variant type and predefined template rules when variant evidence is entered.
                  </p>
                </div>
                <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white">Rules + Templates</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Raw input</span>
                <Textarea
                  value={form.rawInput}
                  onChange={(e) => setField("rawInput", e.target.value)}
                  className="min-h-[220px] rounded-2xl bg-white"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button onClick={applyParse} className="rounded-2xl">
                  <Wand2 className="mr-2 h-4 w-4" /> Parse input
                </Button>
                <Button variant="outline" onClick={resetForm} className="rounded-2xl">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>Editable evidence fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["gene", "Gene"],
                  ["tier", "Tier"],
                  ["cdna", "cDNA"],
                  ["protein", "Protein"],
                  ["rsid", "rsID"],
                  ["variationId", "Variation ID"],
                  ["totalAc", "Total AC"],
                  ["totalAn", "Total AN"],
                  ["totalHom", "Total homozygotes"],
                  ["revel", "REVEL"],
                  ["spliceAi", "SpliceAI"],
                  ["truncationDomain", "Truncation domain"],
                  ["downstreamAaCount", "Frameshift downstream AA"],
                  ["intronNumber", "Intron number"],
                  ["inframeResidueCount", "In-frame residue count"],
                ].map(([key, label]) => (
                  <label key={key} className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    <Input
                      value={form[key] ?? ""}
                      onChange={(e) => setField(key, e.target.value)}
                      className="rounded-2xl bg-white"
                    />
                  </label>
                ))}
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">gnomAD population rows</span>
                <Textarea
                  value={form.populationsText}
                  onChange={(e) => setField("populationsText", e.target.value)}
                  className="min-h-[180px] rounded-2xl bg-white font-mono text-sm"
                  placeholder={POPULATION_PLACEHOLDER}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Variant type</span>
                  <Select value={form.variantType} onValueChange={(value) => setField("variantType", value)}>
                    <SelectTrigger className="rounded-2xl bg-white">
                      <SelectValue placeholder="Select variant type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto detect</SelectItem>
                      <SelectItem value="missense">Missense</SelectItem>
                      <SelectItem value="synonymous">Synonymous</SelectItem>
                      <SelectItem value="nonsense">Nonsense</SelectItem>
                      <SelectItem value="frameshift">Frameshift</SelectItem>
                      <SelectItem value="splice">Canonical splice</SelectItem>
                      <SelectItem value="intronic">Intronic</SelectItem>
                      <SelectItem value="inframe_deletion">In-frame deletion</SelectItem>
                      <SelectItem value="inframe_duplication">In-frame duplication</SelectItem>
                      <SelectItem value="inframe_insertion">In-frame insertion</SelectItem>
                      <SelectItem value="inframe_indel">Complex in-frame indel</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Splice site type</span>
                  <Select value={form.spliceSiteType} onValueChange={(value) => setField("spliceSiteType", value)}>
                    <SelectTrigger className="rounded-2xl bg-white">
                      <SelectValue placeholder="Select splice site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="donor">Donor</SelectItem>
                      <SelectItem value="acceptor">Acceptor</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">In-frame tract function</span>
                <Select value={form.inframeKnownFunction} onValueChange={(value) => setField("inframeKnownFunction", value)}>
                  <SelectTrigger className="rounded-2xl bg-white">
                    <SelectValue placeholder="Select function" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="without known function">Without known function</SelectItem>
                    <SelectItem value="with known function">With known function</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
                <div className="font-medium">Detected type</div>
                <div className="mt-2 capitalize">{inferredType.replace(/_/g, " ")}</div>
                {showIntronWarning && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                    ⚠️ Intron number is missing. Please enter intron number for accurate reporting.
                  </div>
                )}
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">ClinVar summary</span>
                <Textarea
                  value={form.clinvarSummary}
                  onChange={(e) => setField("clinvarSummary", e.target.value)}
                  className="min-h-[100px] rounded-2xl bg-white"
                />
              </label>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Generated output</CardTitle>
                <Button onClick={copyNote} variant="outline" className="rounded-2xl">
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea value={note} readOnly className="min-h-[640px] rounded-2xl bg-white font-mono text-sm" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
