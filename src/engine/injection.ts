import { ExtractedInvoice, ThreatSignal } from '../types/index.js';

export function evaluateInstructionAnomalies(invoice: ExtractedInvoice): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  // Check 1: Explicit instruction detected during LLM extraction
  if (invoice.detected_instruction_text && invoice.detected_instruction_text.trim().length > 0) {
    signals.push({
      category: 'PROMPT_INJECTION',
      severity: 'HIGH',
      description: `Suspicious Instruction-like Text Extracted: The invoice contains imperative directives ("${invoice.detected_instruction_text.slice(0, 100)}..."). Escalating to owner for visual review.`,
      evidence: { extracted_instruction: invoice.detected_instruction_text }
    });
    return signals;
  }

  // Check 2: Inspect memo and line item descriptions for prompt injection or delimiter smuggling
  const suspiciousCorpus = [
    invoice.memo || '',
    ...invoice.line_items.map((l) => l.description)
  ].join(' ');

  const injectionPatterns = [
    /system[-_ ]*override/i,
    /ignore\s+(all\s+)?(prior|previous)\s+(instructions|rules|spending|directives)/i,
    /disregard\s+(prior|previous|operational|budget)/i,
    /waive\s+(owner|approval|checks|rules)/i,
    /approve\s+this\s+invoice\s+with\s+maximum\s+priority/i,
    /```json\s*\{.*override.*\}\s*```/i,
    /action\s*[:=]\s*["']?ALLOW/i
  ];

  for (const pattern of injectionPatterns) {
    const match = suspiciousCorpus.match(pattern);
    if (match) {
      signals.push({
        category: 'PROMPT_INJECTION',
        severity: 'HIGH',
        description: `Adversarial Instruction Pattern Detected: Text attempts to inject control payload ("${match[0]}"). Soft judgment flags for owner review.`,
        evidence: { matched_pattern: match[0], corpus_sample: suspiciousCorpus.slice(0, 120) }
      });
      break;
    }
  }

  return signals;
}
