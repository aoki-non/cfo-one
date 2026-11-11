import {
  MercuryState,
  MercuryRecipient,
  MercuryTransaction,
  MercuryPolicy,
  PaymentMethod
} from '../types/index.js';

export interface MercuryApiAccount {
  id: string;
  name: string;
  nickname?: string;
  status: string;
  type: string;
  routingNumber?: string;
  accountNumber?: string;
  currentBalance: number;
  availableBalance: number;
}

export interface MercuryApiRecipient {
  id: string;
  name: string;
  status?: string;
  electronicRoutingInfo?: {
    routingNumber?: string;
    accountNumber?: string;
    accountType?: string;
  };
  paymentMethod?: string;
  defaultPaymentMethod?: string;
  createdAt?: string;
}

export interface MercuryApiTransaction {
  id: string;
  amount: number;
  counterpartyName?: string;
  counterpartyId?: string;
  status: 'sent' | 'pending' | 'failed' | 'cancelled';
  postedAt?: string;
  createdAt?: string;
  note?: string;
  bankDescription?: string;
  kind?: string;
}

export interface MercuryClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class MercuryClient {
  private apiKey?: string;
  private baseUrl: string;

  constructor(options: MercuryClientOptions = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : process.env.MERCURY_API_KEY;
    this.baseUrl = (options.baseUrl || process.env.MERCURY_API_URL || 'https://api.mercury.com/api/v1').replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Mercury API key is not configured. Set MERCURY_API_KEY in your environment.');
    }

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Mercury API error [${res.status} ${res.statusText}] at ${endpoint}: ${errBody}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Health check / ping test against Mercury API
   */
  public async ping(): Promise<{ connected: boolean; message: string; accountsCount?: number }> {
    if (!this.isConfigured()) {
      return { connected: false, message: 'No MERCURY_API_KEY configured' };
    }
    try {
      const accounts = await this.getAccounts();
      return {
        connected: true,
        message: `Connected successfully to Mercury API. Found ${accounts.length} account(s).`,
        accountsCount: accounts.length
      };
    } catch (err: any) {
      return { connected: false, message: `Mercury API connection failed: ${err.message}` };
    }
  }

  /**
   * Get all Mercury accounts (checking, savings, treasury)
   */
  public async getAccounts(): Promise<MercuryApiAccount[]> {
    const data = await this.request<{ accounts: MercuryApiAccount[] }>('/accounts');
    return data.accounts || [];
  }

  /**
   * Get all registered Mercury recipients
   */
  public async getRecipients(): Promise<MercuryApiRecipient[]> {
    try {
      const data = await this.request<{ recipients: MercuryApiRecipient[] }>('/recipients');
      return data.recipients || [];
    } catch (err: any) {
      // Mercury v1 uses either /recipients or /recipient
      const fallback = await this.request<{ recipients?: MercuryApiRecipient[]; recipientList?: MercuryApiRecipient[] }>('/recipient');
      return fallback.recipients || fallback.recipientList || [];
    }
  }

  /**
   * Get transactions for a specific account or organization
   */
  public async getTransactions(accountId?: string, limit: number = 50): Promise<MercuryApiTransaction[]> {
    const endpoint = accountId
      ? `/account/${accountId}/transactions?limit=${limit}`
      : `/transactions?limit=${limit}`;
    const data = await this.request<{ transactions: MercuryApiTransaction[] }>(endpoint);
    return data.transactions || [];
  }

  /**
   * Create an outbound payment on Mercury (ACH / Wire)
   * Note: If the token has "Approval required" permission, this queues in Mercury as Pending Approval
   */
  public async createPayment(params: {
    accountId: string;
    recipientId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    idempotencyKey: string;
    note?: string;
  }): Promise<{
    id: string;
    status: string;
    amount: number;
    recipientId: string;
    note?: string;
    dashboardUrl?: string;
  }> {
    const endpoint = `/account/${params.accountId}/transactions`;
    const payload = {
      recipientId: params.recipientId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      note: params.note || 'CFO-One Invoice Payment',
      idempotencyKey: params.idempotencyKey
    };

    const res = await this.request<any>(endpoint, {
      method: 'POST',
      headers: {
        'Idempotency-Key': params.idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    return {
      id: res.id || `mercury_${Date.now()}`,
      status: res.status || 'pending_approval',
      amount: res.amount || params.amount,
      recipientId: res.recipientId || params.recipientId,
      note: res.note || params.note,
      dashboardUrl: `https://app.mercury.com/transactions/${res.id || ''}`
    };
  }

  /**
   * Syncs live state directly from Mercury API into the MercuryState model used by the CFO Judgment Engine.
   * Calculates actual 30-day spending, builds recipient allowlist, and sets up active policy.
   */
  public async syncState(options: {
    accountId?: string;
    monthlyBudgetUsd?: number;
    maxSinglePaymentUsd?: number;
  } = {}): Promise<MercuryState> {
    const accounts = await this.getAccounts();
    if (!accounts.length) {
      throw new Error('No Mercury accounts returned for this organization.');
    }

    const primaryAccount = options.accountId
      ? accounts.find((a) => a.id === options.accountId) || accounts[0]
      : accounts.find((a) => a.type.toLowerCase().includes('checking')) || accounts[0];

    const rawRecipients = await this.getRecipients();
    const rawTransactions = await this.getTransactions(primaryAccount.id, 100);

    // Map recipients to CFO format
    const recipients: MercuryRecipient[] = rawRecipients.map((r) => {
      const routing = r.electronicRoutingInfo?.routingNumber || '000000000';
      const rawAcct = r.electronicRoutingInfo?.accountNumber || '';
      const last4 = rawAcct.length >= 4 ? rawAcct.slice(-4) : (rawAcct || '0000');
      let method: PaymentMethod = 'ach';
      const declaredMethod = (r.paymentMethod || r.defaultPaymentMethod || '').toLowerCase();
      if (declaredMethod.includes('wire')) method = 'domesticWire';
      else if (declaredMethod.includes('check')) method = 'check';

      return {
        id: r.id,
        name: r.name,
        routing_number: routing,
        account_number_last4: last4,
        preferred_payment_method: method,
        created_at: r.createdAt || new Date().toISOString()
      };
    });

    // Map transactions
    const transactions: MercuryTransaction[] = rawTransactions.map((tx) => {
      let status: 'sent' | 'pending' | 'failed' = 'sent';
      if (tx.status === 'pending') status = 'pending';
      else if (tx.status === 'failed' || tx.status === 'cancelled') status = 'failed';

      return {
        id: tx.id,
        recipient_id: tx.counterpartyId || 'unknown_recipient',
        recipient_name: tx.counterpartyName || 'Unknown Vendor',
        amount_usd: Math.abs(tx.amount),
        date: tx.postedAt || tx.createdAt || new Date().toISOString(),
        status,
        payment_method: 'ach'
      };
    });

    // Calculate 30-day budget spend
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
      sandbox: process.env.MERCURY_ENV !== 'production'
    };

    return {
      account_id: primaryAccount.id,
      balance_usd: primaryAccount.currentBalance ?? primaryAccount.availableBalance ?? 0,
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

