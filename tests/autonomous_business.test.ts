import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ConstraintsManager } from '../src/config/constraints.js';
import { NearIntentsClient } from '../src/intents/oneClickClient.js';
import { RevenueSplitter } from '../src/business/revenueSplitter.js';
import { InferenceBudgetMeter } from '../src/business/inferenceBudget.js';
import { NearChainSignatures } from '../src/chainSig/mpcSigner.js';
import { PublicLedger } from '../src/ledger/publicLedger.js';

describe('CFO-One: Autonomous Business Track Test Suite', () => {
  it('should load founder constraints from config.yaml and validate schema', () => {
    const config = ConstraintsManager.getConstraints(true);
    assert.ok(config.business.name.includes('CFO-One'));
    assert.strictEqual(config.commercial_rules.min_audit_fee_usd, 10.0);
    assert.strictEqual(config.commercial_rules.max_inference_daily_usd, 25.0);
    assert.strictEqual(config.revenue_splits.retained_treasury_percent, 70);
    assert.strictEqual(config.revenue_splits.contributor_dividend_percent, 20);
    assert.strictEqual(config.revenue_splits.liquidity_reserve_percent, 10);
    assert.strictEqual(config.revenue_splits.contributor_account, 'contributors.testnet');
  });

  it('should reject payment intent if below minimum clearance fee rule', async () => {
    const intentsClient = new NearIntentsClient();
    const rejectedQuote = await intentsClient.createPaymentIntent({
      originTokenSymbol: 'USDC',
      originChain: 'base',
      amountUsd: 5.0, // Below $10 minimum
      clientAddress: '0xClient123',
      invoiceIdToClear: 'INV-TEST'
    });

    assert.strictEqual(rejectedQuote.status, 'REJECTED');
    assert.ok(rejectedQuote.rejectionReason?.includes('below minimum audit clearance fee'));
  });

  it('should generate and settle valid cross-chain payment intent via NEAR Intents', async () => {
    const intentsClient = new NearIntentsClient();
    const validQuote = await intentsClient.createPaymentIntent({
      originTokenSymbol: 'USDC',
      originChain: 'base',
      amountUsd: 25.0,
      clientAddress: '0xClient123',
      invoiceIdToClear: 'INV-TEST'
    });

    assert.strictEqual(validQuote.status, 'PENDING_DEPOSIT');
    assert.ok(validQuote.depositAddress.startsWith('0x'));
    assert.strictEqual(validQuote.originAsset.amountUsd, 25.0);

    const settlement = await intentsClient.settleIntent(validQuote);
    assert.strictEqual(settlement.settled, true);
    assert.strictEqual(settlement.amountUsd, 25.0);
    assert.ok(settlement.txHash.startsWith('0xintents'));
  });

  it('should execute automated revenue split (70% Treasury / 20% Contributor / 10% Reserve)', async () => {
    // Ensure kill switch is disarmed
    ConstraintsManager.setKillSwitch(false);

    const split = await RevenueSplitter.executeSplit({
      amountUsd: 50.0,
      saleId: 'sale_test_01'
    });

    assert.strictEqual(split.payout_status, 'DISPATCHED');
    assert.strictEqual(split.splits.retained_treasury_usd, 35.0); // 70% of 50
    assert.strictEqual(split.splits.contributor_dividend_usd, 10.0); // 20% of 50
    assert.strictEqual(split.splits.liquidity_reserve_usd, 5.0); // 10% of 50
    assert.strictEqual(split.contributor_account, 'contributors.testnet');
    assert.ok(split.near_payout_tx_hash?.startsWith('near_tx_div'));
  });

  it('should halt revenue payouts when emergency kill switch is active', async () => {
    ConstraintsManager.setKillSwitch(true);
    assert.strictEqual(ConstraintsManager.isKillSwitchActive(), true);

    const split = await RevenueSplitter.executeSplit({
      amountUsd: 50.0,
      saleId: 'sale_halted_01'
    });

    assert.strictEqual(split.payout_status, 'HALTED_KILL_SWITCH');
    assert.ok(split.notes.includes('kill switch'));

    // Disarm after test
    ConstraintsManager.setKillSwitch(false);
    assert.strictEqual(ConstraintsManager.isKillSwitchActive(), false);
  });

  it('should meter daily AI inference procurement and enforce $25.00 daily limit', () => {
    const statusBefore = InferenceBudgetMeter.getStatus();
    assert.ok(statusBefore.limit_usd === 25.0);

    const check = InferenceBudgetMeter.canSpend(1.0);
    assert.strictEqual(check.allowed, true);

    InferenceBudgetMeter.recordSpend(0.05, 'near-ai/llama-3.1-70b');
    const statusAfter = InferenceBudgetMeter.getStatus();
    assert.ok(statusAfter.total_spend_usd >= 0.05);

    // Over-budget check
    const overBudgetCheck = InferenceBudgetMeter.canSpend(30.0);
    assert.strictEqual(overBudgetCheck.allowed, false);
    assert.ok(overBudgetCheck.reason?.includes('spending limit'));
  });

  it('should derive foreign EVM address and request NEAR Chain Signature via MPC', async () => {
    const derived = NearChainSignatures.deriveForeignAddress('longdata4360.testnet', 'base-1', 'base');
    assert.ok(derived.startsWith('0x'));
    assert.strictEqual(derived.length, 42); // standard 20-byte EVM address format

    const sigResult = await NearChainSignatures.signPayload('longdata4360.testnet', {
      derivationPath: 'base-1',
      payloadHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      targetChain: 'base'
    });

    assert.strictEqual(sigResult.nearSignerContract, 'v1.signer-prod.testnet');
    assert.strictEqual(sigResult.derivedAddress, derived);
    assert.ok(sigResult.signature.r.startsWith('0x'));
    assert.ok(sigResult.txHash.startsWith('near_mpc'));
  });

  it('should log immutable events to Public Transparency Ledger', () => {
    const entry = PublicLedger.recordEntry({
      type: 'SALE_INFLOW',
      amount_usd: 100.0,
      asset: 'USDC (Base)',
      counterparty: '0xTester',
      description: 'Unit test ledger recording',
      status: 'SETTLED',
      attestation_url: 'https://api.outlayer.ai/attestation/quote_test'
    });

    assert.ok(entry.id.startsWith('LEDGER-'));
    assert.strictEqual(entry.amount_usd, 100.0);

    const all = PublicLedger.getEntries();
    const found = all.find((e) => e.id === entry.id);
    assert.ok(found);
  });
});

