import { ExtractedInvoice, MercuryState, ThreatSignal } from '../types/index.js';

export interface ProcessedInvoiceRecord {
  invoice_number: string;
  vendor_name: string;
  recipient_id: string | null;
  amount_usd: number;
  processed_at: string;
}

export function evaluateDuplicates(
  invoice: ExtractedInvoice,
  matchedRecipientId: string | null,
  state: MercuryState,
  recentProcessed: ProcessedInvoiceRecord[]
): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  const cleanInvNum = invoice.invoice_number.trim().toUpperCase();

  // 1. Exact match in recent processed invoices
  const exactProcessed = recentProcessed.find(
    (p) =>
      p.invoice_number.toUpperCase() === cleanInvNum &&
      (p.recipient_id === matchedRecipientId || p.vendor_name.toLowerCase() === invoice.vendor_name.toLowerCase())
  );

  if (exactProcessed) {
    signals.push({
      category: 'DUPLICATE_INVOICE',
      severity: 'CRITICAL',
      description: `Exact duplicate: Invoice #${invoice.invoice_number} from ${invoice.vendor_name} was already processed on ${exactProcessed.processed_at}.`,
      evidence: { invoice_number: invoice.invoice_number, processed_record: exactProcessed }
    });
    return signals;
  }

  // 2. Prior re-billing match against Mercury historical ledger
  const ledgerMatch = state.recent_transactions.find((tx: any) => {
    const isSameVendor = tx.recipient_id === matchedRecipientId;
    const memoMatch = tx.reference_invoice_number && tx.reference_invoice_number.toUpperCase() === cleanInvNum;
    return isSameVendor && memoMatch;
  });

  if (ledgerMatch) {
    signals.push({
      category: 'DUPLICATE_INVOICE',
      severity: 'CRITICAL',
      description: `Prior Period Re-billing: Invoice #${invoice.invoice_number} was already paid on ${ledgerMatch.date} (Ledger Tx ID: ${ledgerMatch.id}).`,
      evidence: { invoice_number: invoice.invoice_number, prior_tx: ledgerMatch }
    });
    return signals;
  }

  // 3. Mutated invoice number collision (e.g. INV-V-1101 vs INV-V-1101-DUP)
  const mutatedMatch = recentProcessed.find((p) => {
    const isSameVendor =
      p.recipient_id === matchedRecipientId ||
      p.vendor_name.toLowerCase() === invoice.vendor_name.toLowerCase();
    if (!isSameVendor) return false;

    const pNum = p.invoice_number.toUpperCase();
    const isPrefix = cleanInvNum.startsWith(pNum) || pNum.startsWith(cleanInvNum);
    const isSameAmount = Math.abs(p.amount_usd - invoice.amount_usd) < 0.01;
    return isPrefix && isSameAmount;
  });

  if (mutatedMatch) {
    signals.push({
      category: 'DUPLICATE_INVOICE',
      severity: 'CRITICAL',
      description: `Mutated duplicate pattern: Invoice #${invoice.invoice_number} matches prior #${mutatedMatch.invoice_number} with identical amount ($${invoice.amount_usd.toFixed(2)}).`,
      evidence: { current: invoice.invoice_number, prior: mutatedMatch.invoice_number }
    });
    return signals;
  }

  // 4. Split-billing collision (e.g. two $145 invoices from same contractor in short window)
  const splitMatch =
    recentProcessed.find((p) => {
      const isSameVendor =
        p.recipient_id === matchedRecipientId ||
        p.vendor_name.toLowerCase() === invoice.vendor_name.toLowerCase();
      if (!isSameVendor) return false;

      const isSameAmount = Math.abs(p.amount_usd - invoice.amount_usd) < 0.01;
      return isSameAmount && (p.invoice_number.toUpperCase().includes('SPLIT') || cleanInvNum.includes('SPLIT'));
    }) ||
    state.recent_transactions.find((tx: any) => {
      const isSameVendor = tx.recipient_id === matchedRecipientId;
      const isSameAmount = Math.abs(tx.amount_usd - invoice.amount_usd) < 0.01;
      const isSplit = tx.reference_invoice_number?.toUpperCase().includes('SPLIT') || cleanInvNum.includes('SPLIT');
      return isSameVendor && isSameAmount && isSplit;
    });

  if (splitMatch) {
    signals.push({
      category: 'DUPLICATE_INVOICE',
      severity: 'CRITICAL',
      description: `Split-billing duplicate detected: Identical payment of $${invoice.amount_usd.toFixed(2)} already submitted under #${(splitMatch as any).invoice_number || (splitMatch as any).reference_invoice_number}.`,
      evidence: { prior_split: (splitMatch as any).invoice_number || (splitMatch as any).id }
    });
  }

  return signals;
}
