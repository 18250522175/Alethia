import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/loader';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface RemainingBudget {
  daily: number;
  monthly: number;
}

export interface BudgetAlert {
  metric: string;
  threshold: number;
  actual: number;
  message: string;
  ts: string;
}

const ALERT_BUFFER_LIMIT = 100;

/**
 * 全局预算管理器（Task 6.2）
 *
 * 维护内存计数器（当日 / 当月），在非交互任务前检查预算。
 * 超出预算时触发熔断：写入日志、持久化告警（eval_anomaly_flags 复用为通用异常表）、
 * 暴露内存告警缓冲供仪表盘读取。日计数器在跨日首次访问时惰性重置（等效于 00:00 重置）。
 */
class BudgetManager {
  private dailyBudget: number;
  private monthlyBudget: number;
  private perQueryBudget: number;
  private dailyUsed: number = 0;
  private monthlyUsed: number = 0;
  private currentDay: string;
  private currentMonth: string;
  private tripped: boolean = false;
  private alerts: BudgetAlert[] = [];

  constructor() {
    const env = loadEnv();
    this.dailyBudget = env.DAILY_BUDGET;
    this.monthlyBudget = env.MONTHLY_BUDGET;
    this.perQueryBudget = env.PER_QUERY_BUDGET;
    const now = new Date();
    this.currentDay = this.formatDay(now);
    this.currentMonth = this.formatMonth(now);
  }

  async checkBudget(task: string): Promise<BudgetCheckResult> {
    this.maybeRollover();

    if (this.tripped) {
      return { allowed: false, reason: '预算熔断已触发，当日非交互任务暂停' };
    }
    if (this.dailyUsed >= this.dailyBudget) {
      await this.trip('budget.daily', this.dailyBudget, this.dailyUsed, task);
      return {
        allowed: false,
        reason: `日预算已达上限 (${this.dailyUsed.toFixed(4)}/${this.dailyBudget})`
      };
    }
    if (this.monthlyUsed >= this.monthlyBudget) {
      await this.trip('budget.monthly', this.monthlyBudget, this.monthlyUsed, task);
      return {
        allowed: false,
        reason: `月预算已达上限 (${this.monthlyUsed.toFixed(4)}/${this.monthlyBudget})`
      };
    }
    return { allowed: true };
  }

  recordUsage(tokens: number, cost: number, task: string): void {
    this.maybeRollover();
    // 使用数据库原子操作确保并发安全
    this.dailyUsed += cost;
    this.monthlyUsed += cost;
    logger.debug(
      { task, tokens, cost, dailyUsed: this.dailyUsed, monthlyUsed: this.monthlyUsed },
      '预算消耗记录'
    );
    // 异步持久化到数据库（不阻塞调用方）
    this.persistUsage(cost).catch((err) => {
      logger.error({ err }, '持久化预算使用记录失败');
    });
  }

  private async persistUsage(cost: number): Promise<void> {
    const pool = getPool();
    const today = this.formatDay(new Date());
    const month = this.formatMonth(new Date());
    try {
      await pool.query(
        `INSERT INTO budget_usage (key, cost, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET cost = budget_usage.cost + $2, updated_at = NOW()`,
        [`daily:${today}`, cost]
      );
      await pool.query(
        `INSERT INTO budget_usage (key, cost, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET cost = budget_usage.cost + $2, updated_at = NOW()`,
        [`monthly:${month}`, cost]
      );
    } catch (err) {
      logger.error({ err }, '持久化预算记录失败');
    }
  }

  getRemainingBudget(): RemainingBudget {
    this.maybeRollover();
    return {
      daily: Math.max(0, this.dailyBudget - this.dailyUsed),
      monthly: Math.max(0, this.monthlyBudget - this.monthlyUsed)
    };
  }

  setDailyBudget(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      logger.warn({ amount }, '无效的日预算值，已忽略');
      return;
    }
    this.dailyBudget = amount;
    if (this.tripped && this.dailyUsed < this.dailyBudget) {
      this.tripped = false;
      logger.info({ dailyBudget: amount }, '日预算已更新并解除熔断');
    } else {
      logger.info({ dailyBudget: amount }, '日预算已更新');
    }
  }

  setMonthlyBudget(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      logger.warn({ amount }, '无效的月预算值，已忽略');
      return;
    }
    this.monthlyBudget = amount;
    if (this.tripped && this.monthlyUsed < this.monthlyBudget) {
      this.tripped = false;
      logger.info({ monthlyBudget: amount }, '月预算已更新并解除熔断');
    } else {
      logger.info({ monthlyBudget: amount }, '月预算已更新');
    }
  }

  getPerQueryBudget(): number {
    return this.perQueryBudget;
  }

  isTripped(): boolean {
    return this.tripped;
  }

  getAlerts(): BudgetAlert[] {
    return [...this.alerts];
  }

  /** 仪表盘读取的快照 */
  getSnapshot(): {
    dailyBudget: number;
    monthlyBudget: number;
    perQueryBudget: number;
    dailyUsed: number;
    monthlyUsed: number;
    tripped: boolean;
    remaining: RemainingBudget;
    alerts: BudgetAlert[];
  } {
    this.maybeRollover();
    return {
      dailyBudget: this.dailyBudget,
      monthlyBudget: this.monthlyBudget,
      perQueryBudget: this.perQueryBudget,
      dailyUsed: this.dailyUsed,
      monthlyUsed: this.monthlyUsed,
      tripped: this.tripped,
      remaining: this.getRemainingBudget(),
      alerts: [...this.alerts]
    };
  }

  private maybeRollover(): void {
    const now = new Date();
    const day = this.formatDay(now);
    const month = this.formatMonth(now);
    if (day !== this.currentDay) {
      logger.info(
        { prevDay: this.currentDay, dailyUsed: this.dailyUsed },
        '日预算计数器已重置（跨日）'
      );
      this.dailyUsed = 0;
      this.currentDay = day;
      if (this.tripped && this.monthlyUsed < this.monthlyBudget) {
        this.tripped = false;
        logger.info('新的一天开始，日预算熔断已解除');
      }
    }
    if (month !== this.currentMonth) {
      logger.info(
        { prevMonth: this.currentMonth, monthlyUsed: this.monthlyUsed },
        '月预算计数器已重置（跨月）'
      );
      this.monthlyUsed = 0;
      this.currentMonth = month;
    }
  }

  private async trip(
    metric: string,
    threshold: number,
    actual: number,
    task: string
  ): Promise<void> {
    if (this.tripped) return;
    this.tripped = true;
    const message = `预算熔断: ${metric} 阈值 ${threshold}, 实际 ${actual.toFixed(4)}, 触发任务 ${task}`;
    logger.error({ metric, threshold, actual, task }, message);

    const alert: BudgetAlert = {
      metric,
      threshold,
      actual,
      message,
      ts: new Date().toISOString()
    };
    this.alerts.push(alert);
    if (this.alerts.length > ALERT_BUFFER_LIMIT) {
      this.alerts.shift();
    }

    await this.persistAlert(alert).catch((err) => {
      logger.warn({ err }, '持久化预算告警失败');
    });
  }

  private async persistAlert(alert: BudgetAlert): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO eval_anomaly_flags (id, metric, threshold, actual, ts, message)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [randomUUID(), alert.metric, alert.threshold, alert.actual, alert.message]
    );
  }

  private formatDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private formatMonth(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
}

export const budgetManager = new BudgetManager();
