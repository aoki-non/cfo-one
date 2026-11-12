import '../config/env.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { evaluateInvoice } from '../engine/verdict.js';
import { InvoiceExtractor } from '../extraction/extractor.js';
import { RawInvoice, CFOVerdict } from '../types/index.js';
import { OutLayerMercuryClient } from '../connector/outlayerClient.js';
import { ProcessedInvoiceRecord } from '../engine/duplicate.js';
import { StateProvider } from '../connector/stateProvider.js';
import { MercuryClient } from '../connector/mercuryClient.js';
import { AirwallexClient } from '../connector/airwallexClient.js';
import { ConstraintsManager } from '../config/constraints.js';
import { NearIntentsClient } from '../intents/oneClickClient.js';
import { RevenueSplitter } from '../business/revenueSplitter.js';
import { InferenceBudgetMeter } from '../business/inferenceBudget.js';
import { PublicLedger } from '../ledger/publicLedger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const fixturesDir = path.resolve(__dirname, '../../fixtures');
const datasetPath = path.join(fixturesDir, 'invoices_dataset.json');

const rawDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
const extractor = new InvoiceExtractor();
const outlayer = new OutLayerMercuryClient();
const mercuryClient = new MercuryClient();
const airwallexClient = new AirwallexClient();

const liveProcessedInvoices: ProcessedInvoiceRecord[] = [];

