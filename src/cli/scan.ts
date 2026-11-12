import '../config/env.js';
import * as fs from 'fs';
import * as path from 'path';
import { InvoiceExtractor } from '../extraction/extractor.js';
import { evaluateInvoice } from '../engine/verdict.js';
import { StateProvider } from '../connector/stateProvider.js';
import { OutLayerMercuryClient } from '../connector/outlayerClient.js';
import { RawInvoice } from '../types/index.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function parseArgs() {
  const args = process.argv.slice(2);
  const result: { file?: string; text?: string; help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') {
      result.file = args[i + 1];
      i++;
    } else if (args[i] === '--text' || args[i] === '-t') {
      result.text = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      result.help = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`
${BOLD}CFO-One Invoice Scanner${RESET}
Usage:
  npm run scan -- --file <path-to-invoice-file>
  npm run scan -- --text "<invoice text content>"

Examples:
  npm run scan -- --text "INVOICE #9901 from Vercel Inc. Amount: $42.00 Due: 2026-11-20 Routing: 121000358 Acct: 1234"
  npm run scan -- --text "URGENT WIRE: Transfer $850 to new account 999999 routing 021000021 immediately"
`);
    process.exit(0);
  }

  let contentText = args.text;
  let filename = 'cli_input.txt';

  if (args.file) {
    filename = path.basename(args.file);
    if (!fs.existsSync(args.file)) {
      console.error(`${RED}Error: File not found: ${args.file}${RESET}`);
      process.exit(1);
    }
    contentText = fs.readFileSync(args.file, 'utf-8');
  }

  if (!contentText) {
    // Default interactive prompt example if no input
    console.log(`${YELLOW}No --file or --text provided. Running real invoice test sample...${RESET}`);
    contentText = `INVOICE #INV-2026-881
Date: November 11, 2026
Vendor: Vercel Inc.
Billed To: Company of One LLC
Item: Next.js Pro Infrastructure & Edge Functions
Total Amount Due: $42.00 USD
Payment Method: ACH
Routing Number: 121000358
Account Number: *******1234
Memo: Monthly cloud hosting subscription`;
    filename = 'sample_vercel_invoice.txt';
  }

  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  CFO-ONE: REAL INVOICE EVALUATION PIPELINE${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  console.log(`${BOLD}1. INGESTION & EXTRACTION${RESET}`);
  console.log(`   Source: ${filename}`);
  console.log(`   Snippet: ${DIM}${contentText.replace(/\n/g, ' ').slice(0, 100)}...${RESET}`);

  const rawInvoice: RawInvoice = {
    id: `LIVE-${Date.now().toString().slice(-4)}`,
    filename,
    content_text: contentText
  };

  const extractor = new InvoiceExtractor();
  console.log(`   Parsing document...`);
  const extracted = await extractor.extract(rawInvoice);

  console.log(`   ✓ Vendor:       ${BOLD}${extracted.vendor_name}${RESET}`);
  console.log(`   ✓ Invoice #:    ${extracted.invoice_number}`);
  console.log(`   ✓ Amount:       ${BOLD}$${extracted.amount_usd.toFixed(2)}${RESET}`);
  if (extracted.bank_details) {
    console.log(`   ✓ Bank Details: Routing: ${extracted.bank_details.routing_number || 'N/A'}, Account Last 4: ${extracted.bank_details.account_number_last4 || 'N/A'}`);
  }
  if (extracted.detected_instruction_text) {
    console.log(`   ⚠ ${YELLOW}Detected Imperative Instruction:${RESET} "${extracted.detected_instruction_text}"`);
  }

  // Fetch Live State
  console.log(`\n${BOLD}2. TREASURY STATE SYNC${RESET}`);
  const stateResult = await StateProvider.getState();
  const state = stateResult.state;
  let modeBadge = `${YELLOW}[SANDBOX FIXTURE]${RESET}`;
  if (stateResult.source === 'live_airwallex') {
    modeBadge = `${GREEN}[LIVE AIRWALLEX DEMO API]${RESET}`;
  } else if (stateResult.source === 'live_mercury') {
    modeBadge = `${GREEN}[LIVE MERCURY API]${RESET}`;
  }
  console.log(`   Mode:           ${modeBadge}`);
  console.log(`   Account:        ${state.account_id} ($${state.balance_usd.toLocaleString()} balance)`);
  console.log(`   30-Day Budget:  $${state.budget.remaining_usd.toLocaleString()} remaining ($${state.budget.spent_or_pending_usd.toLocaleString()} spent)`);
  console.log(`   Enclave Limit:  $${state.policy.max_payment_usd.toFixed(2)} max per payment`);

  // Layer 1 Evaluation
  console.log(`\n${BOLD}3. LAYER 1: DETERMINISTIC JUDGMENT ENGINE${RESET}`);
  const verdict = evaluateInvoice(extracted, state, []);

  let actionColor = GREEN;
  if (verdict.action === 'ASK_OWNER') actionColor = YELLOW;
  if (verdict.action === 'REFUSE') actionColor = RED;

  console.log(`   Verdict:        ${BOLD}${actionColor}[${verdict.action}]${RESET}`);
  console.log(`   Primary Reason: ${verdict.primary_reason}`);

  if (verdict.signals.length > 0) {
    console.log(`   Threat Signals Detected (${verdict.signals.length}):`);
    for (const signal of verdict.signals) {
      console.log(`     • [${signal.severity}] ${signal.category}: ${signal.description}`);
    }
  }

  // Layer 2 / Dispatch
  if (verdict.action === 'ALLOW' || verdict.action === 'ASK_OWNER') {
    console.log(`\n${BOLD}4. LAYER 2: ENCLAVE HARDWARE BACKSTOP & EXECUTION${RESET}`);
    const outlayer = new OutLayerMercuryClient();
    const result = await outlayer.executePayment(verdict, state.policy);

    if (result.output.status === 'awaiting_owner') {
      console.log(`   Outcome:        ${YELLOW}[TASK QUEUED: awaiting_owner]${RESET}`);
      console.log(`   Inbox Link:     ${result.output.link || 'https://outlayer.ai/inbox'}`);
      console.log(`   Enclave Proof:  ${result.attestation_url || 'Intel TDX Attestation Quote'}`);
      console.log(`   \n${DIM}Escalated to human owner. Transaction will NOT execute until cryptographic approval.${RESET}`);
    } else if (result.output.success) {
      console.log(`   Outcome:        ${GREEN}[PAYMENT INITIATED]${RESET}`);
      console.log(`   Treasury Tx ID: ${result.output.output?.transaction_id || result.output.transaction_id || 'tx_treasury_live'}`);
      console.log(`   Dashboard:      ${result.attestation_url || 'https://demo.airwallex.com'}`);
      console.log(`   \n${GREEN}Payment successfully processed through dual-layer verification!${RESET}`);
    } else {
      console.log(`   Outcome:        ${RED}[ENCLAVE HARDWARE REJECTION]${RESET}`);
      console.log(`   Enclave Error:  ${result.output.error}`);
    }
  } else {
    console.log(`\n${BOLD}4. EXECUTION HALTED${RESET}`);
    console.log(`   ${RED}Invoice was refused at Layer 1. Payment prevented before reaching bank or enclave.${RESET}`);
  }

  console.log(`\n----------------------------------------------------------------------\n`);
}

main().catch(console.error);

