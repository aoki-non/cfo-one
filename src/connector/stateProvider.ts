import '../config/env.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MercuryState } from '../types/index.js';
import { MercuryClient } from './mercuryClient.js';
import { AirwallexClient } from './airwallexClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StateProviderResult {
  state: MercuryState;
  source: 'live_airwallex' | 'live_mercury' | 'local_fixture';
  message: string;
}

export class StateProvider {
  private static cachedState: MercuryState | null = null;
  private static cachedSource: 'live_airwallex' | 'live_mercury' | 'local_fixture' = 'local_fixture';
  private static lastFetchTime: number = 0;
  private static readonly CACHE_TTL_MS: number = 5000; // 5-second TTL for live bank balance refresh
  private static cumulativeLocalDebits: number = 0;

  public static async getState(forceRefresh: boolean = false): Promise<StateProviderResult> {
    const isCacheValid = !forceRefresh && this.cachedState && (Date.now() - this.lastFetchTime < this.CACHE_TTL_MS);
    if (isCacheValid) {
      return {
        state: this.cachedState!,
        source: this.cachedSource,
        message: `Using cached state (${this.cachedSource})`
      };
    }

    // 1. Check Airwallex Demo/Production Credentials
    const airwallexClient = new AirwallexClient();
    if (airwallexClient.isConfigured()) {
      try {
        if (process.env.DEBUG) {
          console.log('[CFO-One] AIRWALLEX credentials detected. Connecting to Airwallex API...');
        }
        const liveState = await airwallexClient.syncState();
        this.cachedState = liveState;
        this.cachedSource = 'live_airwallex';
        this.lastFetchTime = Date.now();
        return {
          state: liveState,
          source: 'live_airwallex',
          message: `Live Airwallex Demo connected. Balance: $${liveState.balance_usd}, Beneficiaries: ${liveState.recipients.length}`
        };
      } catch (err: any) {
        console.warn(`[CFO-One] Live Airwallex sync failed: ${err.message}.`);
      }
    }

    // 2. Check Mercury Credentials
    const mercuryClient = new MercuryClient();
    if (mercuryClient.isConfigured()) {
      try {
        if (process.env.DEBUG) {
          console.log('[CFO-One] MERCURY_API_KEY detected. Connecting to live Mercury API...');
        }
        const liveState = await mercuryClient.syncState();
        this.cachedState = liveState;
        this.cachedSource = 'live_mercury';
        this.lastFetchTime = Date.now();
        return {
          state: liveState,
          source: 'live_mercury',
          message: `Live Mercury API connected. Account: ${liveState.account_id}, Balance: $${liveState.balance_usd}`
        };
      } catch (err: any) {
        console.warn(`[CFO-One] Live Mercury sync failed: ${err.message}. Falling back to sandbox baseline.`);
      }
    }

    // Informative log
    if (process.env.DEBUG) {
      console.log('[CFO-One] No live banking credentials configured (Airwallex / Mercury). Running with sandbox fixture baseline.');
    }

    // Load local fixture state
    const fixturesDir = path.resolve(__dirname, '../../fixtures');
    const statePath = path.join(fixturesDir, 'mock_mercury_state.json');
    const raw = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw) as MercuryState;

    state.balance_usd = Math.max(0, Math.round((state.balance_usd - this.cumulativeLocalDebits) * 100) / 100);
    if (state.budget) {
      state.budget.spent_or_pending_usd = Math.round((state.budget.spent_or_pending_usd + this.cumulativeLocalDebits) * 100) / 100;
      state.budget.remaining_usd = Math.max(0, Math.round((state.budget.monthly_limit_usd - state.budget.spent_or_pending_usd) * 100) / 100);
    }

    this.cachedState = state;
    this.cachedSource = 'local_fixture';
    this.lastFetchTime = Date.now();

    return {
      state,
      source: 'local_fixture',
      message: 'Running in sandbox fixture mode (mock_mercury_state.json)'
    };
  }

  public static debitBalance(amountUsd: number): void {
    this.cumulativeLocalDebits += amountUsd;
    if (this.cachedState) {
      this.cachedState.balance_usd = Math.max(0, Math.round((this.cachedState.balance_usd - amountUsd) * 100) / 100);
      if (this.cachedState.budget) {
        this.cachedState.budget.spent_or_pending_usd = Math.round((this.cachedState.budget.spent_or_pending_usd + amountUsd) * 100) / 100;
        this.cachedState.budget.remaining_usd = Math.max(0, Math.round((this.cachedState.budget.monthly_limit_usd - this.cachedState.budget.spent_or_pending_usd) * 100) / 100);
      }
      this.lastFetchTime = Date.now();
    }
  }

  public static clearCache(): void {
    this.cachedState = null;
    this.lastFetchTime = 0;
  }
}
