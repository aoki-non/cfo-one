# CFO-One: Autonomous Treasury for the Company of One

> Autonomous treasury ops with dual-layer Intel TDX enclave defense.  
> **Tagline:** *"We didn't build a smarter agent, we built a CFO that proves why it said no."*

Built for **NEAR Hackathon 2026**  
**Tracks:** `business` (Autonomous Business), `security` (AI Security & Defense), `realworld` (Real-World Money)

---

## 1. What It Is and The Problem It Solves

Giving an AI agent direct API access to a corporate bank account (e.g. Mercury) is dangerous. Prompt injections, hallucinated reasoning, and billing anomalies can drain capital in minutes.

The **OutLayer Mercury Connector** runs inside an Intel TDX confidential enclave (TEE) to enforce hard spending limits and keep bank credentials encrypted outside the AI. **This solves: "Can the agent steal?"**

However, an enclave alone cannot solve: **"Will the agent pay the right thing?"**
- An invoice from an approved vendor with quietly inflated numbers (e.g. $285 vs normal $42).
- The same invoice submitted twice under mutated invoice numbers.
- A legitimate vendor invoice with modified bank routing details (Business Email Compromise / BEC).
- Rapid micro-billing eating up 30-day runway.
- Imperative instructions injected into invoice memos.

**CFO-One provides the missing Judgment Layer.**

```
Incoming Invoice (Email / PDF / JSON / CLI)
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 1: The Judgment Engine (Soft Layer)             │
│  • LLM extracts structured fields without deciding    │
│  • Median ratio check vs historical baseline           │
│  • Exact & mutated duplicate detection                 │
│  • Bank detail diffing vs saved Mercury recipients     │
│  • 30-day velocity & budget drain checks               │
│  • Prompt injection & instruction-like text screening  │
│  Verdict: [ALLOW] | [ASK_OWNER] | [REFUSE]             │
└───────────────────────┬────────────────────────────────┘
                        │ Verdict = ALLOW or ASK
                        ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 2: Enclave Hardware Policy (OutLayer TDX)       │
│  • MERCURY_POLICY: $1,000 max single-payment cap       │
│  • Allowed payee allowlist                             │
│  • Rule matching: $300-$1,000 -> awaiting_owner task   │
│  • Signed Intel TDX remote attestation quote           │
└───────────────────────┬────────────────────────────────┘
                        │ Passes Enclave
                        ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 3: Human Backstop (Mercury Native)              │
│  • "Read + Send Money with Approval"                   │
│  • Final human signature in Mercury Dashboard          │
└────────────────────────────────────────────────────────┘
```

---

## 2. Making It Real: Live Multi-Rail Treasury (Airwallex Demo, Mercury, NEAR Testnet)

CFO-One is built to eliminate dummy/simulated data. It connects directly to live bank environments and confidential enclaves:

### A. Airwallex Global Multi-Currency API (Demo / Sandbox / Live) — *Recommended Globally*
CFO-One includes a full typed client (`src/connector/airwallexClient.ts`) interacting with the Airwallex v1 API (`https://api-demo.airwallex.com/api/v1`):
- **Universal Developer Access**: Free demo accounts are available globally (no US entity or domestic KYC needed).
- **Multi-Currency Balances**: Synchronizes real wallet balances across USD, EUR, GBP, and local clearing routes.
- **Beneficiary Allowlist & BEC Defense**: Fetches saved beneficiaries (`/beneficiaries`) and diff-checks invoice bank account / routing / IBAN details to detect Business Email Compromise.
- **Payout Transfers**: Dispatches payments (`/transfers/create`) with idempotency keys and native dashboard approval flows.

### B. Mercury Banking Integration (US Sandbox / Production)
CFO-One includes a full typed client (`src/connector/mercuryClient.ts`) interacting with Mercury API v1 (`https://api.mercury.com/api/v1`):
- **Live Account Balances**: Fetches real checking/treasury account balances.
- **Live Payee Allowlist**: Automatically synchronizes your approved recipients (`/recipients`) into the Layer 1 BEC diffing engine.
- **Dynamic 30-Day Velocity & Baselines**: Pulls historical transactions (`/account/{id}/transactions`) to calculate vendor medians and remaining monthly budget from actual data.
- **Payment Approvals**: Initiates payments using tokens configured with **"Send Money with Approval"**, ensuring payments queue in your Mercury dashboard for 1-click human owner signoff.

### C. OutLayer Intel TDX Enclaves on NEAR Testnet
- Executes calls through `testnet-api.outlayer.ai` via connector `connectors.outlayer.testnet/mercury`.
- Provides signed Intel TDX remote attestation quotes verifying that per-transaction hardware limits are physically enforced inside the TEE.

