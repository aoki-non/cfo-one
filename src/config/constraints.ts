import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BusinessConstraints {
  business: {
    name: string;
    tagline: string;
    agent_near_account: string;
    custody_mode: string;
    network: string;
  };
  commercial_rules: {
    min_audit_fee_usd: number;
    max_inference_daily_usd: number;
    max_single_payment_usd: number;
    monthly_budget_usd: number;
  };
  revenue_splits: {
    retained_treasury_percent: number;
    contributor_dividend_percent: number;
    liquidity_reserve_percent: number;
    contributor_account: string;
  };
  emergency_controls: {
    kill_switch: boolean;
  };
}

export class ConstraintsManager {
  private static configPath = path.resolve(__dirname, '../../config/config.yaml');
  private static cachedConfig: BusinessConstraints | null = null;

  public static getConstraints(reload: boolean = false): BusinessConstraints {
    if (!reload && this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = yaml.load(raw) as BusinessConstraints;

      // Validate total revenue splits equals 100%
      const totalSplit =
        parsed.revenue_splits.retained_treasury_percent +
        parsed.revenue_splits.contributor_dividend_percent +
        parsed.revenue_splits.liquidity_reserve_percent;

      if (totalSplit !== 100) {
        console.warn(`[Constraints] Warning: Revenue splits sum to ${totalSplit}%, expected 100%.`);
      }

      this.cachedConfig = parsed;
      return parsed;
    } catch (err: any) {
      console.warn(`[Constraints] Failed to load config.yaml (${err.message}). Using safe defaults.`);
      const fallback: BusinessConstraints = {
        business: {
          name: 'CFO-One Autonomous Clearance & Treasury Shop',
          tagline: 'Confidential TEE Invoice Verification & Cross-Chain Treasury Clearance',
          agent_near_account: process.env.OUTLAYER_SECRETS_ACCOUNT || 'longdata4360.testnet',
          custody_mode: 'outlayer_tdx_enclave',
          network: 'testnet'
        },
        commercial_rules: {
          min_audit_fee_usd: 10.0,
          max_inference_daily_usd: 25.0,
          max_single_payment_usd: 1000.0,
          monthly_budget_usd: 3500.0
        },
        revenue_splits: {
          retained_treasury_percent: 70,
          contributor_dividend_percent: 20,
          liquidity_reserve_percent: 10,
          contributor_account: 'contributors.testnet'
        },
        emergency_controls: {
          kill_switch: false
        }
      };
      this.cachedConfig = fallback;
      return fallback;
    }
  }

  public static isKillSwitchActive(): boolean {
    const config = this.getConstraints();
    return Boolean(config.emergency_controls.kill_switch);
  }

  public static updateConstraints(updates: Partial<{
    max_single_payment_usd: number;
    monthly_budget_usd: number;
    max_inference_daily_usd: number;
    retained_treasury_percent: number;
    contributor_dividend_percent: number;
    liquidity_reserve_percent: number;
  }>): BusinessConstraints {
    const config = this.getConstraints();
    if (updates.max_single_payment_usd !== undefined) config.commercial_rules.max_single_payment_usd = updates.max_single_payment_usd;
    if (updates.monthly_budget_usd !== undefined) config.commercial_rules.monthly_budget_usd = updates.monthly_budget_usd;
    if (updates.max_inference_daily_usd !== undefined) config.commercial_rules.max_inference_daily_usd = updates.max_inference_daily_usd;
    if (updates.retained_treasury_percent !== undefined) config.revenue_splits.retained_treasury_percent = updates.retained_treasury_percent;
    if (updates.contributor_dividend_percent !== undefined) config.revenue_splits.contributor_dividend_percent = updates.contributor_dividend_percent;
    if (updates.liquidity_reserve_percent !== undefined) config.revenue_splits.liquidity_reserve_percent = updates.liquidity_reserve_percent;

    try {
      const dump = yaml.dump(config, { indent: 2 });
      fs.writeFileSync(this.configPath, dump, 'utf-8');
      this.cachedConfig = config;
      console.log(`[Constraints] Guardrails updated by CFO: max_single=$${config.commercial_rules.max_single_payment_usd}, monthly=$${config.commercial_rules.monthly_budget_usd}`);
    } catch (err: any) {
      console.error(`[Constraints] Failed to persist config.yaml: ${err.message}`);
    }
    return config;
  }

  public static setKillSwitch(active: boolean): BusinessConstraints {
    const config = this.getConstraints();
    config.emergency_controls.kill_switch = active;
    try {
      const dump = yaml.dump(config, { indent: 2 });
      fs.writeFileSync(this.configPath, dump, 'utf-8');
      this.cachedConfig = config;
      console.log(`[Constraints] Kill switch updated: ${active ? 'ACTIVATED (ALL OUTFLOWS FROZEN)' : 'DISARMED (NORMAL OPERATIONS)'}`);
    } catch (err: any) {
      console.error(`[Constraints] Failed to persist kill switch state: ${err.message}`);
    }
    return config;
  }
}