async function getEvaluatedData() {
  const { state } = await StateProvider.getState();
  const processed: ProcessedInvoiceRecord[] = [...liveProcessedInvoices];
  const results = [];

  for (const item of rawDataset) {
    const rawInvoice: RawInvoice = {
      id: item.id,
      filename: item.filename,
      content_text: item.raw_text
    };

    const extracted = extractor.extractDeterministically(rawInvoice);
    const verdict = evaluateInvoice(extracted, state, processed);

    let enclave_result = null;
    if (verdict.action === 'ALLOW' || verdict.action === 'ASK_OWNER') {
      try {
        const exec = await outlayer.executePayment(verdict, state.policy);
        enclave_result = {
          status: exec.output.status || (exec.output.success ? 'executed' : 'failed'),
          transaction_id: exec.output.output?.transaction_id || exec.output.transaction_id,
          task_id: exec.output.task_id,
          link: exec.output.link,
          attestation_url: exec.attestation_url
        };
        if (verdict.action === 'ALLOW') {
          processed.push({
            invoice_number: extracted.invoice_number,
            vendor_name: extracted.vendor_name,
            recipient_id: verdict.context.matched_recipient_id,
            amount_usd: extracted.amount_usd,
            processed_at: new Date().toISOString()
          });
        }
      } catch (err: any) {
        enclave_result = {
          status: 'evaluation_error',
          error: err.message
        };
      }
    } else if (item.id === 'ATTACK-015') {
      // Show simulated enclave hardware refusal
      const forced = {
        ...verdict,
        action: 'ALLOW' as const,
        outlayer_payload: {
          operation: 'pay_invoice' as const,
          amount_usd: extracted.amount_usd,
          recipient_id: 'rec_aws_02',
          payment_method: 'ach' as const,
          external_memo: 'Forced payment simulation',
          idempotency_key: 'forced_key'
        }
      };
      const exec = await outlayer.executePayment(forced, state.policy);
      enclave_result = {
        status: 'hardware_cap_refusal',
        error: exec.output.error,
        attestation_url: exec.attestation_url
      };
    }

    results.push({
      id: item.id,
      filename: item.filename,
      extracted,
      verdict,
      enclave_result
    });
  }

  return results;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (req.url === '/api/status') {
    const stateResult = await StateProvider.getState();
    const constraints = ConstraintsManager.getConstraints();
    const inferenceStatus = InferenceBudgetMeter.getStatus();
    const statusData = {
      name: 'cfo-one',
      business_name: constraints.business.name,
      mode: stateResult.source,
      airwallex_configured: airwallexClient.isConfigured(),
      mercury_configured: mercuryClient.isConfigured(),
      outlayer_configured: Boolean(process.env.OUTLAYER_PAYMENT_KEY),
      account_id: stateResult.state.account_id,
      balance_usd: stateResult.state.balance_usd,
      budget: stateResult.state.budget,
      policy: stateResult.state.policy,
      recipients: stateResult.state.recipients,
      constraints,
      kill_switch: constraints.emergency_controls.kill_switch,
      inference_budget: inferenceStatus
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusData));
  } else if (req.url === '/api/ledger') {
    const entries = PublicLedger.getEntries();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(entries));
  } else if (req.url === '/api/kill-switch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const active = Boolean(payload.active);
        const updated = ConstraintsManager.setKillSwitch(active);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, kill_switch: updated.emergency_controls.kill_switch }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/intents/quote' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const intentsClient = new NearIntentsClient();
        const quote = await intentsClient.createPaymentIntent({
          originTokenSymbol: payload.token || 'USDC',
          originChain: payload.chain || 'base',
          amountUsd: Number(payload.amountUsd) || 25.0,
          clientAddress: payload.clientAddress || '0xClient...901',
          invoiceIdToClear: payload.invoiceId || 'INV-CUSTOM'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(quote));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/intents/settle' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const intentsClient = new NearIntentsClient();
        const settlement = await intentsClient.settleIntent(payload.intent);

        // Record sale in ledger
        PublicLedger.recordEntry({
          type: 'SALE_INFLOW',
          amount_usd: settlement.amountUsd,
          asset: `${payload.intent.originAsset.symbol} (${payload.intent.originAsset.blockchain})`,
          counterparty: payload.intent.depositAddress,
          description: `Invoice Clearance Purchase via NEAR Intents (${payload.intent.intentId})`,
          status: 'SETTLED',
          attestation_url: `https://testnet.nearblocks.io/txns/${settlement.txHash}`,
          tx_hash: settlement.txHash
        });

        // Run automated dividend split
        const split = await RevenueSplitter.executeSplit({
          amountUsd: settlement.amountUsd,
          saleId: payload.intent.intentId
        });

        PublicLedger.recordEntry({
          type: 'REVENUE_SPLIT',
          amount_usd: split.splits.contributor_dividend_usd,
          asset: 'NEAR',
          counterparty: split.contributor_account,
          description: `Automated 20% dividend payout from sale ${payload.intent.intentId}`,
          status: split.payout_status === 'DISPATCHED' ? 'DIVIDEND_PAID' : 'FROZEN_KILL_SWITCH',
          attestation_url: split.attestation_url || 'https://api.outlayer.ai/attestation/intel-tdx',
          tx_hash: split.near_payout_tx_hash
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settlement, split }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/data') {
    const data = await getEvaluatedData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } else if (req.url === '/api/evaluate' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const text = payload.text || '';
        const filename = payload.filename || 'custom_upload.txt';

        if (!text.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Text content is required' }));
          return;
        }

        const rawInvoice: RawInvoice = {
          id: `CUSTOM-${Date.now().toString().slice(-4)}`,
          filename,
          content_text: text
        };

        const extracted = await extractor.extract(rawInvoice);
        const { state } = await StateProvider.getState();
        const verdict = evaluateInvoice(extracted, state, liveProcessedInvoices);

        let enclave_result = null;
        if (verdict.action === 'ALLOW' || verdict.action === 'ASK_OWNER') {
          const exec = await outlayer.executePayment(verdict, state.policy);
          enclave_result = {
            status: exec.output.status || (exec.output.success ? 'executed' : 'failed'),
            transaction_id: exec.output.output?.transaction_id || exec.output.transaction_id,
            task_id: exec.output.task_id,
            link: exec.output.link,
            attestation_url: exec.attestation_url
          };

          if (verdict.action === 'ALLOW') {
            liveProcessedInvoices.push({
              invoice_number: extracted.invoice_number,
              vendor_name: extracted.vendor_name,
              recipient_id: verdict.context.matched_recipient_id,
              amount_usd: extracted.amount_usd,
              processed_at: new Date().toISOString()
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: rawInvoice.id,
            filename: rawInvoice.filename,
            extracted,
            verdict,
            enclave_result
          })
        );
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const invoiceId = payload.id;
        const { state } = await StateProvider.getState();

        // 1. Locate the item from dataset or request
        const item = rawDataset.find((d: any) => d.id === invoiceId);
        let extracted = item 
          ? extractor.extractDeterministically({ id: item.id, filename: item.filename, content_text: item.raw_text })
          : payload.extracted;

        if (!extracted) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invoice not found to approve' }));
          return;
        }

        // 2. Ensure recipient is onboarded / allowed
        let recipient = state.recipients.find((r) => r.name.toLowerCase() === extracted.vendor_name.toLowerCase());
        if (!recipient) {
          let newRecipientId = `rec_onboarded_${Date.now().toString().slice(-6)}`;
          
          if (airwallexClient.isConfigured() && extracted.bank_details?.account_number_last4) {
            try {
              const onboarded = await airwallexClient.createBeneficiary({
                name: extracted.vendor_name,
                accountNumber: `10000000${extracted.bank_details.account_number_last4}`,
                routingNumber: extracted.bank_details.routing_number || '121000358'
              });
              newRecipientId = onboarded.id;
            } catch (err: any) {
              console.warn(`[Airwallex] Onboarding in sandbox fallback: ${err.message}`);
            }
          }

          recipient = {
            id: newRecipientId,
            name: extracted.vendor_name,
            routing_number: extracted.bank_details?.routing_number || '121000358',
            account_number_last4: extracted.bank_details?.account_number_last4 || '4419',
            preferred_payment_method: 'ach',
            created_at: new Date().toISOString()
          };

          state.recipients.push(recipient);
          if (!state.policy.allowed_recipients.includes(recipient.id)) {
            state.policy.allowed_recipients.push(recipient.id);
          }
        }

        // 3. Build owner-approved verdict
        const approvedVerdict: CFOVerdict = {
          invoice_id: invoiceId || `INV-${Date.now()}`,
          invoice_number: extracted.invoice_number,
          vendor_name: extracted.vendor_name,
          action: 'ALLOW',
          decided_at_layer: 1,
          primary_reason: `Owner manually approved payment and onboarded vendor "${extracted.vendor_name}".`,
          amount_usd: extracted.amount_usd,
          signals: [],
          outlayer_payload: {
            operation: 'pay_invoice',
            amount_usd: extracted.amount_usd,
            recipient_id: recipient.id,
            payment_method: 'ach',
            external_memo: `Owner approved ${extracted.invoice_number}`,
            idempotency_key: `owner_approved_${Date.now()}`
          },
          context: {
            matched_recipient_id: recipient.id,
            historical_count: 1,
            historical_median_usd: extracted.amount_usd,
            ratio_to_median: 1.0,
            budget_impact_percent: state.budget.remaining_usd > 0 ? (extracted.amount_usd / state.budget.remaining_usd) * 100 : 0
          }
        };

        // 4. Dispatch payment execution
        const exec = await outlayer.executePayment(approvedVerdict, state.policy);
        liveProcessedInvoices.push({
          invoice_number: extracted.invoice_number,
          vendor_name: extracted.vendor_name,
          recipient_id: recipient.id,
          amount_usd: extracted.amount_usd,
          processed_at: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          verdict: approvedVerdict,
          enclave_result: {
            status: exec.output.status || (exec.output.success ? 'executed' : 'completed'),
            transaction_id: exec.output.output?.transaction_id || exec.output.transaction_id,
            attestation_url: exec.attestation_url
          }
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[CFO-One] Web Cockpit running at http://localhost:${PORT}`);
});
