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

  public static async getState(forceRefresh: boolean = false): Promise<StateProviderResult> {
    if (!forceRefresh && this.cachedState) {
      return {
        state: this.cachedState,
        source: this.cachedSource,
        message: `Using cached state (${this.cachedSource})`
      };
    }

    // 1. Check Airwallex Demo/Production Credentials
    const airwallexClient = new AirwallexClient();
    if (airwallexClient.isConfigured()) {
      try {
        console.log('[CFO-One] AIRWALLEX credentials detected. Connecting to Airwallex API...');
        const liveState = await airwallexClient.syncState();
        this.cachedState = liveState;
        this.cachedSource = 'live_airwallex';
        console.log(`[CFO-One] Connected to Live Airwallex! Balance: $${liveState.balance_usd}, Beneficiaries: ${liveState.recipients.length}`);
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
        console.log('[CFO-One] MERCURY_API_KEY detected. Connecting to live Mercury API...');
        const liveState = await mercuryClient.syncState();
        this.cachedState = liveState;
        this.cachedSource = 'live_mercury';
        console.log(`[CFO-One] Connected to Live Mercury API! Account: ${liveState.account_id}, Balance: $${liveState.balance_usd}, Payees: ${liveState.recipients.length}`);
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
    if (process.env.DEBUG || process.env.NODE_ENV !== 'test') {
      console.log('[CFO-One] No live banking credentials configured (Airwallex / Mercury). Running with sandbox fixture baseline.');
    }

    // Load local fixture state
    const fixturesDir = path.resolve(__dirname, '../../fixtures');
    const statePath = path.join(fixturesDir, 'mock_mercury_state.json');
    const raw = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw) as MercuryState;

    this.cachedState = state;
    this.cachedSource = 'local_fixture';

    return {
      state,
      source: 'local_fixture',
      message: 'Running in sandbox fixture mode (mock_mercury_state.json)'
    };
  }

  public static clearCache(): void {
    this.cachedState = null;
  }
}
