import { MercuryClient } from '../connector/mercuryClient.js';
import { AirwallexClient } from '../connector/airwallexClient.js';

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

  // 1. Airwallex Global Treasury (Demo / Production)
  console.log(`${BOLD}1. Airwallex Global Multi-Currency API (Demo / Production)${RESET}`);
  const awxClient = new AirwallexClient();
  if (!awxClient.isConfigured()) {
    console.log(`   Status:  ${YELLOW}[NOT CONFIGURED]${RESET}`);
    console.log(`   Details: No AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY.`);
    console.log(`   Action:  To connect free Airwallex Demo (available globally including Nigeria):`);
    console.log(`            1. Sign up for a free Demo account at https://demo.airwallex.com`);
    console.log(`            2. Go to Account Settings -> Developer -> API Keys.`);
    console.log(`            3. Copy your Client ID and API Key.`);
    console.log(`            4. export AIRWALLEX_CLIENT_ID="your-client-id"`);
    console.log(`               export AIRWALLEX_API_KEY="your-api-key"\n`);
  } else {
    console.log(`   Status:  ${CYAN}[TESTING LIVE ENDPOINT...]${RESET}`);
    const ping = await awxClient.ping();
    if (ping.connected) {
      console.log(`   Status:  ${GREEN}[CONNECTED - LIVE AIRWALLEX DEMO]${RESET}`);
      console.log(`   Message: ${ping.message}`);
      console.log(`   • Available USD Balance: $${(ping.usdBalance || 0).toLocaleString()}`);
      console.log(`   • Saved Beneficiaries:   ${ping.beneficiariesCount} approved payee(s) on allowlist`);
    } else {
      console.log(`   Status:  ${RED}[CONNECTION ERROR]${RESET}`);
      console.log(`   Error:   ${ping.message}`);
    }
    console.log('');
  }

  // 2. Mercury Banking Connection
  console.log(`${BOLD}2. Mercury Banking API (US Sandbox / Production)${RESET}`);
  const mercuryKey = process.env.MERCURY_API_KEY;
  if (!mercuryKey) {
    console.log(`   Status:  ${YELLOW}[NOT CONFIGURED]${RESET}`);
    console.log(`   Details: No MERCURY_API_KEY in environment (Note: restricted in Nigeria/Africa).`);
    console.log(`   Action:  If using a US entity: export MERCURY_API_KEY="token"\n`);
  } else {
    console.log(`   Status:  ${CYAN}[TESTING LIVE ENDPOINT...]${RESET}`);
    const client = new MercuryClient();
    try {
      const ping = await client.ping();
      if (ping.connected) {
        console.log(`   Status:  ${GREEN}[CONNECTED - LIVE MERCURY API]${RESET}`);
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

  // 3. OutLayer TEE Enclave Connection (NEAR Testnet)
  console.log(`${BOLD}3. OutLayer Confidential Enclave (Intel TDX on NEAR Testnet)${RESET}`);
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

  // 4. Private LLM Inference (NEAR AI Cloud / OpenAI)
  console.log(`${BOLD}4. Extraction Engine (Private TEE LLM Inference)${RESET}`);
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
