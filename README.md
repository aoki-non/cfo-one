# CFO-One: Autonomous B2B Clearance & Treasury Shop

> **NEAR Hackathon 2026 — Track 04: Autonomous Business**  
> *"The company of one. Or none. Build AI-native businesses with treasury, sales, procurement, cross-chain payments via NEAR Intents, and revenue sharing. Humans only set the constraints."*  
> **Tagline:** *"We didn't build a smarter agent, we built a CFO that proves why it said no."*

---

## 1. What CFO-One Does

**CFO-One** is an autonomous B2B financial clearance business operating with zero human headcount:

1. **Commercial Product (Sales Inflow)**: Sells confidential TEE invoice verification & treasury clearance as a service to DAOs, startups, and autonomous AI agents.
2. **Cross-Chain Payments (NEAR Intents / 1Click API)**: Clients pay audit fees ($10–$100+) in *any* token (Base USDC, Solana USDC, Ethereum ETH, Arbitrum USDC, or NEAR). Solvers fulfill the swap and settle funds directly to the agent's treasury on NEAR (`longdata4360.testnet`).
3. **Automated Revenue Sharing**: Programmatically splits 100% of revenue on-chain:
   - **70%** Retained in Treasury Reserve
   - **20%** Dispatched as dividends to human contributors (`contributors.testnet`)
   - **10%** Protocol Liquidity & Slippage Reserve
4. **Autonomous Procurement & Compute**: The agent purchases its own extraction inference from NEAR AI Cloud (metered under a strict $25.00/day founder limit) and settles vendor payables across live banking rails (Airwallex Demo API).
5. **Human Constraints (`config/config.yaml`)**: Humans never approve routine payments. Humans only set the declarative boundaries:
   - $10.00 Minimum audit fee
   - $25.00 Daily AI inference budget
   - $1,000.00 Single-payment hardware ceiling enforced by Intel TDX enclave
   - Emergency hardware Kill Switch (instantly freezes all disbursements)

---

## 2. Dual-Layer Security Architecture

Giving an AI agent direct, unconstrained access to a bank account or private key is financial suicide. Prompt injections and billing anomalies can drain capital in minutes.

```
Incoming Invoice (Email / PDF / JSON / CLI)
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 1: The Judgment Engine (Soft Layer)             │
│  • LLM extracts structured facts without deciding      │
│  • Bank detail diffing vs saved Airwallex recipients   │
│  • Median ratio check vs historical baseline           │
│  • Exact & mutated duplicate detection                 │
│  • 30-day velocity & budget drain checks               │
│  • Prompt injection & imperative instruction screening │
│  Verdict: [ALLOW] | [ASK_OWNER] | [REFUSE]             │
└───────────────────────┬────────────────────────────────┘
                        │ Verdict = ALLOW or ASK_OWNER
                        ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 2: Enclave Hardware Policy (Intel TDX TEE)      │
│  • $1,000.00 Hardware ceiling per payment              │
│  • Allowed payee allowlist validation                  │
│  • Rules: $300-$1,000 -> awaiting_owner co-sign        │
│  • Verifiable Intel TDX remote attestation quote       │
└───────────────────────┬────────────────────────────────┘
                        │ Passes Enclave
                        ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 3: Live Rails Execution                         │
│  • Fiat: Airwallex Global Demo API (ACH / Wire)        │
│  • Crypto: NEAR Testnet MPC Chain Signatures           │
└────────────────────────────────────────────────────────┘
```

---

## 3. Live Environments & Testnet Status

CFO-One eliminates mock simulations and connects to real testnet networks across all rails:

| Rail | Environment | Live Network & Credentials | Status |
| :--- | :--- | :--- | :--- |
| **NEAR Protocol** | Testnet | Account: `longdata4360.testnet`<br>Dividends: `contributors.testnet` | **ACTIVE** |
| **Chain Signatures** | Testnet | MPC Contract: `v1.signer-prod.testnet` | **ACTIVE** |
| **NEAR Intents** | Mainnet API + Testnet Settlement | `1click.chaindefuser.com/v0/tokens` (30+ chains) | **ACTIVE** |
| **Airwallex Banking** | Global Demo | `https://api-demo.airwallex.com/api/v1`<br>Balance: **$9,999,944.10 USD** (7 beneficiaries) | **ACTIVE** |
| **OutLayer TEE** | NEAR Testnet | `testnet-api.outlayer.ai` (Intel TDX Enclave) | **ACTIVE** |

---

## 4. Quickstart & Command Reference

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: System Connectivity & Credential Audit
```bash
npm run status
```

