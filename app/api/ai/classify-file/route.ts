import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────

type MimeCategory =
  | "image"
  | "video"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "other";

type SemanticTag =
  | "deliverable"
  | "draft"
  | "reference"
  | "brand-asset"
  | "mockup"
  | "wireframe"
  | "proposal"
  | "report"
  | "invoice-doc"
  | "contract-doc"
  | "photo"
  | "illustration"
  | "icon"
  | "logo"
  | "social-media-asset"
  | "presentation"
  | "source-file";

interface ClassifyRequest {
  fileName: string;
  mimeType: string;
  projectName?: string;
  clientName?: string;
}

interface ClassifyResponse {
  suggestedTags: string[];
  suggestedDescription: string;
  category: MimeCategory;
  confidence: string;
}

// ── POST /api/ai/classify-file ────────────────────────────────

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-classify");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.light);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: ClassifyRequest = await req.json();
    const { fileName, mimeType, projectName, clientName } = body;

    if (!fileName || !mimeType) {
      return NextResponse.json(
        { error: "fileName and mimeType are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Rule-based fallback when no API key is configured
      return NextResponse.json(classifyWithRules(fileName, mimeType, projectName, clientName));
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = buildPrompt(fileName, mimeType, projectName, clientName);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fall back to rule-based if AI response can't be parsed
      return NextResponse.json(classifyWithRules(fileName, mimeType, projectName, clientName));
    }

    const parsed = JSON.parse(jsonMatch[0]) as ClassifyResponse;

    // Validate and sanitize the response
    const result: ClassifyResponse = {
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags.filter((t) => typeof t === "string").slice(0, 10)
        : [],
      suggestedDescription:
        typeof parsed.suggestedDescription === "string"
          ? parsed.suggestedDescription.slice(0, 500)
          : "",
      category: isValidCategory(parsed.category)
        ? parsed.category
        : inferCategory(mimeType),
      confidence:
        typeof parsed.confidence === "string" &&
        ["high", "medium", "low"].includes(parsed.confidence)
          ? parsed.confidence
          : "medium",
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/ai/classify-file]", err);
    return NextResponse.json(
      { error: "Failed to classify file" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ────────────────────────────────────────────

function buildPrompt(
  fileName: string,
  mimeType: string,
  projectName?: string,
  clientName?: string
): string {
  const contextLines: string[] = [];
  if (projectName) contextLines.push(`- Project: ${projectName}`);
  if (clientName) contextLines.push(`- Client: ${clientName}`);
  const contextBlock =
    contextLines.length > 0
      ? `\nPROJECT CONTEXT:\n${contextLines.join("\n")}`
      : "";

  return `You are a file classification assistant for a creative agency management platform. Analyze the following file and suggest appropriate tags, a description, and a category.

FILE INFO:
- File name: ${fileName}
- MIME type: ${mimeType}
${contextBlock}

CATEGORIES (pick exactly one):
"image", "video", "pdf", "document", "spreadsheet", "presentation", "archive", "other"

SEMANTIC TAGS (pick 2-5 that apply):
"deliverable", "draft", "reference", "brand-asset", "mockup", "wireframe", "proposal", "report", "invoice-doc", "contract-doc", "photo", "illustration", "icon", "logo", "social-media-asset", "presentation", "source-file"

RULES:
1. Choose the best-fitting category based on the MIME type
2. Suggest 2-5 semantic tags based on the file name, type, and project context
3. Write a concise 1-sentence description of what this file likely contains
4. Set confidence to "high", "medium", or "low" based on how certain you are

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "suggestedTags": ["tag1", "tag2"],
  "suggestedDescription": "A brief description of the file",
  "category": "image",
  "confidence": "high"
}`;
}

// ── Category helpers ──────────────────────────────────────────

const VALID_CATEGORIES: MimeCategory[] = [
  "image",
  "video",
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "archive",
  "other",
];

function isValidCategory(val: unknown): val is MimeCategory {
  return typeof val === "string" && VALID_CATEGORIES.includes(val as MimeCategory);
}

function inferCategory(mimeType: string): MimeCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";

  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "application/rtf"
  )
    return "document";

  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv"
  )
    return "spreadsheet";

  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.apple.keynote"
  )
    return "presentation";

  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-tar"
  )
    return "archive";

  return "other";
}

// ── Extension-based tag inference ─────────────────────────────