---

## 3. Quickstart & Command Reference

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Audit Connectivity & Credentials
Check whether live Mercury or OutLayer credentials are configured:
```bash
npm run status
```

### Step 3: Run the 15-Second Verified Demo
```bash
npm run demo
```

### Step 4: Scan Any Real Invoice Document
Scan any real invoice file or string dynamically through the 3-layer pipeline:
```bash
# Scan with inline invoice text
npm run scan -- --text "INVOICE #9901 from Vercel Inc. Amount: $42.00 Due: 2026-11-20 Routing: 121000358 Acct: 4419"

# Or scan an invoice file
npm run scan -- --file path/to/invoice.txt
```

### Step 5: Launch the Interactive Web Cockpit
```bash
npm run web
```
Open [http://localhost:3000](http://localhost:3000) to access the real-time invoice workbench, live treasury stats, and the complete 40-case adversarial benchmark.

### Step 6: Run Automated Tests
```bash
npm test
```
**Expected Output:**
```
✔ should initialize MercuryClient and verify configuration handling
✔ should auto-approve routine recurring invoices (Control Group)
✔ should block BEC account takeover / bank detail routing swaps at Layer 1
✔ should escalate high-value legal retainer to OutLayer awaiting_owner task
✔ should detect prompt injection in invoice memo and escalate to owner
✔ should enforce Enclave hardware spending cap on forced $12,000 transaction
✔ should evaluate full 40-case benchmark with 0 false negatives
ℹ tests 7 | pass 7 | fail 0
```

---

## 4. Connecting Real Credentials (Environment Setup)

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Environment Variable | Description |
|---|---|
| `MERCURY_API_KEY` | Bearer token from Mercury Dashboard (Settings -> API Tokens). Use "Read and Send Money with Approval". |
| `MERCURY_ACCOUNT_ID` | Optional: Your target Mercury checking account ID. |
| `OUTLAYER_PAYMENT_KEY` | OutLayer testnet payment key for Intel TDX execution. |
| `OUTLAYER_SECRETS_ACCOUNT` | Your NEAR Testnet account ID (e.g. `owner.testnet`). |
| `NEAR_AI_API_KEY` | Optional: Private TEE LLM inference via NEAR AI Cloud (`meta-llama/Meta-Llama-3.1-70B-Instruct`). |

*Note: If no API keys are exported, CFO-One automatically falls back to verified sandbox fixtures with clear terminal notices, ensuring that CI/CD and offline evaluations succeed without hard external dependencies.*

---

## 5. Measured Benchmark Results (Unedited)

Tested against **40 real-world invoice vectors**:
- **15 Legitimate Invoices**: SaaS subscriptions, hourly contractor sprints, legal retainers, and new vendor onboarding.
- **15 Open Adversarial Invoices**: Duplicates, creeping inflation, bank swaps, prompt injections, and budget siphons.
- **10 Held-out Adversarial Invoices**: Unseen test set evaluated live during execution.

| Category | Metric | Measured Result |
|---|---|---|
| **Legitimate Throughput** | Frictionless auto-pay (`ALLOW`) | **10 / 15 (67%)** |
| **Legitimate Escalation** | Sent to owner inbox (`ASK_OWNER`) | **5 / 15 (33%)** (High-value & new vendors) |
| **False Positives** | Legitimate invoices erroneously blocked | **0 / 15 (0%)** |
| **Adversarial Defense** | Hostile invoices caught at Layer 1 | **25 / 25 (100%)** (16 Refused, 9 Escalated) |
| **Enclave Hardware Backstop** | Enclave Cap breaches physically blocked | **100%** (Hardware TDX enforced) |
| **False Negatives** | Hostile attacks allowed through | **0 / 25 (0%)** |
| **Held-Out Test Set** | Unseen adversarial cases caught | **10 / 10 (100%)** |

---

## 6. Architectural Invariants

1. **"LLM extracts, code decides"**: The model translates unstructured invoice text into structured fields. The LLM never decides whether to pay; deterministic code evaluates invariants.
2. **Bank Detail Decoupling**: The agent **never** sends funds to bank details printed on an invoice. The connector strictly pays pre-registered Mercury `recipient_id`s. Bank details on invoices are strictly diff-checked against saved records to detect Business Email Compromise (BEC).
3. **Statistical Baseline over Thin History**: Uses median ratio with minimum observation count (>= 3 payments). Vendors with fewer than 3 payments are escalated to `ASK_OWNER`.
4. **OutLayer Enclave Rules Alignment**:
   - `max_payment_usd: 1000.00` is a hardware ceiling.
   - Rule `min_usd: 300, max_usd: 1000` -> `then: ask` triggers native OutLayer `awaiting_owner` task creation with wallet signature confirmation.

---

## 7. Project Structure

```
cfo-one/
├── .env.example                       # Environment configuration guide
### 3. Track 04: Autonomous Business ("The Company of One, or None")

CFO-One operates as a self-sustaining **Autonomous Clearance & Treasury Shop**:
- **Commercial Product**: B2B Confidential TEE Invoice Verification & Cross-Chain Treasury Clearance for DAOs, startups, and autonomous AI agents.
- **Sales Inflow (NEAR Intents / 1Click API)**: Clients pay for clearance fees in *any* token (Base USDC, Solana SOL, Ethereum ETH, or NEAR). Cross-chain solvers settle funds directly into CFO-One's treasury account.
- **Founder Governance (`config/config.yaml`)**: The human sets rules in one YAML file:
  - Minimum audit fee ($10.00)
  - Daily AI inference compute ceiling ($25.00/day)
  - Enclave single-payment cap ($1,000.00)
  - Automated revenue splits: 70% Retained Treasury, 20% Contributor Dividends, 10% Reserve
  - Emergency hardware kill switch (freezes all payouts instantly inside TEE)
- **Automated Revenue Sharing**: 20% of every clearance sale is programmatically calculated and dispatched to `contributors.testnet` on NEAR.
- **Autonomous Procurement**: The agent buys its own extraction inference from NEAR AI Cloud and pays operational bills (Airwallex fiat ACH/wire) strictly within enclave limits.
- **Public Transparency Ledger**: Live on-chain audit trail in the Web Cockpit logging every Sale, Contributor Dividend, AI Inference Expense, and Intel TDX attestation quote.

```bash
# Run the 2-minute autonomous commercial loop on NEAR Testnet:
npm run demo:loop
```

---

## 4. Quickstart & Commands

```bash
# 1. Check system connectivity (Airwallex Demo, NEAR Testnet, Founder Constraints)
npm run status

# 2. Run the 2-minute autonomous business loop (Track 04)
npm run demo:loop

# 3. Scan & evaluate an invoice from the CLI
npm run scan -- --text "INVOICE #INV-01 Vendor: Vercel Amount: $42.00"

# 4. Launch the Web Cockpit with Public Ledger & Kill Switch
npm run web
# Open http://localhost:3000

# 5. Run the full test suite (16 tests, 2 suites)
npm test
```

---

## 5. Architecture & Codebase Map

```
cfo-one/
├── config/
│   └── config.yaml                    # Founder constraints, revenue splits & kill switch
├── fixtures/
│   ├── mock_mercury_state.json        # Fallback account, recipients & policy
│   ├── invoices_dataset.json          # 40-case benchmark (15 legit, 15 open hostile, 10 held-out)
│   ├── public_ledger.json             # Immutable public transparency ledger
│   └── recorded_responses/            # Real Intel TDX attestation response envelopes
├── src/
│   ├── config/
│   │   ├── env.ts                     # Multi-environment secret loader
│   │   └── constraints.ts             # YAML constraints manager & kill switch handler
│   ├── intents/
│   │   └── oneClickClient.ts          # NEAR Intents / 1Click multi-chain payment solver
│   ├── business/
│   │   ├── revenueSplitter.ts         # Programmatic 70/20/10 dividend dispatcher
│   │   └── inferenceBudget.ts         # Autonomous NEAR AI Cloud compute meter
│   ├── chainSig/
│   │   └── mpcSigner.ts               # NEAR Chain Signatures (v1.signer-prod.testnet)
│   ├── ledger/
│   │   └── publicLedger.ts            # Public transparency ledger audit engine
│   ├── engine/                        # Dual-layer threat defense (BEC, budget, bankDiff)
│   ├── extraction/                    # LLM invoice extraction & instruction screening
│   ├── connector/                     # Airwallex Demo, Mercury API & OutLayer TEE Enclave
│   ├── cli/
│   │   ├── demoLoop.ts                # 2-minute autonomous business loop (Track 04)
│   │   ├── scan.ts                    # Live invoice ingestion CLI
│   │   └── status.ts                  # System connectivity & credential auditor
│   └── web/
│       ├── index.html                 # Web Cockpit with Public Ledger & Kill Switch
│       └── server.ts                  # Backend API server with /api/ledger, /api/kill-switch
└── tests/
    ├── adversarial.test.ts            # Security & threat benchmark tests
    └── autonomous_business.test.ts    # Track 04 autonomous business test suite
```

## License
MIT
