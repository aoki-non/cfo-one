import {
  MercuryState,
  MercuryRecipient,
  MercuryTransaction,
  MercuryPolicy,
  PaymentMethod
} from '../types/index.js';

export interface AirwallexClientOptions {
  clientId?: string;
  apiKey?: string;
  baseUrl?: string;
  isDemo?: boolean;
}

export interface AirwallexBalance {
  currency: string;
  available_amount: number;
  total_amount: number;
  pending_amount?: number;
}

export interface AirwallexBeneficiaryItem {
  id: string;
  created_at: string;
  status: string;
  nick_name?: string;
  beneficiary: {
    type: string;
    company_name?: string;
    first_name?: string;
    last_name?: string;
    bank_details?: {
      account_currency?: string;
      account_name?: string;
      account_number?: string;
      bank_country_code?: string;
      bank_name?: string;
      routing_number?: string;
      iban?: string;
      swift_code?: string;
    };
  };
}

export class AirwallexClient {
  private clientId?: string;
  private apiKey?: string;
  private baseUrl: string;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(options: AirwallexClientOptions = {}) {
    this.clientId = options.clientId !== undefined ? options.clientId : process.env.AIRWALLEX_CLIENT_ID;
    this.apiKey = options.apiKey !== undefined ? options.apiKey : process.env.AIRWALLEX_API_KEY;
    const isDemo = options.isDemo !== undefined ? options.isDemo : (process.env.AIRWALLEX_ENV !== 'production');
    const defaultHost = isDemo ? 'https://api-demo.airwallex.com/api/v1' : 'https://api.airwallex.com/api/v1';
    this.baseUrl = (options.baseUrl || process.env.AIRWALLEX_API_URL || defaultHost).replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.clientId && this.apiKey && this.clientId.trim().length > 0 && this.apiKey.trim().length > 0);
  }

  /**
   * Obtain Bearer Access Token via Airwallex Authentication Endpoint
   * POST /api/v1/authentication/login
   */
  public async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Airwallex client is not configured. Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.');
    }

    // Reuse token if still valid (buffer 2 minutes)
    if (this.token && Date.now() < this.tokenExpiresAt - 120000) {
      return this.token;
    }

    const url = `${this.baseUrl}/authentication/login`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.clientId!,
        'x-api-key': this.apiKey!
      }
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Airwallex authentication failed [${res.status}]: ${err}`);
    }

    const data = await res.json();
    this.token = data.token;
    // Airwallex tokens are valid for 30 minutes
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 25 * 60 * 1000;
    this.tokenExpiresAt = expiresAt;

    return this.token!;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Airwallex API error [${res.status} ${res.statusText}] at ${endpoint}: ${err}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Health check / ping test against Airwallex Demo or Production
   */
  public async ping(): Promise<{ connected: boolean; message: string; usdBalance?: number; beneficiariesCount?: number }> {
    if (!this.isConfigured()) {
      return { connected: false, message: 'No AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY configured' };
    }
    try {
      const balances = await this.getBalances();
      const usd = balances.find((b) => b.currency === 'USD')?.available_amount ?? 0;
      const beneficiaries = await this.getBeneficiaries();

      return {
        connected: true,
        message: `Connected successfully to Airwallex Demo API (${this.baseUrl}). Found ${beneficiaries.length} beneficiary(ies).`,
        usdBalance: usd,
        beneficiariesCount: beneficiaries.length
      };
    } catch (err: any) {
      return { connected: false, message: `Airwallex connection failed: ${err.message}` };
    }
  }

  /**
   * Query multi-currency current balances
   * GET /api/v1/balances/current
   */
  public async getBalances(): Promise<AirwallexBalance[]> {
    const data = await this.request<{ balances?: AirwallexBalance[]; items?: AirwallexBalance[] }>('/balances/current');
    return data.balances || data.items || [];
  }

  /**
   * Get all registered Airwallex beneficiaries
   * GET /api/v1/beneficiaries
   */
  public async getBeneficiaries(): Promise<AirwallexBeneficiaryItem[]> {
    const data = await this.request<{ items?: AirwallexBeneficiaryItem[] }>('/beneficiaries?page_size=100');
    return data.items || [];
  }

  /**
   * Query financial transactions / transfer history
   */
  public async getTransfers(limit: number = 50): Promise<any[]> {
    try {
      const data = await this.request<{ items?: any[] }>(`/transfers?page_size=${limit}`);
      return data.items || [];
    } catch {
      return [];
    }
  }

  /**
   * Create an outbound payout transfer via Airwallex
   * POST /api/v1/transfers/create
   */
  public async createTransfer(params: {
    beneficiaryId: string;
    amount: number;
    currency?: string;
    reference?: string;
    requestId: string;
  }): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    beneficiaryId: string;
    dashboardUrl: string;
  }> {
    const payload = {
      request_id: params.requestId,
      beneficiary_id: params.beneficiaryId,
      source_currency: params.currency || 'USD',
      transfer_amount: params.amount,
      transfer_currency: params.currency || 'USD',
      transfer_method: 'LOCAL',
      reason: 'Invoice settlement',
      reference: (params.reference || 'CFO-One Invoice Payment').slice(0, 35)
    };

    const res = await this.request<any>('/transfers/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      id: res.id || `awx_tr_${Date.now()}`,
      status: res.status || 'PENDING_APPROVAL',
      amount: res.amount || params.amount,
      currency: res.currency || 'USD',
      beneficiaryId: res.beneficiary_id || params.beneficiaryId,
      dashboardUrl: `https://demo.airwallex.com/app/transfers/${res.id || ''}`
    };
  }

  /**
   * Syncs live state from Airwallex Demo/Production into the CFO-One TreasuryState
   */
  public async syncState(options: {
    monthlyBudgetUsd?: number;
    maxSinglePaymentUsd?: number;
  } = {}): Promise<MercuryState> {
    const balances = await this.getBalances();
    const usdBalanceObj = balances.find((b) => b.currency === 'USD') || balances[0];
    const balanceUsd = usdBalanceObj ? (usdBalanceObj.available_amount ?? usdBalanceObj.total_amount ?? 0) : 0;

    const rawBeneficiaries = await this.getBeneficiaries();
    const rawTransfers = await this.getTransfers(100);

    // Map beneficiaries to CFO recipients
    const recipients: MercuryRecipient[] = rawBeneficiaries.map((b) => {
      const details = b.beneficiary.bank_details;
      const routing = details?.routing_number || details?.swift_code || '121000358';
      const acct = details?.account_number || details?.iban || '';
      const last4 = acct.length >= 4 ? acct.slice(-4) : (acct || '4419');
      const name = b.beneficiary.company_name || 
        `${b.beneficiary.first_name || ''} ${b.beneficiary.last_name || ''}`.trim() || 
        b.nick_name || 'Vendor';

      return {
        id: b.id,
        name,
        routing_number: routing,
        account_number_last4: last4,
        preferred_payment_method: 'ach' as PaymentMethod,
        created_at: b.created_at || new Date().toISOString()
      };
    });

    // Map recent transfers
    const transactions: MercuryTransaction[] = rawTransfers.map((tx) => {
      let status: 'sent' | 'pending' | 'failed' = 'sent';
      const st = (tx.status || '').toUpperCase();
      if (st.includes('PENDING') || st.includes('WAITING')) status = 'pending';
      else if (st.includes('FAIL') || st.includes('CANCEL')) status = 'failed';

      return {
        id: tx.id || `awx_tx_${Math.random()}`,
        recipient_id: tx.beneficiary_id || 'unknown_beneficiary',
        recipient_name: tx.reference || 'Beneficiary',
        amount_usd: tx.amount || 0,
        date: tx.created_at || new Date().toISOString(),
        status,
        payment_method: 'ach'
      };
    });

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const spentIn30Days = transactions
      .filter((tx) => {
        const txTime = new Date(tx.date).getTime();
        return txTime >= thirtyDaysAgo && tx.status !== 'failed';
      })
      .reduce((sum, tx) => sum + tx.amount_usd, 0);

    const monthlyLimit = options.monthlyBudgetUsd || Number(process.env.MONTHLY_BUDGET_USD) || 10000;
    const maxSingle = options.maxSinglePaymentUsd || Number(process.env.MAX_PAYMENT_USD) || 1000;

    const policy: MercuryPolicy = {
      max_payment_usd: maxSingle,
      monthly_limit_usd: monthlyLimit,
      payment_methods: ['ach', 'domesticWire'],
      allowed_recipients: recipients.map((r) => r.id),
      rules: [
        {
          when: {
            op: 'pay_invoice',
            min_usd: 300,
            max_usd: maxSingle
          },
          then: 'ask'
        }
      ],
      sandbox: true
    };

    return {
      account_id: `airwallex_${this.clientId?.slice(0, 8) || 'demo'}`,
      balance_usd: balanceUsd,
      budget: {
        monthly_limit_usd: monthlyLimit,
        spent_or_pending_usd: Math.round(spentIn30Days * 100) / 100,
        remaining_usd: Math.max(0, Math.round((monthlyLimit - spentIn30Days) * 100) / 100)
      },
      recipients,
      recent_transactions: transactions,
      policy
    };
  }
}

