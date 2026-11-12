import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type LedgerEventType =
  | 'SALE_INFLOW'
  | 'REVENUE_SPLIT'
  | 'INFERENCE_COST'
  | 'PROCUREMENT_OUTFLOW'
  | 'SECURITY_INTERCEPT';

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: LedgerEventType;
  amount_usd: number;
  asset: string;
  counterparty: string;
  description: string;
  status: 'SETTLED' | 'BLOCKED' | 'DIVIDEND_PAID' | 'FROZEN_KILL_SWITCH';
  attestation_url: string;
  tx_hash?: string;
}

export class PublicLedger {
  private static ledgerPath = path.resolve(__dirname, '../../fixtures/public_ledger.json');
  private static entries: LedgerEntry[] = [];
  private static initialized = false;

  private static init() {
    if (this.initialized) return;
    try {
      if (fs.existsSync(this.ledgerPath)) {
        const raw = fs.readFileSync(this.ledgerPath, 'utf-8');
        this.entries = JSON.parse(raw);
      } else {
        // Seed initial entries demonstrating the business ledger
        this.entries = [
          {
            id: 'LEDGER-001',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            type: 'SALE_INFLOW',
            amount_usd: 25.0,
            asset: 'USDC (Base)',
            counterparty: 'client-dao.eth',
            description: 'Client purchased Confidential TEE Invoice Clearance for Vendor INV-901',
            status: 'SETTLED',
            attestation_url: 'https://testnet.nearblocks.io/txns/near_intents_settle_01',
            tx_hash: '0xintents_98812cba'
          },
          {
            id: 'LEDGER-002',
            timestamp: new Date(Date.now() - 3550000).toISOString(),
            type: 'REVENUE_SPLIT',
            amount_usd: 5.0,
            asset: 'NEAR',
            counterparty: 'contributors.testnet',
            description: 'Automated 20% contributor dividend payout from sale LEDGER-001',
            status: 'DIVIDEND_PAID',
            attestation_url: 'https://api.outlayer.ai/attestation/intel-tdx-quote-div01',
            tx_hash: 'near_tx_div_882910'
          },
          {
            id: 'LEDGER-003',
            timestamp: new Date(Date.now() - 3500000).toISOString(),
            type: 'INFERENCE_COST',
            amount_usd: 0.045,
            asset: 'USD',
            counterparty: 'near-ai/llama-3.1-70b',
            description: 'Agent procured extraction compute from NEAR AI Cloud',
            status: 'SETTLED',
            attestation_url: 'https://api.outlayer.ai/attestation/intel-tdx-quote-nearai'
          }
        ];
        this.persist();
      }
    } catch {
      this.entries = [];
    }
    this.initialized = true;
  }

  private static persist() {
    try {
      fs.writeFileSync(this.ledgerPath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[PublicLedger] Failed to save ledger: ${err.message}`);
    }
  }

  public static getEntries(): LedgerEntry[] {
    this.init();
    return [...this.entries];
  }

  public static recordEntry(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): LedgerEntry {
    this.init();
    const newEntry: LedgerEntry = {
      ...entry,
      id: `LEDGER-${(this.entries.length + 1).toString().padStart(3, '0')}`,
      timestamp: new Date().toISOString()
    };
    this.entries.unshift(newEntry);
    this.persist();
    return newEntry;
  }
}

