import { MercuryClient } from '../connector/mercuryClient.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

async function checkStatus() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  CFO-ONE: SYSTEM CONNECTIVITY & CREDENTIAL AUDIT${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  // 1. Mercury Banking Connection
  console.log(`${BOLD}1. Mercury Banking API (Sandbox / Production)${RESET}`);
  const mercuryKey = process.env.MERCURY_API_KEY;
  if (!mercuryKey) {
    console.log(`   Status:  ${YELLOW}[NOT CONFIGURED - FIXTURE FALLBACK]${RESET}`);
    console.log(`   Details: No MERCURY_API_KEY in environment.`);
    console.log(`   Action:  To connect real Mercury Sandbox:`);
    console.log(`            1. Log in to your Mercury dashboard (or Sandbox).`);
    console.log(`            2. Go to Settings -> API Tokens -> Generate Token.`);
    console.log(`            3. Select "Read and Send Money with Approval".`);
    console.log(`            4. export MERCURY_API_KEY="your-token"\n`);
  } else {
    console.log(`   Status:  ${CYAN}[TESTING LIVE ENDPOINT...]${RESET}`);
    const client = new MercuryClient();
    try {
      const ping = await client.ping();
      if (ping.connected) {
        console.log(`   Status:  ${GREEN}[CONNECTED - LIVE API]${RESET}`);
        console.log(`   Message: ${ping.message}`);
        const accounts = await client.getAccounts();
        for (const acc of accounts) {
          console.log(`   • Account: ${acc.name} (${acc.id}) | Balance: $${acc.currentBalance.toLocaleString()} | Routing: ${acc.routingNumber || 'N/A'}`);
        }
        const recipients = await client.getRecipients();
        console.log(`   • Registered Payees: ${recipients.length} payee(s) on allowlist`);
      } else {
        console.log(`   Status:  ${RED}[CONNECTION ERROR]${RESET}`);
        console.log(`   Error:   ${ping.message}`);
      }
    } catch (err: any) {
      console.log(`   Status:  ${RED}[FAILED]${RESET}: ${err.message}`);
    }
    console.log('');
  }

  // 2. OutLayer TEE Enclave Connection (NEAR Testnet)
  console.log(`${BOLD}2. OutLayer Confidential Enclave (Intel TDX on NEAR Testnet)${RESET}`);
  const outlayerKey = process.env.OUTLAYER_PAYMENT_KEY;
  const secretsAcct = process.env.OUTLAYER_SECRETS_ACCOUNT;
  const host = process.env.OUTLAYER_API_HOST || 'testnet-api.outlayer.ai';

  if (!outlayerKey || !secretsAcct) {
    console.log(`   Status:  ${YELLOW}[FIXTURE REPLAY MODE]${RESET}`);
    console.log(`   Details: Using verified recorded Intel TDX remote attestation quotes.`);
    console.log(`   Action:  To connect live OutLayer Testnet Enclave:`);
    console.log(`            export OUTLAYER_PAYMENT_KEY="<key>"`);
    console.log(`            export OUTLAYER_SECRETS_ACCOUNT="<your-name.testnet>"\n`);
  } else {
    console.log(`   Status:  ${GREEN}[CONFIGURED - LIVE TESTNET]${RESET}`);
    console.log(`   Host:    ${host}`);
    console.log(`   Account: ${secretsAcct}\n`);
  }

  // 3. Private LLM Inference (NEAR AI Cloud / OpenAI)
  console.log(`${BOLD}3. Extraction Engine (Private TEE LLM Inference)${RESET}`);
  const nearAiKey = process.env.NEAR_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (nearAiKey) {
    console.log(`   Status:  ${GREEN}[ACTIVE: NEAR AI CLOUD TEE]${RESET}`);
    console.log(`   Model:   meta-llama/Meta-Llama-3.1-70B-Instruct inside confidential enclave\n`);
  } else if (openaiKey) {
    console.log(`   Status:  ${GREEN}[ACTIVE: OPENAI API]${RESET}`);
    console.log(`   Model:   gpt-4o-mini\n`);
  } else {
    console.log(`   Status:  ${CYAN}[DETERMINISTIC REGEX & PATTERN EXTRACTOR]${RESET}`);
    console.log(`   Details: Credential-free local parsing for CI & evaluation.\n`);
  }

  console.log(`${BOLD}Summary:${RESET}`);
  console.log(`To run the live pipeline against your own documents or real sandbox:`);
  console.log(`  ${DIM}$ npm run scan -- --text "Invoice INV-01 from Vercel for $42.00"${RESET}`);
  console.log(`  ${DIM}$ npm run web  (opens web dashboard with live invoice tester)${RESET}\n`);
}

checkStatus().catch(console.error);
