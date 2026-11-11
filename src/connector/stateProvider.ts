import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MercuryState } from '../types/index.js';
import { MercuryClient } from './mercuryClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StateProviderResult {
  state: MercuryState;
  source: 'live_mercury' | 'local_fixture';
  message: string;
}

export class StateProvider {
  private static cachedState: MercuryState | null = null;
  private static cachedSource: 'live_mercury' | 'local_fixture' = 'local_fixture';

  public static async getState(forceRefresh: boolean = false): Promise<StateProviderResult> {
    if (!forceRefresh && this.cachedState) {
      return {
        state: this.cachedState,
        source: this.cachedSource,
        message: `Using cached state (${this.cachedSource})`
      };
    }

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
    } else {
      // Informative log
      if (process.env.DEBUG || process.env.NODE_ENV !== 'test') {
        console.log('[CFO-One] No MERCURY_API_KEY configured. Running with sandbox fixture baseline.');
        console.log('[CFO-One] Set MERCURY_API_KEY in your environment to connect directly to live Mercury Sandbox or Production.');
      }
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
