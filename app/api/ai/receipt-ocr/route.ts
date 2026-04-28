import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// Must match the ExpenseCategory enum in prisma/schema.prisma
const VALID_CATEGORIES = [
  "SOFTWARE_TOOLS",
  "FREELANCER_PAYMENT",
  "VENDOR_PAYMENT",
  "STOCK_ASSETS",
  "PRINTING",
  "TRAVEL",
  "ADVERTISING",
  "OFFICE",
  "EQUIPMENT",
  "OTHER",
] as const;

type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

interface LineItem {
  description: string;
  amount: number;
}

interface ReceiptData {
  vendor: string | null;
  amount: number | null;
  currency: string;
  date: string | null;
  category: ExpenseCategory;
  lineItems: LineItem[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// ── POST /api/ai/receipt-ocr ───────────────────────────────────
export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-ocr");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.heavy);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No image file provided. Send a 'file' field in FormData." },
        { status: 400 },
      );
    }

    // Validate mime type
    const mimeType = file.type as AllowedMimeType;
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Accepted: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size (max 10 MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 },
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback response when API key is not configured
      return NextResponse.json({
        data: {
          vendor: null,
          amount: null,
          currency: "INR",
          date: null,
          category: "OTHER",
          lineItems: [],
          notes: "Receipt OCR is not available — ANTHROPIC_API_KEY is not configured.",
          confidence: "low",
        } satisfies ReceiptData,
        fallback: true,
      });
    }

    const anthropic = new Anthropic({ apiKey });

    const promptText = `You are a receipt data extraction assistant. Analyze this receipt image and extract the following information. Return ONLY valid JSON with no markdown formatting, no explanation, and no extra text.

Required JSON structure:
{
  "vendor": "<merchant/vendor name or null if unreadable>",
  "amount": <total amount as a number or null if unreadable>,
  "currency": "<ISO 4217 currency code, e.g. INR, USD, EUR — default to INR if unclear>",
  "date": "<date in YYYY-MM-DD format or null if unreadable>",
  "category": "<one of: SOFTWARE_TOOLS, FREELANCER_PAYMENT, VENDOR_PAYMENT, STOCK_ASSETS, PRINTING, TRAVEL, ADVERTISING, OFFICE, EQUIPMENT, OTHER>",
  "lineItems": [{"description": "<item name>", "amount": <item price as number>}],
  "notes": "<any additional relevant info such as payment method, tax details, invoice/receipt number, or null>",
  "confidence": "<high if all key fields are clearly readable, medium if some fields are estimated or partially readable, low if the image is blurry/unclear or most fields are guessed>"
}

Category mapping guidance:
- SOFTWARE_TOOLS: Software subscriptions, SaaS tools, licenses, digital services
- FREELANCER_PAYMENT: Payments to freelancers or contractors
- VENDOR_PAYMENT: Payments to vendors, suppliers, or service providers
- STOCK_ASSETS: Stock photos, videos, fonts, templates, design assets
- PRINTING: Printing services, business cards, brochures, banners
- TRAVEL: Transportation, flights, hotels, meals during travel
- ADVERTISING: Ad spend, sponsored posts, media buying
- OFFICE: Office supplies, stationery, furniture, rent
- EQUIPMENT: Hardware, cameras, computers, peripherals
- OTHER: Anything that does not clearly fit the above categories

Important:
- Extract the TOTAL amount, not subtotals or individual items
- If the receipt has a tax line, include it in notes but use the grand total for amount
- For ambiguous categories, prefer OTHER and note the ambiguity
- If line items are visible, extract as many as you can read
- Always return valid JSON — no trailing commas, no comments`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64Data },
            },
            { type: "text", text: promptText },
          ],
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response — handle both raw JSON and markdown-wrapped
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as ReceiptData;

    // Sanitize: ensure category is valid
    if (!VALID_CATEGORIES.includes(parsed.category)) {
      parsed.category = "OTHER";
    }

    // Sanitize: ensure confidence is valid
    if (!["high", "medium", "low"].includes(parsed.confidence)) {
      parsed.confidence = "low";
    }

    // Sanitize: ensure lineItems is an array
    if (!Array.isArray(parsed.lineItems)) {
      parsed.lineItems = [];
    }

    // Sanitize: coerce amount to number or null
    if (parsed.amount !== null && typeof parsed.amount !== "number") {
      const num = Number(parsed.amount);
      parsed.amount = isNaN(num) ? null : num;
    }

    return NextResponse.json({ data: parsed });
  } catch (err) {
    console.error("[POST /api/ai/receipt-ocr]", err);

    // Distinguish Anthropic API errors from other failures
    const message =
      err instanceof Error ? err.message : "Failed to process receipt";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
