import { ExtractedInvoice, MercuryState, ThreatSignal } from '../types/index.js';

export interface BaselineResult {
  historical_count: number;
  historical_median_usd: number | null;
  ratio_to_median: number | null;
  signals: ThreatSignal[];
}

export function evaluateBaseline(
  invoice: ExtractedInvoice,
  matchedRecipientId: string | null,
  state: MercuryState
): BaselineResult {
  const signals: ThreatSignal[] = [];

  // Zero or negative amount check
  if (invoice.amount_usd <= 0.0) {
    signals.push({
      category: 'AMOUNT_ANOMALY',
      severity: 'CRITICAL',
      description: `Invoice amount is $${invoice.amount_usd.toFixed(2)}. Payments must be at least $0.01.`,
      evidence: { amount_usd: invoice.amount_usd }
    });
    return {
      historical_count: 0,
      historical_median_usd: null,
      ratio_to_median: null,
      signals
    };
  }

  // If vendor is not in saved recipients
  if (!matchedRecipientId) {
    signals.push({
      category: 'UNRECOGNIZED_VENDOR',
      severity: 'MEDIUM',
      description: `Vendor "${invoice.vendor_name}" is not currently in saved treasury recipients / allowlist.`,
      evidence: { vendor_name: invoice.vendor_name }
    });
    return {
      historical_count: 0,
      historical_median_usd: null,
      ratio_to_median: null,
      signals
    };
  }

  // Find historical transactions for this recipient (matching by recipient ID or vendor name)
  const pastTxs = state.recent_transactions.filter((tx) => {
    const matchesId = tx.recipient_id === matchedRecipientId;
    const matchesName = Boolean(
      invoice.vendor_name &&
      tx.recipient_name &&
      (tx.recipient_name.toLowerCase().includes(invoice.vendor_name.toLowerCase()) ||
       invoice.vendor_name.toLowerCase().includes(tx.recipient_name.toLowerCase()))
    );
    return (matchesId || matchesName) && (tx.status === 'sent' || tx.status === 'pending') && Number(tx.amount_usd) > 0;
  });

  const count = pastTxs.length;

  // Thin history threshold: fewer than 3 payments means insufficient statistical baseline
  if (count < 3) {
    signals.push({
      category: 'THIN_VENDOR_HISTORY',
      severity: 'MEDIUM',
      description: `Thin payment history: only ${count} prior payment(s) on record for ${invoice.vendor_name}. Requires owner sign-off.`,
      evidence: { past_transaction_count: count, amounts: pastTxs.map((t) => t.amount_usd) }
    });

    const median = count > 0 ? pastTxs[0].amount_usd : null;
    return {
      historical_count: count,
      historical_median_usd: median,
      ratio_to_median: median ? invoice.amount_usd / median : null,
      signals
    };
  }

  // Compute median
  const sortedAmounts = pastTxs.map((t) => t.amount_usd).sort((a, b) => a - b);
  const mid = Math.floor(sortedAmounts.length / 2);
  const median =
    sortedAmounts.length % 2 !== 0
      ? sortedAmounts[mid]
      : (sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2;

  const ratio = invoice.amount_usd / median;

  // Excessive deviation check:
  // e.g. normal bill is $42, invoice is $285 (ratio 6.78x) -> Refuse
  if (ratio >= 2.2) {
    signals.push({
      category: 'AMOUNT_ANOMALY',
      severity: 'CRITICAL',
      description: `Amount $${invoice.amount_usd.toFixed(2)} is ${ratio.toFixed(1)}x above the 6-month historical median of $${median.toFixed(2)}. Excessive inflation under spending cap.`,
      evidence: {
        amount_usd: invoice.amount_usd,
        median_usd: median,
        ratio,
        past_samples: sortedAmounts
      }
    });
  } else if (ratio >= 1.35) {
    // Moderate deviation: e.g. contractor billed 1.5x median weekly rate for extra hours
    signals.push({
      category: 'AMOUNT_ANOMALY',
      severity: 'HIGH',
      description: `Amount $${invoice.amount_usd.toFixed(2)} is ${(ratio * 100 - 100).toFixed(0)}% above normal median ($${median.toFixed(2)}). Escalate to owner for confirmation.`,
      evidence: {
        amount_usd: invoice.amount_usd,
        median_usd: median,
        ratio
      }
    });
  }

  return {
    historical_count: count,
    historical_median_usd: median,
    ratio_to_median: ratio,
    signals
  };
}

