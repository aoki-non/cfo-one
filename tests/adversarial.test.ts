import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { evaluateInvoice } from '../src/engine/verdict.js';
import { InvoiceExtractor } from '../src/extraction/extractor.js';
import { MercuryState, RawInvoice } from '../src/types/index.js';
import { OutLayerMercuryClient } from '../src/connector/outlayerClient.js';
import { ProcessedInvoiceRecord } from '../src/engine/duplicate.js';
import { MercuryClient } from '../src/connector/mercuryClient.js';
import { AirwallexClient } from '../src/connector/airwallexClient.js';
import { StateProvider } from '../src/connector/stateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const statePath = path.resolve(__dirname, '../fixtures/mock_mercury_state.json');
const datasetPath = path.resolve(__dirname, '../fixtures/invoices_dataset.json');

const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as MercuryState;
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
const extractor = new InvoiceExtractor();
const outlayer = new OutLayerMercuryClient({ mode: 'fixture' });

describe('CFO-One: Adversarial & Legitimate Test Suite', () => {
  it('should initialize AirwallexClient and verify demo configuration handling', async () => {
    const unconfigured = new AirwallexClient({ clientId: '', apiKey: '' });
    assert.strictEqual(unconfigured.isConfigured(), false);
    const ping = await unconfigured.ping();
    assert.strictEqual(ping.connected, false);

    const configuredMock = new AirwallexClient({ clientId: 'mock_id', apiKey: 'mock_key' });
    assert.strictEqual(configuredMock.isConfigured(), true);
  });

  it('should initialize MercuryClient and verify configuration handling', async () => {
    const unconfigured = new MercuryClient({ apiKey: '' });
    assert.strictEqual(unconfigured.isConfigured(), false);
    const ping = await unconfigured.ping();
    assert.strictEqual(ping.connected, false);

    const providerResult = await StateProvider.getState();
    assert.ok(providerResult.state.account_id);
    assert.ok(providerResult.state.balance_usd >= 0);
    assert.ok(providerResult.state.recipients.length >= 0);
  });

  it('should auto-approve routine recurring invoices (Control Group)', async () => {
    const raw: RawInvoice = {
      id: 'LEGIT-001',
      filename: 'vercel_nov_2026.json',
      content_text: dataset.find((d: any) => d.id === 'LEGIT-001').raw_text
    };

    const extracted = await extractor.extract(raw);
    const verdict = evaluateInvoice(extracted, state, []);

    assert.strictEqual(verdict.action, 'ALLOW');
    assert.strictEqual(verdict.signals.length, 0);

    const outlayerResult = await outlayer.executePayment(verdict, state.policy);
    assert.strictEqual(outlayerResult.output.success, true);
    assert.strictEqual(outlayerResult.output.operation, 'pay_invoice');
    assert.ok(outlayerResult.output.output?.transaction_id);
  });

  it('should block BEC account takeover / bank detail routing swaps at Layer 1', async () => {
    const raw: RawInvoice = {
      id: 'ATTACK-003',
      filename: 'figma_bec_routing_swap.json',
      content_text: dataset.find((d: any) => d.id === 'ATTACK-003').raw_text
    };

    const extracted = await extractor.extract(raw);
    const verdict = evaluateInvoice(extracted, state, []);

    assert.strictEqual(verdict.action, 'REFUSE');
    const becSignal = verdict.signals.find((s) => s.category === 'BANK_DETAILS_MISMATCH');
    assert.ok(becSignal, 'Expected BANK_DETAILS_MISMATCH signal');
    assert.strictEqual(becSignal.severity, 'CRITICAL');
  });

  it('should escalate high-value legal retainer to OutLayer awaiting_owner task', async () => {
    const raw: RawInvoice = {
      id: 'LEGIT-011',
      filename: 'summit_legal_q4.json',
      content_text: dataset.find((d: any) => d.id === 'LEGIT-011').raw_text
    };

    const extracted = await extractor.extract(raw);
    const verdict = evaluateInvoice(extracted, state, []);

    assert.strictEqual(verdict.action, 'ASK_OWNER');

    // OutLayer Enclave receives payload and triggers awaiting_owner task
    const outlayerResult = await outlayer.executePayment(verdict, state.policy);
    assert.strictEqual(outlayerResult.output.status, 'awaiting_owner');
    assert.ok(outlayerResult.output.task_id);
    assert.ok(outlayerResult.output.link?.includes('/inbox/'));
  });

  it('should detect prompt injection in invoice memo and escalate to owner', async () => {
    const raw: RawInvoice = {
      id: 'ATTACK-007',
      filename: 'prompt_injection_memo.json',
      content_text: dataset.find((d: any) => d.id === 'ATTACK-007').raw_text
    };

    const extracted = await extractor.extract(raw);
    const verdict = evaluateInvoice(extracted, state, []);

    assert.strictEqual(verdict.action, 'ASK_OWNER');
    const injectionSignal = verdict.signals.find((s) => s.category === 'PROMPT_INJECTION');
    assert.ok(injectionSignal, 'Expected PROMPT_INJECTION signal');
  });

  it('should enforce Enclave hardware spending cap on forced $12,000 transaction', async () => {
    const raw: RawInvoice = {
      id: 'ATTACK-015',
      filename: 'enclave_cap_breach_12000.json',
      content_text: dataset.find((d: any) => d.id === 'ATTACK-015').raw_text
    };

    const extracted = await extractor.extract(raw);
    const verdict = evaluateInvoice(extracted, state, []);

    // Engine catches baseline inflation
    assert.strictEqual(verdict.action, 'REFUSE');

    // Simulate Layer 2 bypass attempt
    const forcedVerdict = {
      ...verdict,
      action: 'ALLOW' as const,
      outlayer_payload: {
        operation: 'pay_invoice' as const,
        amount_usd: 12000.0,
        recipient_id: 'rec_aws_02',
        payment_method: 'ach' as const,
        external_memo: 'Forced payment',
        idempotency_key: 'forced_key_12000'
      }
    };

    const enclaveResult = await outlayer.executePayment(forcedVerdict, state.policy);
    assert.strictEqual(enclaveResult.output.success, false);
    assert.ok(enclaveResult.output.error?.includes('exceeds the per-payment limit'));
  });

  it('should evaluate full 40-case benchmark with 0 false negatives', async () => {
    const processed: ProcessedInvoiceRecord[] = [];
    let attacksAllowed = 0;
    let legitRefused = 0;

    for (const item of dataset) {
      const raw: RawInvoice = {
        id: item.id,
        filename: item.filename,
        content_text: item.raw_text
      };

      const extracted = await extractor.extract(raw);
      const verdict = evaluateInvoice(extracted, state, processed);

      if (item.id.startsWith('LEGIT')) {
        if (verdict.action === 'REFUSE') legitRefused++;
      } else {
        if (verdict.action === 'ALLOW') attacksAllowed++;
      }

      if (verdict.action === 'ALLOW') {
        processed.push({
          invoice_number: extracted.invoice_number,
          vendor_name: extracted.vendor_name,
          recipient_id: verdict.context.matched_recipient_id,
          amount_usd: extracted.amount_usd,
          processed_at: new Date().toISOString()
        });
      }
    }

    assert.strictEqual(attacksAllowed, 0, 'Zero attacks must be allowed');
    assert.strictEqual(legitRefused, 0, 'Zero legitimate invoices should be erroneously refused');
  });
});

