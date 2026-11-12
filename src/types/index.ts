export type PaymentMethod = 'ach' | 'check' | 'domesticWire' | 'internationalWire';

export interface BankDetails {
  routing_number: string;
  account_number_last4: string;
}

export interface RawInvoice {
  id: string;
  filename: string;
  content_text: string;
  metadata?: {
    received_at: string;
    sender_email?: string;
    is_held_out?: boolean;
    expected_action?: 'ALLOW' | 'ASK_OWNER' | 'REFUSE';
    expected_layer?: 1 | 2; // 1 = Engine, 2 = Enclave
  };
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
}

export interface ExtractedInvoice {
  invoice_id: string;
  invoice_number: string;
  vendor_name: string;
  amount_usd: number;
  due_date: string;
  invoice_date: string;
  line_items: LineItem[];
  bank_details?: BankDetails;
  memo?: string;
  detected_instruction_text?: string;
  confidence: number;
}

export interface MercuryRecipient {
  id: string;
  name: string;
  routing_number: string;
  account_number_last4: string;
  preferred_payment_method: PaymentMethod;
  created_at: string;
}

export interface MercuryTransaction {
  id: string;
  recipient_id: string;
  recipient_name: string;
  amount_usd: number;
  date: string;
  status: 'sent' | 'pending' | 'failed';
  payment_method: PaymentMethod;
}

export interface MercuryPolicyRule {
  when: {
    op: 'pay_invoice' | 'add_recipient' | 'send_invoice' | 'cancel_invoice';
    min_usd?: number;
    max_usd?: number;
    methods?: PaymentMethod[];
    payee?: 'saved' | 'new';
  };
  then: 'allow' | 'ask' | 'refuse';
}

export interface MercuryPolicy {
  max_payment_usd: number;
  monthly_limit_usd: number;
  payment_methods: PaymentMethod[];
  allowed_recipients: string[];
  rules: MercuryPolicyRule[];
  sandbox?: boolean;
}

export interface MercuryBudget {
  monthly_limit_usd: number;
  spent_or_pending_usd: number;
  remaining_usd: number;
}

export interface MercuryState {
  account_id: string;
  balance_usd: number;
  budget: MercuryBudget;
  recipients: MercuryRecipient[];
  recent_transactions: MercuryTransaction[];
  policy: MercuryPolicy;
}

// Treasury Aliases (supporting Airwallex, Mercury, and multi-rail banking)
export type TreasuryRecipient = MercuryRecipient;
export type TreasuryTransaction = MercuryTransaction;
export type TreasuryPolicyRule = MercuryPolicyRule;
export type TreasuryPolicy = MercuryPolicy;
export type TreasuryBudget = MercuryBudget;
export type TreasuryState = MercuryState;

export type VerdictAction = 'ALLOW' | 'ASK_OWNER' | 'REFUSE';

export type ThreatCategory =
  | 'DUPLICATE_INVOICE'
  | 'AMOUNT_ANOMALY'
  | 'THIN_VENDOR_HISTORY'
  | 'BANK_DETAILS_MISMATCH'
  | 'VELOCITY_LIMIT_EXCEEDED'
  | 'BUDGET_EXHAUSTION'
  | 'BUDGET_DRAIN'
  | 'PROMPT_INJECTION'
  | 'UNRECOGNIZED_VENDOR';

export interface ThreatSignal {
  category: ThreatCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: Record<string, any>;
}

export interface CFOVerdict {
  invoice_id: string;
  invoice_number: string;
  vendor_name: string;
  amount_usd: number;
  action: VerdictAction;
  primary_reason: string;
  decided_at_layer: 1 | 2; // 1 = Judgment Engine, 2 = OutLayer Enclave
  signals: ThreatSignal[];
  context: {
    matched_recipient_id: string | null;
    historical_count: number;
    historical_median_usd: number | null;
    ratio_to_median: number | null;
    budget_impact_percent: number;
  };
  outlayer_payload?: {
    operation: 'pay_invoice';
    amount_usd: number;
    recipient_id: string;
    payment_method: PaymentMethod;
    external_memo: string;
    idempotency_key: string;
  };
}

export interface OutLayerExecutionResult {
  call_id: string;
  status: 'completed' | 'failed';
  time_ms: number;
  compute_cost: number;
  attestation_url?: string;
  output: {
    success: boolean;
    operation: string;
    status?: 'awaiting_owner';
    task_id?: string;
    task_hash?: string;
    link?: string;
    transaction_id?: string;
    request_id?: string;
    error?: string;
    policy_denied_rule?: string;
    output?: any;
    logs?: string[];
  };
}