const EXTENSION_TAG_MAP: Record<string, SemanticTag[]> = {
  // Images
  jpg: ["photo"],
  jpeg: ["photo"],
  png: ["photo"],
  gif: ["photo"],
  webp: ["photo"],
  svg: ["icon", "illustration"],
  ico: ["icon"],
  // Design source files
  psd: ["source-file"],
  ai: ["source-file", "illustration"],
  sketch: ["source-file", "mockup"],
  fig: ["source-file", "mockup"],
  xd: ["source-file", "mockup"],
  indd: ["source-file"],
  // Documents
  pdf: ["reference"],
  doc: ["reference"],
  docx: ["reference"],
  txt: ["reference"],
  md: ["reference"],
  rtf: ["reference"],
  // Spreadsheets
  xls: ["report"],
  xlsx: ["report"],
  csv: ["report"],
  // Presentations
  ppt: ["presentation"],
  pptx: ["presentation"],
  key: ["presentation"],
  // Video
  mp4: ["deliverable"],
  mov: ["source-file"],
  avi: ["source-file"],
  mkv: ["source-file"],
  webm: ["deliverable"],
  // Archives
  zip: ["source-file"],
  rar: ["source-file"],
  "7z": ["source-file"],
};

const FILENAME_PATTERNS: { pattern: RegExp; tags: SemanticTag[] }[] = [
  { pattern: /logo/i, tags: ["logo", "brand-asset"] },
  { pattern: /brand/i, tags: ["brand-asset"] },
  { pattern: /icon/i, tags: ["icon"] },
  { pattern: /mockup|mock-up/i, tags: ["mockup"] },
  { pattern: /wireframe/i, tags: ["wireframe"] },
  { pattern: /draft/i, tags: ["draft"] },
  { pattern: /final/i, tags: ["deliverable"] },
  { pattern: /proposal/i, tags: ["proposal"] },
  { pattern: /invoice/i, tags: ["invoice-doc"] },
  { pattern: /contract|agreement|nda/i, tags: ["contract-doc"] },
  { pattern: /report|analytics|stats/i, tags: ["report"] },
  { pattern: /social|ig|fb|instagram|facebook|twitter|linkedin|tiktok/i, tags: ["social-media-asset"] },
  { pattern: /illustration|illust/i, tags: ["illustration"] },
  { pattern: /photo|img|image|pic/i, tags: ["photo"] },
  { pattern: /presentation|pitch|deck/i, tags: ["presentation"] },
  { pattern: /reference|ref|inspo|inspiration|moodboard/i, tags: ["reference"] },
  { pattern: /deliverable|delivery|handoff/i, tags: ["deliverable"] },
];

// ── Rule-based fallback classifier ────────────────────────────

function classifyWithRules(
  fileName: string,
  mimeType: string,
  projectName?: string,
  clientName?: string
): ClassifyResponse {
  const category = inferCategory(mimeType);

  // Collect tags from extension
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const tags = new Set<string>(EXTENSION_TAG_MAP[ext] || []);

  // Collect tags from filename patterns
  for (const { pattern, tags: matchTags } of FILENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      for (const t of matchTags) tags.add(t);
    }
  }

  // If no semantic tags inferred, add a default based on category
  if (tags.size === 0) {
    switch (category) {
      case "image":
        tags.add("photo");
        break;
      case "video":
        tags.add("deliverable");
        break;
      case "pdf":
        tags.add("reference");
        break;
      case "document":
        tags.add("reference");
        break;
      case "spreadsheet":
        tags.add("report");
        break;
      case "presentation":
        tags.add("presentation");
        break;
      case "archive":
        tags.add("source-file");
        break;
    }
  }

  // Build a description
  const description = buildRuleDescription(fileName, category, tags, projectName, clientName);

  // Confidence is lower for rule-based
  const confidence = tags.size >= 2 ? "medium" : "low";

  return {
    suggestedTags: Array.from(tags).slice(0, 5),
    suggestedDescription: description,
    category,
    confidence,
  };
}

function buildRuleDescription(
  fileName: string,
  category: MimeCategory,
  tags: Set<string>,
  projectName?: string,
  clientName?: string
): string {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

  const categoryLabel: Record<MimeCategory, string> = {
    image: "Image file",
    video: "Video file",
    pdf: "PDF document",
    document: "Document",
    spreadsheet: "Spreadsheet",
    presentation: "Presentation",
    archive: "Archive",
    other: "File",
  };

  const parts: string[] = [categoryLabel[category]];

  if (tags.has("logo")) parts.push("containing logo artwork");
  else if (tags.has("mockup")) parts.push("with design mockup");
  else if (tags.has("wireframe")) parts.push("with wireframe layout");
  else if (tags.has("invoice-doc")) parts.push("related to invoicing");
  else if (tags.has("contract-doc")) parts.push("related to contracts");
  else if (tags.has("proposal")) parts.push("with project proposal");
  else if (tags.has("social-media-asset")) parts.push("for social media");
  else if (tags.has("report")) parts.push("with data or reporting");
  else parts.push(`"${baseName}"`);

  if (projectName) parts.push(`for project ${projectName}`);
  if (clientName) parts.push(`(${clientName})`);

  return parts.join(" ") + ".";
}
