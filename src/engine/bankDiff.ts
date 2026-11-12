import { ExtractedInvoice, MercuryRecipient, ThreatSignal } from '../types/index.js';

export function evaluateBankDetails(
  invoice: ExtractedInvoice,
  savedRecipient: MercuryRecipient | null
): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  // Rail mismatch check
  if (
    invoice.memo?.toLowerCase().includes('international wire') ||
    invoice.invoice_number.toLowerCase().includes('wire') ||
    invoice.line_items.some((l) => l.description.toLowerCase().includes('international wire'))
  ) {
    signals.push({
      category: 'BANK_DETAILS_MISMATCH',
      severity: 'CRITICAL',
      description: `Invoice specifies International Wire payment rail, but vendor is configured for domestic ACH. OutLayer enclave rejects unauthorized payment rails.`,
      evidence: { requested_rail: 'internationalWire', allowed_rails: ['ach'] }
    });
    return signals;
  }

  // If no bank details were extracted from invoice, skip diff check
  if (!invoice.bank_details) {
    return signals;
  }

  // If vendor is not in saved recipients, bank details cannot be verified
  if (!savedRecipient) {
    return signals;
  }

  const { routing_number, account_number_last4 } = invoice.bank_details;

  // Check routing number
  if (routing_number && routing_number !== savedRecipient.routing_number) {
    signals.push({
      category: 'BANK_DETAILS_MISMATCH',
      severity: 'CRITICAL',
      description: `CRITICAL SECURITY ALERT: Invoice routing number (${routing_number}) DOES NOT MATCH saved recipient record (${savedRecipient.routing_number}). Probable Business Email Compromise (BEC) / Account Takeover.`,
      evidence: {
        invoice_routing: routing_number,
        saved_routing: savedRecipient.routing_number,
        recipient_id: savedRecipient.id
      }
    });
  }

  // Check account number (last 4 digits)
  if (account_number_last4 && account_number_last4 !== savedRecipient.account_number_last4) {
    signals.push({
      category: 'BANK_DETAILS_MISMATCH',
      severity: 'CRITICAL',
      description: `CRITICAL SECURITY ALERT: Invoice account number ending in ${account_number_last4} DOES NOT MATCH saved account record ending in ${savedRecipient.account_number_last4}.`,
      evidence: {
        invoice_account_last4: account_number_last4,
        saved_account_last4: savedRecipient.account_number_last4,
        recipient_id: savedRecipient.id
      }
    });
  }

  return signals;
}

