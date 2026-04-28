import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ── Types ──────────────────────────────────────────────────────
type ContractType =
  | "NDA"
  | "SERVICE_AGREEMENT"
  | "EMPLOYMENT"
  | "FREELANCE"
  | "PARTNERSHIP"
  | "OTHER";

interface Party {
  name: string;
  role: string;
}

interface DraftContractInput {
  type: ContractType;
  parties: Party[];
  projectName?: string;
  projectDescription?: string;
  value?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  scope?: string;
}

interface ContractClause {
  heading: string;
  body: string;
}

interface DraftContractOutput {
  title: string;
  content: string;
  clauses: ContractClause[];
  notes: string;
}

// ── Label map for prompt context ───────────────────────────────
const TYPE_LABELS: Record<ContractType, string> = {
  NDA: "Non-Disclosure Agreement (Mutual NDA)",
  SERVICE_AGREEMENT: "Service Agreement",
  EMPLOYMENT: "Employment Agreement",
  FREELANCE: "Freelance / Independent Contractor Agreement",
  PARTNERSHIP: "Partnership Agreement",
  OTHER: "General Contract",
};

// ── POST /api/ai/draft-contract ────────────────────────────────
export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-contract");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.heavy);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: DraftContractInput = await req.json();

    const { type, parties } = body;

    if (!type || !parties?.length) {
      return NextResponse.json(
        { error: "Contract type and at least one party are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: return template-based contract
      const result = generateFallbackContract(body);
      return NextResponse.json(result);
    }

    const anthropic = new Anthropic({ apiKey });
    const prompt = buildPrompt(body);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const parsed: DraftContractOutput = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[POST /api/ai/draft-contract]", err);
    return NextResponse.json(
      { error: "Failed to generate contract draft" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(input: DraftContractInput): string {
  const {
    type,
    parties,
    projectName,
    projectDescription,
    value,
    currency,
    startDate,
    endDate,
    scope,
  } = input;

  const typeLabel = TYPE_LABELS[type] || TYPE_LABELS.OTHER;

  const partiesBlock = parties
    .map((p, i) => `  Party ${i + 1}: ${p.name} (${p.role})`)
    .join("\n");

  const detailLines: string[] = [];
  if (projectName) detailLines.push(`Project name: ${projectName}`);
  if (projectDescription)
    detailLines.push(`Project description: ${projectDescription}`);
  if (value) detailLines.push(`Contract value: ${currency || "USD"} ${value}`);
  if (startDate) detailLines.push(`Start date: ${startDate}`);
  if (endDate) detailLines.push(`End date: ${endDate}`);
  if (scope) detailLines.push(`Scope of work: ${scope}`);

  const typeGuidance = getTypeGuidance(type);

  return `You are a senior legal document drafting assistant. Generate a professional ${typeLabel} draft.

CONTRACT DETAILS:
- Type: ${typeLabel}
- Parties:
${partiesBlock}
${detailLines.length > 0 ? detailLines.map((l) => `- ${l}`).join("\n") : ""}

TYPE-SPECIFIC GUIDANCE:
${typeGuidance}

REQUIREMENTS:
1. Generate a complete, professional contract draft in markdown format suitable for PDF conversion.
2. Use formal legal language but keep it clear and readable.
3. Fill in all party names, dates, and values from the provided details.
4. Where information is missing, use reasonable placeholders in [SQUARE BRACKETS].
5. Include a prominent disclaimer that this is a draft and requires legal review.
6. Structure the contract with numbered sections and subsections.

IMPORTANT: Return ONLY a JSON object (no markdown code fences, no explanation) in this exact format:
{
  "title": "Full contract title",
  "content": "Complete contract in markdown format (use \\n for newlines)",
  "clauses": [
    { "heading": "Section heading", "body": "Full section text in markdown" }
  ],
  "notes": "Any important notes about the draft, missing information, or recommended additions"
}

The "content" field should contain the FULL contract as a single markdown string.
The "clauses" array should break the contract into its individual sections for easy editing.
The "notes" field should mention what a lawyer should review and any assumptions made.`;
}

function getTypeGuidance(type: ContractType): string {
  switch (type) {
    case "NDA":
      return `Generate a standard MUTUAL Non-Disclosure Agreement with these clauses:
- Definition of Confidential Information (broad but clear)
- Obligations of Receiving Party
- Exclusions from Confidential Information
- Term and duration of confidentiality obligations
- Permitted Disclosures (e.g., to employees, advisors with need-to-know)
- Return or Destruction of Materials
- Remedies for breach (including injunctive relief)
- No License or Warranty
- Governing Law and Jurisdiction
- Entire Agreement and amendments
- Signature block for all parties`;

    case "SERVICE_AGREEMENT":
      return `Generate a comprehensive Service Agreement with these clauses:
- Scope of Services (detailed deliverables section)
- Timeline and Milestones
- Compensation and Payment Terms (including payment schedule, late fees)
- Client Responsibilities and cooperation
- Intellectual Property Ownership (work-for-hire, IP transfer upon payment)
- Confidentiality
- Representations and Warranties
- Limitation of Liability
- Indemnification
- Termination and cancellation policy
- Force Majeure
- Dispute Resolution
- Non-solicitation clause
- Governing Law
- Signature block`;

    case "FREELANCE":
      return `Generate an Independent Contractor / Freelance Agreement with these clauses:
- Engagement and Scope of Work
- Contractor Status (independent contractor, not employee)
- Compensation and Invoicing terms
- Expenses and reimbursement policy
- Timeline and Deliverables
- Intellectual Property Assignment (work product ownership)
- Confidentiality and Non-Disclosure
- Non-compete and Non-solicitation (reasonable scope)
- Representations and Warranties
- Termination (by either party, with notice period)
- Liability and Indemnification
- Tax Obligations (contractor responsible)
- Insurance requirements
- Governing Law
- Signature block`;

    case "EMPLOYMENT":
      return `Generate a standard Employment Agreement with these clauses:
- Position and Title
- Duties and Responsibilities
- Compensation and Benefits (salary, bonuses, equity if applicable)
- Working Hours and Location
- Probation Period
- Leave and Time Off
- Confidentiality and Non-Disclosure
- Intellectual Property Assignment (all work product belongs to employer)
- Non-compete clause (reasonable duration and scope)
- Non-solicitation clause
- Termination conditions (with and without cause, notice periods)
- Severance terms
- Dispute Resolution
- Governing Law
- Signature block`;

    case "PARTNERSHIP":
      return `Generate a Partnership Agreement with these clauses:
- Partnership Name and Purpose
- Contributions (capital, property, services)
- Profit and Loss Sharing
- Management and Decision Making
- Partner Duties and Responsibilities
- Compensation and Draws
- Banking and Financial Management
- Admission of New Partners
- Withdrawal and Retirement of Partners
- Dissolution and Winding Up
- Non-compete obligations
- Confidentiality
- Dispute Resolution
- Governing Law
- Signature block`;

    case "OTHER":
    default:
      return `Generate a general contract with standard clauses:
- Scope and Purpose
- Terms and Conditions
- Obligations of each party
- Compensation (if applicable)
- Confidentiality
- Termination
- Limitation of Liability
- Dispute Resolution
- Governing Law
- Signature block`;
  }
}

// ── Fallback: template-based generation (no API key) ───────────

function generateFallbackContract(input: DraftContractInput): DraftContractOutput {
  switch (input.type) {
    case "NDA":
      return generateNDATemplate(input);
    case "SERVICE_AGREEMENT":
      return generateServiceAgreementTemplate(input);
    case "FREELANCE":
      return generateFreelanceTemplate(input);
    case "EMPLOYMENT":
      return generateEmploymentTemplate(input);
    case "PARTNERSHIP":
      return generatePartnershipTemplate(input);
    case "OTHER":
    default:
      return generateGenericTemplate(input);
  }
}

// ── Helper: format date or placeholder ─────────────────────────
function fmtDate(d?: string): string {
  if (!d) return "[DATE]";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtCurrency(value?: number, currency?: string): string {
  if (!value) return "[AMOUNT]";
  const c = currency || "USD";
  return `${c} ${value.toLocaleString("en-US")}`;
}

function partyName(parties: Party[], index: number): string {
  return parties[index]?.name || `[PARTY ${index + 1} NAME]`;
}

function partyRole(parties: Party[], index: number): string {
  return parties[index]?.role || `[PARTY ${index + 1} ROLE]`;
}

// ── NDA Template ───────────────────────────────────────────────
function generateNDATemplate(input: DraftContractInput): DraftContractOutput {
  const p1 = partyName(input.parties, 0);
  const p2 = partyName(input.parties, 1);
  const effectiveDate = fmtDate(input.startDate);
  const expiryDate = fmtDate(input.endDate);
  const project = input.projectName || "[PROJECT NAME]";

  const clauses: ContractClause[] = [
    {
      heading: "1. Definition of Confidential Information",
      body: `For the purposes of this Agreement, "Confidential Information" means any and all non-public information disclosed by either party ("Disclosing Party") to the other party ("Receiving Party"), whether orally, in writing, electronically, or by any other means, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. This includes, but is not limited to:\n\n- Business plans, strategies, and forecasts\n- Financial information and projections\n- Customer and client lists and data\n- Technical data, trade secrets, and know-how\n- Product designs, specifications, and roadmaps\n- Marketing plans and pricing strategies\n- Software, algorithms, and source code\n- Any information related to the project: ${project}`,
    },
    {
      heading: "2. Obligations of Receiving Party",
      body: `The Receiving Party agrees to:\n\n(a) Hold all Confidential Information in strict confidence;\n(b) Not disclose Confidential Information to any third party without prior written consent of the Disclosing Party;\n(c) Use the Confidential Information solely for the purpose of evaluating and/or pursuing a business relationship between the parties in connection with ${project};\n(d) Take reasonable measures to protect the secrecy and confidentiality of the Confidential Information, using at least the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care;\n(e) Limit access to Confidential Information to those employees, agents, and advisors who have a need to know and who are bound by confidentiality obligations at least as restrictive as those contained herein.`,
    },
    {
      heading: "3. Exclusions from Confidential Information",
      body: `Confidential Information does not include information that:\n\n(a) Is or becomes publicly available through no fault of the Receiving Party;\n(b) Was already known to the Receiving Party prior to disclosure, as documented by written records;\n(c) Is independently developed by the Receiving Party without use of or reference to the Confidential Information;\n(d) Is rightfully received from a third party without restriction on disclosure;\n(e) Is required to be disclosed by law, regulation, or court order, provided the Receiving Party gives prompt written notice to the Disclosing Party and cooperates in seeking a protective order.`,
    },
    {
      heading: "4. Term and Duration",
      body: `This Agreement shall become effective as of ${effectiveDate} and shall continue until ${expiryDate}, unless earlier terminated by either party with thirty (30) days' written notice. The confidentiality obligations set forth herein shall survive the termination of this Agreement for a period of two (2) years following the date of disclosure of the Confidential Information.`,
    },
    {
      heading: "5. Return or Destruction of Materials",
      body: `Upon termination of this Agreement, or upon written request of the Disclosing Party, the Receiving Party shall promptly return or destroy all copies of Confidential Information in its possession, including any notes, summaries, or analyses derived therefrom. The Receiving Party shall certify in writing that it has complied with this requirement.`,
    },
    {
      heading: "6. No License or Warranty",
      body: `Nothing in this Agreement grants the Receiving Party any rights to the Disclosing Party's Confidential Information, intellectual property, or any license under any patent, copyright, trademark, or trade secret. All Confidential Information is provided "AS IS" without warranty of any kind, express or implied.`,
    },
    {
      heading: "7. Remedies",
      body: `The parties acknowledge that any breach of this Agreement may cause irreparable harm for which monetary damages would be inadequate. Accordingly, the Disclosing Party shall be entitled to seek injunctive relief in addition to any other remedies available at law or in equity, without the necessity of proving actual damages or posting a bond.`,
    },
    {
      heading: "8. Governing Law and Jurisdiction",
      body: `This Agreement shall be governed by and construed in accordance with the laws of [STATE/JURISDICTION], without regard to its conflicts of law principles. Any disputes arising from this Agreement shall be subject to the exclusive jurisdiction of the courts located in [CITY, STATE/JURISDICTION].`,
    },
    {
      heading: "9. Entire Agreement",
      body: `This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, and communications, whether written or oral. This Agreement may not be amended except by a written instrument signed by both parties.`,
    },
    {
      heading: "10. Signatures",
      body: `IN WITNESS WHEREOF, the parties have executed this Non-Disclosure Agreement as of the date first written above.\n\n**${p1}**\nSignature: ___________________________\nName: ${p1}\nTitle: ${partyRole(input.parties, 0)}\nDate: ___________________________\n\n**${p2}**\nSignature: ___________________________\nName: ${p2}\nTitle: ${partyRole(input.parties, 1)}\nDate: ___________________________`,
    },
  ];

  const content = buildMarkdownContent(
    `MUTUAL NON-DISCLOSURE AGREEMENT`,
    `This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n**${p1}** ("${partyRole(input.parties, 0)}") and **${p2}** ("${partyRole(input.parties, 1)}")\n\n${input.projectName ? `In connection with the project: **${project}**\n\n` : ""}${input.projectDescription ? `Project Description: ${input.projectDescription}\n\n` : ""}The parties wish to explore a potential business relationship and, in connection therewith, may disclose to each other certain confidential and proprietary information. The parties agree as follows:`,
    clauses
  );

  return {
    title: `Mutual Non-Disclosure Agreement — ${p1} & ${p2}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This document should be reviewed by a qualified attorney before execution. Key items for legal review: (1) Jurisdiction and governing law should be specified; (2) Duration of confidentiality obligations may need adjustment based on industry standards; (3) Definition of Confidential Information may need to be tailored to the specific business context.",
  };
}

// ── Service Agreement Template ─────────────────────────────────
function generateServiceAgreementTemplate(
  input: DraftContractInput
): DraftContractOutput {
  const provider = partyName(input.parties, 0);
  const client = partyName(input.parties, 1);
  const providerRole = partyRole(input.parties, 0);
  const clientRole = partyRole(input.parties, 1);
  const effectiveDate = fmtDate(input.startDate);
  const endDate = fmtDate(input.endDate);
  const project = input.projectName || "[PROJECT NAME]";
  const amount = fmtCurrency(input.value, input.currency);
  const scopeText = input.scope || "[DETAILED SCOPE OF WORK TO BE DEFINED]";

  const clauses: ContractClause[] = [
    {
      heading: "1. Scope of Services",
      body: `The ${providerRole} ("${provider}") agrees to provide the following services to the ${clientRole} ("${client}"):\n\n${scopeText}\n\n${input.projectDescription ? `Project Description: ${input.projectDescription}\n\n` : ""}The ${providerRole} shall perform the Services in a professional and workmanlike manner, consistent with industry standards. Any changes to the scope must be agreed upon in writing by both parties and may result in adjustments to the timeline and fees.`,
    },
    {
      heading: "2. Timeline and Milestones",
      body: `The Services shall commence on ${effectiveDate} and are expected to be completed by ${endDate}.\n\nKey milestones:\n- Project kickoff: ${effectiveDate}\n- [MILESTONE 1]: [DATE]\n- [MILESTONE 2]: [DATE]\n- Final delivery: ${endDate}\n\nTimelines are estimates and may be adjusted by mutual written agreement. Delays caused by the ${clientRole}'s failure to provide required materials, feedback, or approvals in a timely manner shall extend the project timeline accordingly.`,
    },
    {
      heading: "3. Compensation and Payment Terms",
      body: `The ${clientRole} agrees to pay the ${providerRole} a total fee of **${amount}** for the Services described herein.\n\nPayment Schedule:\n- 50% upon signing of this Agreement: ${input.value ? fmtCurrency(input.value * 0.5, input.currency) : "[AMOUNT]"}\n- 50% upon final delivery and approval: ${input.value ? fmtCurrency(input.value * 0.5, input.currency) : "[AMOUNT]"}\n\nPayment Terms:\n- All invoices are due within fifteen (15) days of receipt.\n- Late payments shall incur a charge of 1.5% per month on the outstanding balance.\n- The ${providerRole} reserves the right to suspend work if payments are overdue by more than thirty (30) days.`,
    },
    {
      heading: "4. Client Responsibilities",
      body: `The ${clientRole} agrees to:\n\n(a) Provide all necessary materials, content, and assets in a timely manner;\n(b) Designate a primary point of contact for project communications;\n(c) Provide feedback and approvals within five (5) business days of receiving deliverables;\n(d) Ensure that all materials provided do not infringe on third-party rights;\n(e) Pay all fees in accordance with the payment schedule outlined herein.`,
    },
    {
      heading: "5. Intellectual Property Ownership",
      body: `Upon full payment of all fees, the ${providerRole} assigns to the ${clientRole} all rights, title, and interest in the final deliverables created under this Agreement.\n\nPre-existing IP: Any tools, frameworks, templates, or methodologies owned by the ${providerRole} prior to this engagement ("Pre-existing IP") remain the property of the ${providerRole}. The ${clientRole} is granted a non-exclusive, perpetual license to use any Pre-existing IP incorporated into the deliverables.\n\nWork in Progress: Until full payment is received, all work product remains the property of the ${providerRole}.`,
    },
    {
      heading: "6. Confidentiality",
      body: `Both parties agree to maintain the confidentiality of any proprietary or sensitive information shared during the course of this engagement. This obligation shall survive the termination of this Agreement for a period of two (2) years.`,
    },
    {
      heading: "7. Revisions and Change Orders",
      body: `This Agreement includes [NUMBER] rounds of revisions per deliverable. Additional revision rounds shall be billed at the ${providerRole}'s standard hourly rate of [RATE]/hour.\n\nAny changes to the original scope of work must be documented in a written Change Order signed by both parties, specifying the additional work, timeline adjustment, and additional fees.`,
    },
    {
      heading: "8. Limitation of Liability",
      body: `The ${providerRole}'s total liability under this Agreement shall not exceed the total fees paid by the ${clientRole}. In no event shall either party be liable for indirect, incidental, special, consequential, or punitive damages, regardless of the cause of action or theory of liability.`,
    },
    {
      heading: "9. Termination",
      body: `Either party may terminate this Agreement with thirty (30) days' written notice.\n\nUpon termination:\n- The ${clientRole} shall pay for all work completed up to the date of termination.\n- If the ${clientRole} terminates without cause, a cancellation fee of 25% of the remaining contract value shall apply.\n- The ${providerRole} shall deliver all completed work product upon receipt of final payment.\n- If the ${providerRole} terminates without cause, no cancellation fee shall apply and a pro-rata refund of prepaid fees shall be issued.`,
    },
    {
      heading: "10. Force Majeure",
      body: `Neither party shall be liable for any failure or delay in performing its obligations under this Agreement due to causes beyond its reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, pandemics, government actions, or interruption of utilities or communications.`,
    },
    {
      heading: "11. Dispute Resolution",
      body: `Any disputes arising from this Agreement shall first be addressed through good-faith negotiation. If unresolved within thirty (30) days, the dispute shall be submitted to binding arbitration in accordance with the rules of [ARBITRATION BODY] in [CITY, STATE/JURISDICTION]. The prevailing party shall be entitled to recover reasonable attorneys' fees.`,
    },
    {
      heading: "12. Governing Law",
      body: `This Agreement shall be governed by and construed in accordance with the laws of [STATE/JURISDICTION], without regard to its conflicts of law principles.`,
    },
    {
      heading: "13. Entire Agreement",
      body: `This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior agreements and understandings. No modification shall be effective unless in writing and signed by both parties.`,
    },
    {
      heading: "14. Signatures",
      body: `IN WITNESS WHEREOF, the parties have executed this Service Agreement as of ${effectiveDate}.\n\n**${provider}** (${providerRole})\nSignature: ___________________________\nName: ${provider}\nTitle: [TITLE]\nDate: ___________________________\n\n**${client}** (${clientRole})\nSignature: ___________________________\nName: ${client}\nTitle: [TITLE]\nDate: ___________________________`,
    },
  ];

  const content = buildMarkdownContent(
    `SERVICE AGREEMENT`,
    `This Service Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n**${provider}** ("${providerRole}") and **${client}** ("${clientRole}")\n\n${input.projectName ? `For the project: **${project}**\n\n` : ""}${input.projectDescription ? `${input.projectDescription}\n\n` : ""}The parties agree to the following terms and conditions:`,
    clauses
  );

  return {
    title: `Service Agreement — ${project}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This document should be reviewed by a qualified attorney before execution. Key items for legal review: (1) Payment schedule and late fee terms; (2) IP ownership clauses and pre-existing IP terms; (3) Limitation of liability cap; (4) Termination and cancellation fee structure; (5) Governing law and arbitration jurisdiction; (6) Number of revision rounds and hourly rate for additional work.",
  };
}

// ── Freelance Template ─────────────────────────────────────────
function generateFreelanceTemplate(
  input: DraftContractInput
): DraftContractOutput {
  const contractor = partyName(input.parties, 0);
  const client = partyName(input.parties, 1);
  const contractorRole = partyRole(input.parties, 0);
  const clientRole = partyRole(input.parties, 1);
  const effectiveDate = fmtDate(input.startDate);
  const endDate = fmtDate(input.endDate);
  const project = input.projectName || "[PROJECT NAME]";
  const amount = fmtCurrency(input.value, input.currency);
  const scopeText = input.scope || "[DETAILED SCOPE OF WORK TO BE DEFINED]";

  const clauses: ContractClause[] = [
    {
      heading: "1. Engagement and Independent Contractor Status",
      body: `The ${clientRole} ("${client}") engages the ${contractorRole} ("${contractor}") as an independent contractor to perform the services described herein. Nothing in this Agreement shall be construed to create an employer-employee relationship, partnership, or joint venture between the parties.\n\nThe ${contractorRole} shall:\n- Have the right to control the manner and means of performing the services;\n- Provide their own tools, equipment, and workspace;\n- Not be entitled to employee benefits including health insurance, retirement plans, or paid time off;\n- Be solely responsible for their own tax obligations.`,
    },
    {
      heading: "2. Scope of Work",
      body: `The ${contractorRole} agrees to perform the following services:\n\n${scopeText}\n\n${input.projectDescription ? `Project Description: ${input.projectDescription}\n\n` : ""}Any work beyond the defined scope shall require a written amendment to this Agreement and may incur additional fees.`,
    },
    {
      heading: "3. Compensation and Invoicing",
      body: `The ${clientRole} agrees to pay the ${contractorRole} **${amount}** for the services described herein.\n\nPayment Schedule:\n- 50% deposit upon signing: ${input.value ? fmtCurrency(input.value * 0.5, input.currency) : "[AMOUNT]"}\n- 50% upon completion: ${input.value ? fmtCurrency(input.value * 0.5, input.currency) : "[AMOUNT]"}\n\nThe ${contractorRole} shall submit invoices upon reaching each payment milestone. Payment is due within fifteen (15) days of invoice receipt. Late payments shall incur interest at the rate of 1.5% per month.`,
    },
    {
      heading: "4. Timeline and Deliverables",
      body: `The engagement shall commence on ${effectiveDate} and shall be completed by ${endDate}.\n\nDeliverables:\n- [DELIVERABLE 1] — Due: [DATE]\n- [DELIVERABLE 2] — Due: [DATE]\n- Final delivery — Due: ${endDate}\n\nTimelines may be adjusted by mutual agreement. The ${contractorRole} shall promptly notify the ${clientRole} of any anticipated delays.`,
    },
    {
      heading: "5. Intellectual Property Assignment",
      body: `Upon full payment, the ${contractorRole} assigns all rights, title, and interest in the work product created under this Agreement to the ${clientRole}. This includes all copyrights, patents, trademarks, and other intellectual property rights.\n\nThe ${contractorRole} retains the right to display the work in their portfolio and promotional materials unless otherwise agreed in writing.`,
    },
    {
      heading: "6. Confidentiality",
      body: `The ${contractorRole} agrees to keep confidential all proprietary information, trade secrets, and business information of the ${clientRole} disclosed during this engagement. This obligation shall survive for two (2) years after the termination of this Agreement.`,
    },
    {
      heading: "7. Non-Solicitation",
      body: `During the term of this Agreement and for a period of twelve (12) months thereafter, the ${contractorRole} shall not directly solicit or attempt to solicit any employees or clients of the ${clientRole} with whom the ${contractorRole} had contact during this engagement.`,
    },
    {
      heading: "8. Termination",
      body: `Either party may terminate this Agreement with fourteen (14) days' written notice.\n\nUpon termination:\n- The ${clientRole} shall pay for all work completed to date;\n- The ${contractorRole} shall deliver all completed work product;\n- If the ${clientRole} terminates without cause after work has commenced, the deposit is non-refundable.`,
    },
    {
      heading: "9. Tax Obligations",
      body: `The ${contractorRole} is solely responsible for all tax obligations arising from compensation received under this Agreement, including self-employment tax, income tax, and any applicable state or local taxes. The ${clientRole} shall issue a Form 1099-NEC (or equivalent) if required by law.`,
    },
    {
      heading: "10. Liability and Indemnification",
      body: `The ${contractorRole}'s total liability shall not exceed the total fees paid under this Agreement. Each party agrees to indemnify and hold harmless the other party from any claims arising from their breach of this Agreement or negligent acts.`,
    },
    {
      heading: "11. Governing Law",
      body: `This Agreement shall be governed by the laws of [STATE/JURISDICTION]. Any disputes shall be resolved through binding arbitration in [CITY, STATE/JURISDICTION].`,
    },
    {
      heading: "12. Signatures",
      body: `IN WITNESS WHEREOF, the parties have executed this Agreement as of ${effectiveDate}.\n\n**${contractor}** (${contractorRole})\nSignature: ___________________________\nName: ${contractor}\nDate: ___________________________\n\n**${client}** (${clientRole})\nSignature: ___________________________\nName: ${client}\nDate: ___________________________`,
    },
  ];

  const content = buildMarkdownContent(
    `INDEPENDENT CONTRACTOR AGREEMENT`,
    `This Independent Contractor Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n**${contractor}** ("${contractorRole}") and **${client}** ("${clientRole}")\n\n${input.projectName ? `For the project: **${project}**\n\n` : ""}The parties agree as follows:`,
    clauses
  );

  return {
    title: `Freelance Agreement — ${contractor} & ${client}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This document should be reviewed by a qualified attorney before execution. Key items for legal review: (1) Independent contractor classification and compliance with local labor laws; (2) IP assignment terms; (3) Non-solicitation scope and enforceability; (4) Tax obligation compliance (1099 vs W-2); (5) Governing law and arbitration venue.",
  };
}

// ── Employment Template ────────────────────────────────────────
function generateEmploymentTemplate(
  input: DraftContractInput
): DraftContractOutput {
  const employer = partyName(input.parties, 0);
  const employee = partyName(input.parties, 1);
  const employerRole = partyRole(input.parties, 0);
  const employeeRole = partyRole(input.parties, 1);
  const effectiveDate = fmtDate(input.startDate);
  const amount = fmtCurrency(input.value, input.currency);
  const project = input.projectName || "[POSITION TITLE]";

  const clauses: ContractClause[] = [
    {
      heading: "1. Position and Duties",
      body: `The ${employerRole} ("${employer}") hereby employs the ${employeeRole} ("${employee}") in the position of **${project}**.\n\n${input.projectDescription ? `Role Description: ${input.projectDescription}\n\n` : ""}The ${employeeRole} shall perform all duties and responsibilities associated with this position, as well as any other duties reasonably assigned by the ${employerRole}. The ${employeeRole} shall devote their full professional time, attention, and best efforts to the performance of their duties.`,
    },
    {
      heading: "2. Compensation and Benefits",
      body: `The ${employerRole} agrees to compensate the ${employeeRole} as follows:\n\n- Base Salary: **${amount}** per [YEAR/MONTH], payable [MONTHLY/BI-WEEKLY]\n- Performance Bonus: [DETAILS OR N/A]\n- Benefits: The ${employeeRole} shall be eligible for the ${employerRole}'s standard benefits package, including [HEALTH INSURANCE, RETIREMENT PLAN, PTO, ETC.]`,
    },
    {
      heading: "3. Working Hours and Location",
      body: `The standard working hours are [HOURS] per week, [DAYS]. The primary work location shall be [OFFICE ADDRESS / REMOTE / HYBRID].\n\nOvertime, if applicable, shall be compensated in accordance with applicable labor laws.`,
    },
    {
      heading: "4. Probation Period",
      body: `The first [90 DAYS / 6 MONTHS] of employment shall constitute a probationary period. During this period, either party may terminate the employment with [ONE WEEK] written notice. Upon successful completion, the ${employeeRole} shall be confirmed as a regular employee.`,
    },
    {
      heading: "5. Leave and Time Off",
      body: `The ${employeeRole} shall be entitled to:\n- [NUMBER] days of paid annual leave per year\n- [NUMBER] days of sick leave per year\n- Public holidays as per the ${employerRole}'s holiday schedule\n- Additional leave as per company policy and applicable law`,
    },
    {
      heading: "6. Confidentiality",
      body: `The ${employeeRole} agrees that during and after the term of employment, they shall not disclose, use, or permit the use of any confidential information of the ${employerRole}. This includes trade secrets, client information, business strategies, financial data, technical information, and any other proprietary information.`,
    },
    {
      heading: "7. Intellectual Property",
      body: `All inventions, designs, works, code, documents, and other materials created by the ${employeeRole} during the course of employment and related to the ${employerRole}'s business shall be the exclusive property of the ${employerRole}. The ${employeeRole} hereby assigns all rights, title, and interest in such work product to the ${employerRole}.`,
    },
    {
      heading: "8. Non-Compete",
      body: `For a period of [12 MONTHS] following the termination of employment, the ${employeeRole} agrees not to engage in or contribute to any business that directly competes with the ${employerRole}'s core business within [GEOGRAPHIC AREA]. This restriction applies to employment, consulting, advisory, or ownership roles.`,
    },
    {
      heading: "9. Non-Solicitation",
      body: `For a period of [12 MONTHS] following termination, the ${employeeRole} shall not directly or indirectly solicit any employees, contractors, or clients of the ${employerRole}.`,
    },
    {
      heading: "10. Termination",
      body: `This employment may be terminated under the following conditions:\n\n**By the ${employerRole}:**\n- With cause: Immediately upon written notice\n- Without cause: With [30 DAYS] written notice or pay in lieu\n\n**By the ${employeeRole}:**\n- With [30 DAYS] written notice\n\n**Cause** includes but is not limited to: gross misconduct, breach of this Agreement, failure to perform duties, dishonesty, or conviction of a criminal offense.`,
    },
    {
      heading: "11. Severance",
      body: `In the event of termination without cause by the ${employerRole}, the ${employeeRole} shall be entitled to [NUMBER] weeks/months of severance pay at their base salary rate, subject to execution of a general release agreement.`,
    },
    {
      heading: "12. Governing Law",
      body: `This Agreement shall be governed by the laws of [STATE/JURISDICTION]. Any disputes shall be subject to the jurisdiction of the courts in [CITY, STATE/JURISDICTION].`,
    },
    {
      heading: "13. Signatures",
      body: `IN WITNESS WHEREOF, the parties have executed this Employment Agreement as of ${effectiveDate}.\n\n**${employer}** (${employerRole})\nSignature: ___________________________\nName: [AUTHORIZED SIGNATORY]\nTitle: [TITLE]\nDate: ___________________________\n\n**${employee}** (${employeeRole})\nSignature: ___________________________\nName: ${employee}\nDate: ___________________________`,
    },
  ];

  const content = buildMarkdownContent(
    `EMPLOYMENT AGREEMENT`,
    `This Employment Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n**${employer}** ("${employerRole}") and **${employee}** ("${employeeRole}")\n\nThe parties agree to the following terms and conditions of employment:`,
    clauses
  );

  return {
    title: `Employment Agreement — ${employee} at ${employer}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This document must be reviewed by a qualified attorney and HR professional before execution. Key items for legal review: (1) Compliance with local labor and employment laws; (2) Non-compete enforceability varies significantly by jurisdiction; (3) Benefits and leave entitlements must comply with applicable law; (4) At-will vs. for-cause employment status; (5) Overtime and wage compliance; (6) Severance terms and release agreement requirements.",
  };
}

// ── Partnership Template ───────────────────────────────────────
function generatePartnershipTemplate(
  input: DraftContractInput
): DraftContractOutput {
  const effectiveDate = fmtDate(input.startDate);
  const project = input.projectName || "[PARTNERSHIP NAME]";
  const partnerNames = input.parties.map((p) => p.name).join(", ");
  const amount = fmtCurrency(input.value, input.currency);

  const clauses: ContractClause[] = [
    {
      heading: "1. Partnership Name and Purpose",
      body: `The partners hereby form a partnership under the name **${project}** for the purpose of:\n\n${input.projectDescription || "[DESCRIBE THE PURPOSE AND BUSINESS ACTIVITIES OF THE PARTNERSHIP]"}\n\nThe principal place of business shall be [ADDRESS].`,
    },
    {
      heading: "2. Partners",
      body: input.parties
        .map(
          (p, i) =>
            `**Partner ${i + 1}:** ${p.name} — ${p.role}`
        )
        .join("\n\n"),
    },
    {
      heading: "3. Contributions",
      body: `Each partner shall contribute to the partnership as follows:\n\n${input.parties.map((p) => `- **${p.name}**: [CAPITAL CONTRIBUTION / SERVICES / ASSETS]`).join("\n")}\n\n${input.value ? `Total initial capital: **${amount}**` : "Total initial capital: [AMOUNT]"}`,
    },
    {
      heading: "4. Profit and Loss Sharing",
      body: `Profits and losses shall be shared among the partners as follows:\n\n${input.parties.map((p) => `- **${p.name}**: [PERCENTAGE]%`).join("\n")}\n\nDistributions shall be made [MONTHLY/QUARTERLY/ANNUALLY] or as agreed upon by the partners.`,
    },
    {
      heading: "5. Management and Decision Making",
      body: `All partners shall have equal rights in the management and conduct of the partnership business, unless otherwise agreed.\n\nMajor decisions (including but not limited to expenditures over [AMOUNT], new debt obligations, admission of new partners, and changes to the business model) shall require the unanimous consent of all partners.\n\nDay-to-day operational decisions may be made by any managing partner.`,
    },
    {
      heading: "6. Withdrawal and Dissolution",
      body: `Any partner may withdraw from the partnership by providing [90 DAYS] written notice. Upon withdrawal:\n\n- The withdrawing partner's interest shall be valued as of the date of withdrawal;\n- The remaining partners shall have the option to purchase the withdrawing partner's interest;\n- If all partners agree, the partnership may be dissolved and wound up in an orderly manner.`,
    },
    {
      heading: "7. Non-Compete",
      body: `During the term of this partnership and for [12 MONTHS] thereafter, no partner shall directly or indirectly engage in any business that competes with the partnership without the prior written consent of all other partners.`,
    },
    {
      heading: "8. Confidentiality",
      body: `All partners agree to keep confidential any proprietary information of the partnership. This obligation survives the termination of the partnership.`,
    },
    {
      heading: "9. Dispute Resolution",
      body: `Disputes among partners shall first be addressed through good-faith negotiation. If unresolved within thirty (30) days, the dispute shall be submitted to mediation. If mediation fails, binding arbitration shall be conducted in [CITY, STATE/JURISDICTION].`,
    },
    {
      heading: "10. Governing Law",
      body: `This Agreement shall be governed by the laws of [STATE/JURISDICTION].`,
    },
    {
      heading: "11. Signatures",
      body: `IN WITNESS WHEREOF, the partners have executed this Partnership Agreement as of ${effectiveDate}.\n\n${input.parties.map((p) => `**${p.name}** (${p.role})\nSignature: ___________________________\nDate: ___________________________`).join("\n\n")}`,
    },
  ];

  const content = buildMarkdownContent(
    `PARTNERSHIP AGREEMENT`,
    `This Partnership Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n${input.parties.map((p) => `**${p.name}** ("${p.role}")`).join(" and ")}\n\n(collectively referred to as the "Partners")\n\nThe Partners agree to form a partnership on the following terms:`,
    clauses
  );

  return {
    title: `Partnership Agreement — ${partnerNames}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This document must be reviewed by a qualified attorney before execution. Key items for legal review: (1) Partnership structure (general vs. limited); (2) Capital contribution valuation; (3) Profit/loss distribution ratios; (4) Buy-sell provisions; (5) Death or incapacity of a partner; (6) Tax implications and entity classification; (7) Non-compete enforceability.",
  };
}

// ── Generic / OTHER Template ───────────────────────────────────
function generateGenericTemplate(
  input: DraftContractInput
): DraftContractOutput {
  const party1 = partyName(input.parties, 0);
  const party2 = partyName(input.parties, 1);
  const effectiveDate = fmtDate(input.startDate);
  const endDate = fmtDate(input.endDate);
  const amount = fmtCurrency(input.value, input.currency);
  const project = input.projectName || "[SUBJECT OF AGREEMENT]";

  const clauses: ContractClause[] = [
    {
      heading: "1. Purpose and Scope",
      body: `This Agreement sets forth the terms under which the parties will collaborate on **${project}**.\n\n${input.projectDescription || "[DETAILED DESCRIPTION OF THE ARRANGEMENT]"}\n\n${input.scope ? `Scope: ${input.scope}` : ""}`,
    },
    {
      heading: "2. Term",
      body: `This Agreement shall be effective from ${effectiveDate} to ${endDate}, unless terminated earlier in accordance with the provisions herein.`,
    },
    {
      heading: "3. Obligations of the Parties",
      body: input.parties
        .map(
          (p) =>
            `**${p.name}** (${p.role}) shall:\n- [OBLIGATION 1]\n- [OBLIGATION 2]\n- [OBLIGATION 3]`
        )
        .join("\n\n"),
    },
    {
      heading: "4. Compensation",
      body: `${input.value ? `The total value of this Agreement is **${amount}**.` : "[COMPENSATION TERMS TO BE DEFINED]"}\n\nPayment terms: [SPECIFY PAYMENT SCHEDULE AND METHOD]`,
    },
    {
      heading: "5. Confidentiality",
      body: `Both parties agree to maintain the confidentiality of all proprietary information exchanged during the course of this Agreement. This obligation shall survive the termination of this Agreement for a period of two (2) years.`,
    },
    {
      heading: "6. Termination",
      body: `Either party may terminate this Agreement with thirty (30) days' written notice. Upon termination, both parties shall fulfill any outstanding obligations incurred prior to the termination date.`,
    },
    {
      heading: "7. Limitation of Liability",
      body: `Neither party shall be liable for any indirect, incidental, special, or consequential damages arising from this Agreement. Each party's total liability shall not exceed the total fees paid or payable under this Agreement.`,
    },
    {
      heading: "8. Dispute Resolution",
      body: `Any disputes shall be resolved through good-faith negotiation. If unresolved, the parties agree to submit to binding arbitration in [CITY, STATE/JURISDICTION].`,
    },
    {
      heading: "9. Governing Law",
      body: `This Agreement shall be governed by the laws of [STATE/JURISDICTION].`,
    },
    {
      heading: "10. Entire Agreement",
      body: `This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements. Amendments must be in writing and signed by both parties.`,
    },
    {
      heading: "11. Signatures",
      body: `IN WITNESS WHEREOF, the parties have executed this Agreement as of ${effectiveDate}.\n\n**${party1}** (${partyRole(input.parties, 0)})\nSignature: ___________________________\nDate: ___________________________\n\n**${party2}** (${partyRole(input.parties, 1)})\nSignature: ___________________________\nDate: ___________________________`,
    },
  ];

  const content = buildMarkdownContent(
    `GENERAL AGREEMENT`,
    `This Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:\n\n${input.parties.map((p) => `**${p.name}** ("${p.role}")`).join(" and ")}\n\nThe parties agree as follows:`,
    clauses
  );

  return {
    title: `Agreement — ${project}`,
    content,
    clauses,
    notes:
      "DISCLAIMER: This is an AI-generated draft and is NOT a substitute for professional legal advice. This is a general-purpose contract template and may require significant customization. Key items for legal review: (1) All obligation sections need specific details; (2) Compensation and payment terms; (3) Liability limitations; (4) Governing law and jurisdiction; (5) Industry-specific regulatory compliance.",
  };
}

// ── Markdown builder ───────────────────────────────────────────
function buildMarkdownContent(
  title: string,
  preamble: string,
  clauses: ContractClause[]
): string {
  const disclaimer = `> **DISCLAIMER:** This document is an AI-generated draft provided for informational purposes only. It does NOT constitute legal advice and should be reviewed, modified, and approved by a qualified legal professional before execution. The parties should not rely on this draft as a final legal document.`;

  const lines: string[] = [
    `# ${title}`,
    "",
    disclaimer,
    "",
    "---",
    "",
    preamble,
    "",
    "---",
    "",
  ];

  for (const clause of clauses) {
    lines.push(`## ${clause.heading}`);
    lines.push("");
    lines.push(clause.body);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "*This document was generated as a draft and requires legal review before execution.*"
  );

  return lines.join("\n");
}
