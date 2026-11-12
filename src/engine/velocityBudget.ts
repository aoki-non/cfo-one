import { ExtractedInvoice, MercuryState, ThreatSignal } from '../types/index.js';
import { ProcessedInvoiceRecord } from './duplicate.js';

export function evaluateVelocityAndBudget(
  invoice: ExtractedInvoice,
  matchedRecipientId: string | null,
  state: MercuryState,
  recentProcessed: ProcessedInvoiceRecord[]
): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  const remainingBudget = state.budget.remaining_usd;

  // 1. Budget Exhaustion: amount > remaining budget
  if (invoice.amount_usd > remainingBudget) {
    signals.push({
      category: 'BUDGET_EXHAUSTION',
      severity: 'CRITICAL',
      description: `Budget Exceeded: Invoice amount ($${invoice.amount_usd.toFixed(2)}) exceeds remaining 30-day treasury budget ($${remainingBudget.toFixed(2)}).`,
      evidence: {
        amount_usd: invoice.amount_usd,
        remaining_budget_usd: remainingBudget,
        monthly_limit_usd: state.budget.monthly_limit_usd
      }
    });
    return signals;
  }

  // 2. Budget Drain: single invoice consumes >50% of remaining liquidity
  if (remainingBudget > 0 && invoice.amount_usd > remainingBudget * 0.5 && invoice.amount_usd > 300) {
    const pct = (invoice.amount_usd / remainingBudget) * 100;
    signals.push({
      category: 'BUDGET_DRAIN',
      severity: 'HIGH',
      description: `Budget Liquidity Warning: Single invoice consumes ${pct.toFixed(0)}% of remaining monthly budget ($${remainingBudget.toFixed(2)}). Requires owner confirmation.`,
      evidence: {
        amount_usd: invoice.amount_usd,
        remaining_budget_usd: remainingBudget,
        drain_percentage: pct
      }
    });
  }

  // 3. Velocity check: >= 2 invoices to the same vendor in 24 hours
  const vendorTxsToday = recentProcessed.filter(
    (p) =>
      p.recipient_id === matchedRecipientId ||
      p.vendor_name.toLowerCase() === invoice.vendor_name.toLowerCase()
  );

  if (vendorTxsToday.length >= 2) {
    signals.push({
      category: 'VELOCITY_LIMIT_EXCEEDED',
      severity: 'HIGH',
      description: `Velocity Alert: ${vendorTxsToday.length} consecutive invoices already processed for ${invoice.vendor_name} within 24 hours. Rate limit enforced (max 2 payments/day per vendor).`,
      evidence: {
        consecutive_invoices_count: vendorTxsToday.length + 1,
        vendor_name: invoice.vendor_name
      }
    });
  }

  return signals;
}
