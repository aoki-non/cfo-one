import '../config/env.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { evaluateInvoice } from '../engine/verdict.js';
import { InvoiceExtractor } from '../extraction/extractor.js';
import { RawInvoice } from '../types/index.js';
import { OutLayerMercuryClient } from '../connector/outlayerClient.js';
import { ProcessedInvoiceRecord } from '../engine/duplicate.js';
import { StateProvider } from '../connector/stateProvider.js';
import { MercuryClient } from '../connector/mercuryClient.js';
import { AirwallexClient } from '../connector/airwallexClient.js';

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
    const statusData = {
      name: 'cfo-one',
      mode: stateResult.source,
      airwallex_configured: airwallexClient.isConfigured(),
      mercury_configured: mercuryClient.isConfigured(),
      outlayer_configured: Boolean(process.env.OUTLAYER_PAYMENT_KEY),
      account_id: stateResult.state.account_id,
      balance_usd: stateResult.state.balance_usd,
      budget: stateResult.state.budget,
      policy: stateResult.state.policy,
      recipients: stateResult.state.recipients
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusData));
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
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[CFO-One] Web Cockpit running at http://localhost:${PORT}`);
});