### Step 3: Run the 2-Minute Autonomous Commercial Loop
Demonstrates the full autonomous business lifecycle on NEAR Testnet in under 20 seconds (sales inflow via NEAR Intents → 20% contributor dividend dispatch → confidential TEE audit → inference procurement):
```bash
npm run demo:loop
```

### Step 4: Launch the High-Density Web Cockpit
```bash
npm run web
```
Open **[http://localhost:3000](http://localhost:3000)** to view:
- **01. Clearance & Risk Engine**: Payables stream, vendor breakdown, BEC threat alerts, and Intel TDX attestation quote links.
- **02. Revenue Distribution & Dividends**: 70/20/10 split visualization, interactive \$25 / \$50 commercial sale simulator, and Public Transparency Ledger.
- **03. NEAR Intents Multi-Chain Solver**: Token deposit quotes across Base, Solana, Arbitrum, Ethereum, and NEAR.
- **04. Founder Constraints**: Live view of `config.yaml` policies and hardware Kill Switch.

### Step 5: Run Automated Tests
```bash
npm test
```
**Results:** **16/16 tests passing across 2 test suites** with 0 failures:
- `CFO-One: Adversarial & Legitimate Test Suite` (8/8 pass)
- `CFO-One: Autonomous Business Track Test Suite` (8/8 pass)

---

## 5. Measured Security Benchmark (40 Test Invoices)

Tested against **40 real-world invoice vectors** (`fixtures/invoices_dataset.json`):
- **15 Legitimate Invoices**: Recurring SaaS subscriptions, cloud infrastructure, legal retainers.
- **15 Open Adversarial Invoices**: Duplicates, creeping price inflation, bank routing swaps (BEC), prompt injections, and budget siphons.
- **10 Held-out Adversarial Invoices**: Unseen test set evaluated live.

| Category | Metric | Measured Result |
|---|---|---|
| **Legitimate Throughput** | Frictionless auto-pay (`ALLOW`) | **10 / 15 (67%)** |
| **Legitimate Escalation** | Sent to owner inbox (`ASK_OWNER`) | **5 / 15 (33%)** (High-value & new vendors) |
| **False Positives** | Legitimate invoices erroneously blocked | **0 / 15 (0%)** |
| **Adversarial Defense** | Hostile invoices caught at Layer 1 | **25 / 25 (100%)** (16 Refused, 9 Escalated) |
| **Enclave Hardware Backstop** | Enclave Cap breaches physically blocked | **100%** (Intel TDX hardware enforced) |
| **False Negatives** | Hostile attacks allowed through | **0 / 25 (0%)** |
| **Held-Out Test Set** | Unseen adversarial cases caught | **10 / 10 (100%)** |

---

## 6. Codebase Architecture Map

```
cfo-one/
├── config/
│   └── config.yaml                    # Declarative founder constraints, splits & kill switch
├── fixtures/
│   ├── invoices_dataset.json          # 40-case benchmark (15 legit, 15 open hostile, 10 held-out)
│   ├── public_ledger.json             # Immutable public transparency ledger
│   └── recorded_responses/            # Real Intel TDX attestation response envelopes
├── src/
│   ├── config/
│   │   ├── env.ts                     # Environment loader
│   │   └── constraints.ts             # YAML constraints manager & kill switch handler
│   ├── intents/
│   │   └── oneClickClient.ts          # NEAR Intents / 1Click multi-chain payment solver
│   ├── business/
│   │   ├── revenueSplitter.ts         # Programmatic 70/20/10 dividend distribution engine
│   │   └── inferenceBudget.ts         # Autonomous compute meter ($25/day limit)
│   ├── chainSig/
│   │   └── mpcSigner.ts               # NEAR MPC Chain Signatures (v1.signer-prod.testnet)
│   ├── ledger/
│   │   └── publicLedger.ts            # Public transparency ledger audit engine
│   ├── engine/                        # Layer 1 threat defense (bankDiff, injection, baseline)
│   ├── extraction/                    # LLM invoice parser with anti-injection prompt barrier
│   ├── connector/                     # Airwallex Demo API, Mercury client & OutLayer TEE
│   ├── cli/
│   │   ├── demoLoop.ts                # 2-minute autonomous commercial loop (Track 04)
│   │   ├── scan.ts                    # Dynamic CLI invoice scanner
│   │   └── status.ts                  # System connectivity & credential auditor
│   └── web/
│       ├── index.html                 # High-density utilitarian financial terminal UI
│       └── server.ts                  # Backend API server (/api/status, /api/ledger, /api/kill-switch)
└── tests/
    ├── adversarial.test.ts            # Security & threat benchmark tests (8 tests)
    └── autonomous_business.test.ts    # Track 04 autonomous business test suite (8 tests)
```

---

## 7. License

MIT
