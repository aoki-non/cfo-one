import {
  CFOVerdict,
  ExtractedInvoice,
  MercuryRecipient,
  MercuryState,
  ThreatSignal,
  VerdictAction
} from '../types/index.js';
import { evaluateBaseline } from './baseline.js';
import { evaluateDuplicates, ProcessedInvoiceRecord } from './duplicate.js';
import { evaluateBankDetails } from './bankDiff.js';
import { evaluateVelocityAndBudget } from './velocityBudget.js';
import { evaluateInstructionAnomalies } from './injection.js';

export function matchRecipient(vendorName: string, recipients: MercuryRecipient[]): MercuryRecipient | null {
  // Normalize string and detect Cyrillic/non-ASCII homoglyphs
  const isAscii = /^[\x00-\x7F]*$/.test(vendorName);
  if (!isAscii) {
    // Non-ASCII characters detected in payee name (e.g., Cyrillic 'е' in Vercel)
    // Homoglyph evasion attempt! Return null so it flags as UNRECOGNIZED_VENDOR
    return null;
  }

  const clean = vendorName.trim().toLowerCase();
  return (
    recipients.find((r) => {
      const rName = r.name.toLowerCase();
      return rName === clean || rName.startsWith(clean) || clean.startsWith(rName);
    }) || null
  );
}

export function evaluateInvoice(
  invoice: ExtractedInvoice,
  state: MercuryState,
  recentProcessed: ProcessedInvoiceRecord[] = []
): CFOVerdict {
  const matchedRecipient = matchRecipient(invoice.vendor_name, state.recipients);
  const matchedRecipientId = matchedRecipient ? matchedRecipient.id : null;

  const signals: ThreatSignal[] = [];

  // 1. Bank Details Integrity Check
  const bankSignals = evaluateBankDetails(invoice, matchedRecipient);
  signals.push(...bankSignals);

  // 2. Duplicate & Re-billing Check
  const dupSignals = evaluateDuplicates(invoice, matchedRecipientId, state, recentProcessed);
  signals.push(...dupSignals);

  // 3. Historical Baseline & Inflation Check
  const baseline = evaluateBaseline(invoice, matchedRecipientId, state);
  signals.push(...baseline.signals);

  // 4. Velocity and Budget Liquidity Check
  const velSignals = evaluateVelocityAndBudget(invoice, matchedRecipientId, state, recentProcessed);
  signals.push(...velSignals);

  // 5. Instruction Anomaly & Prompt Injection Check
  const injectionSignals = evaluateInstructionAnomalies(invoice);
  signals.push(...injectionSignals);

  // Synthesize Action
  let action: VerdictAction = 'ALLOW';
  let primaryReason = 'Routine invoice within historical baseline and policy limits.';

  const criticalSignals = signals.filter((s) => s.severity === 'CRITICAL');
  const highSignals = signals.filter((s) => s.severity === 'HIGH');
  const mediumSignals = signals.filter((s) => s.severity === 'MEDIUM');

  if (criticalSignals.length > 0) {
    action = 'REFUSE';
    primaryReason = criticalSignals[0].description;
  } else if (highSignals.length > 0) {
    action = 'ASK_OWNER';
    primaryReason = highSignals[0].description;
  } else if (mediumSignals.length > 0) {
    action = 'ASK_OWNER';
    primaryReason = mediumSignals[0].description;
  }

  // Budget impact calculation
  const remainingBudget = state.budget.remaining_usd;
  const budgetImpact = remainingBudget > 0 ? (invoice.amount_usd / remainingBudget) * 100 : 100;

  // Build OutLayer connector payload if allowed or asking
  let outlayer_payload: CFOVerdict['outlayer_payload'];
  if (action !== 'REFUSE' && matchedRecipientId) {
    outlayer_payload = {
      operation: 'pay_invoice',
      amount_usd: invoice.amount_usd,
      recipient_id: matchedRecipientId,
      payment_method: matchedRecipient?.preferred_payment_method || 'ach',
      external_memo: invoice.memo || `Invoice #${invoice.invoice_number}`,
      idempotency_key: `cfo_idem_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}`
    };
  }

  return {
    invoice_id: invoice.invoice_id,
    invoice_number: invoice.invoice_number,
    vendor_name: invoice.vendor_name,
    amount_usd: invoice.amount_usd,
    action,
    primary_reason: primaryReason,
    decided_at_layer: 1, // Layer 1 (Judgment Engine)
    signals,
    context: {
      matched_recipient_id: matchedRecipientId,
      historical_count: baseline.historical_count,
      historical_median_usd: baseline.historical_median_usd,
      ratio_to_median: baseline.ratio_to_median,
      budget_impact_percent: Number(budgetImpact.toFixed(1))
    },
    outlayer_payload
  };
}
