/**
 * BudgetService · 预算管理服务
 *
 * 职责：设置日预算、查询剩余预算、获取预算告警。
 * 实际预算状态由 budgetManager 单例维护，本服务仅作为门面暴露。
 *
 * 对应原 BrainAPI.setDailyBudget / getRemainingBudget / getBudgetAlerts。
 */

import { budgetManager } from '../../evolution/budget';
import logger from '../../i18n/logger';

export class BudgetService {
  /** 设置新的日预算上限。 */
  async setDailyBudget(amount: number): Promise<{ success: boolean; dailyBudget: number }> {
    try {
      budgetManager.setDailyBudget(amount);
      const snapshot = budgetManager.getSnapshot();
      return { success: true, dailyBudget: snapshot.dailyBudget };
    } catch (err) {
      logger.error({ err }, '设置日预算失败');
      return { success: false, dailyBudget: 0 };
    }
  }

  /** 返回当前剩余的日 / 月预算及是否触发熔断。 */
  async getRemainingBudget(): Promise<{
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
    tripped: boolean;
  }> {
    const snapshot = budgetManager.getSnapshot();
    return {
      daily: snapshot.remaining.daily,
      monthly: snapshot.remaining.monthly,
      dailyLimit: snapshot.dailyBudget,
      monthlyLimit: snapshot.monthlyBudget,
      tripped: snapshot.tripped
    };
  }

  /** 返回当前所有预算告警。 */
  async getBudgetAlerts(): Promise<{ items: any[]; total: number }> {
    const alerts = budgetManager.getAlerts();
    return { items: alerts, total: alerts.length };
  }
}
