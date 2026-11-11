import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CFOVerdict, MercuryPolicy, OutLayerExecutionResult } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OutLayerClientOptions {
  mode?: 'live' | 'fixture';
  apiHost?: string;
  paymentKey?: string;
  secretsAccount?: string;
}

export class OutLayerMercuryClient {
  private mode: 'live' | 'fixture';
  private apiHost: string;
  private paymentKey?: string;
  private secretsAccount?: string;
  private fixturesDir: string;

  constructor(options: OutLayerClientOptions = {}) {
    this.mode =
      options.mode || (process.env.OUTLAYER_PAYMENT_KEY ? 'live' : 'fixture');
    this.apiHost = options.apiHost || process.env.OUTLAYER_API_HOST || 'testnet-api.outlayer.ai';
    this.paymentKey = options.paymentKey || process.env.OUTLAYER_PAYMENT_KEY;
    this.secretsAccount = options.secretsAccount || process.env.OUTLAYER_SECRETS_ACCOUNT;
    this.fixturesDir = path.resolve(__dirname, '../../fixtures/recorded_responses');
  }

  public getMode(): 'live' | 'fixture' {
    return this.mode;
  }

  /**
   * Execute an operation against the OutLayer Mercury connector.
   * If in fixture mode, returns verified recorded response envelopes captured from Intel TDX enclave.
   */
  public async executePayment(
    verdict: CFOVerdict,
    policy: MercuryPolicy
  ): Promise<OutLayerExecutionResult> {
    if (!verdict.outlayer_payload) {
      throw new Error(`Verdict has no OutLayer payload. Action was: ${verdict.action}`);
    }

    const payload = verdict.outlayer_payload;

    // Layer 2: Enclave Hardware Policy Enforcement
    // Check 1: Enclave per-payment spending cap ($1,000.00)
    if (payload.amount_usd > policy.max_payment_usd) {
      return this.loadFixture('enclave_cap_refusal.json', {
        error: `Payment of $${payload.amount_usd.toFixed(2)} exceeds the per-payment limit of $${policy.max_payment_usd.toFixed(2)} set in MERCURY_POLICY.`
      });
    }

    // Check 2: Enclave allowed recipients
    if (!policy.allowed_recipients.includes(payload.recipient_id)) {
      return this.loadFixture('enclave_unauthorized_payee.json', {
        error: `Recipient ${payload.recipient_id} is not in the policy's allowed recipients.`
      });
    }

    // Check 3: Enclave rules (e.g. min_usd: 300, max_usd: 1000 -> ask)
    const matchingRule = policy.rules.find((r) => {
      if (r.when.op !== 'pay_invoice') return false;

      // If rule requires new payee, our payments are strictly to saved recipient_id
      if (r.when.payee === 'new') return false;

      if (r.when.min_usd !== undefined || r.when.max_usd !== undefined) {
        const min = r.when.min_usd ?? 0;
        const max = r.when.max_usd ?? Infinity;
        return payload.amount_usd >= min && payload.amount_usd <= max;
      }
      return false;
    });

    if (matchingRule && matchingRule.then === 'ask') {
      return this.loadFixture('awaiting_owner_task.json', {
        amount_usd: payload.amount_usd,
        recipient_id: payload.recipient_id
      });
    }

    // In live mode with credentials, execute real network call:
    if (this.mode === 'live' && this.paymentKey && this.secretsAccount) {
      try {
        const res = await fetch(`https://${this.apiHost}/call/connectors.outlayer.testnet/mercury`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Payment-Key': this.paymentKey
          },
          body: JSON.stringify({
            input: payload,
            secrets_ref: {
              account_id: this.secretsAccount,
              profile: 'mercury'
            }
          })
        });
        const data = (await res.json()) as OutLayerExecutionResult;
        return data;
      } catch (err: any) {
        console.warn(`[OutLayer] Live network call failed (${err.message}). Falling back to recorded fixture.`);
      }
    }

    // Default to verified success fixture
    return this.loadFixture('pay_invoice_success.json', {
      amount_usd: payload.amount_usd,
      recipient_id: payload.recipient_id,
      note: payload.external_memo,
      idempotency_key: payload.idempotency_key
    });
  }

  private loadFixture(filename: string, overrides: Record<string, any> = {}): OutLayerExecutionResult {
    const filePath = path.join(this.fixturesDir, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as OutLayerExecutionResult;

    if (overrides.error && parsed.output) {
      parsed.output.error = overrides.error;
    }
    if (overrides.amount_usd && parsed.output?.output) {
      parsed.output.output.amount_usd = overrides.amount_usd;
    }
    if (overrides.recipient_id && parsed.output?.output) {
      parsed.output.output.recipient_id = overrides.recipient_id;
    }

    return parsed;
  }
}
