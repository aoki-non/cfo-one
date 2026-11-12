import { ConstraintsManager } from '../config/constraints.js';

export interface DailyInferenceRecord {
  date: string;
  total_spend_usd: number;
  request_count: number;
  limit_usd: number;
  remaining_usd: number;
}

export class InferenceBudgetMeter {
  private static dailyRecords: Map<string, { totalSpend: number; count: number }> = new Map();

  private static getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public static getStatus(): DailyInferenceRecord {
    const today = this.getTodayKey();
    const constraints = ConstraintsManager.getConstraints();
    const limit = constraints.commercial_rules.max_inference_daily_usd;
    const current = this.dailyRecords.get(today) || { totalSpend: 0, count: 0 };
    const remaining = Math.max(0, Math.round((limit - current.totalSpend) * 100) / 100);

    return {
      date: today,
      total_spend_usd: Math.round(current.totalSpend * 100) / 100,
      request_count: current.count,
      limit_usd: limit,
      remaining_usd: remaining
    };
  }

  public static canSpend(costUsd: number): { allowed: boolean; reason?: string } {
    if (ConstraintsManager.isKillSwitchActive()) {
      return { allowed: false, reason: 'Emergency kill switch active. All AI compute spend blocked.' };
    }

    const status = this.getStatus();
    if (status.total_spend_usd + costUsd > status.limit_usd) {
      return {
        allowed: false,
        reason: `Exceeds daily inference spending limit ($${status.limit_usd.toFixed(2)}/day). Current spend: $${status.total_spend_usd.toFixed(2)}.`
      };
    }

    return { allowed: true };
  }

  public static recordSpend(costUsd: number, model: string = 'near-ai/llama-3.1-70b'): DailyInferenceRecord {
    const today = this.getTodayKey();
    const current = this.dailyRecords.get(today) || { totalSpend: 0, count: 0 };
    current.totalSpend += costUsd;
    current.count += 1;
    this.dailyRecords.set(today, current);

    console.log(`[InferenceBudget] Agent procured $${costUsd.toFixed(4)} of inference (${model}). Daily spend: $${current.totalSpend.toFixed(2)}/${ConstraintsManager.getConstraints().commercial_rules.max_inference_daily_usd.toFixed(2)}.`);
    return this.getStatus();
  }
}
