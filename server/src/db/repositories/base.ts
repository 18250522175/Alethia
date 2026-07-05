/**
 * Repository 基类 · 提供共享的数据库访问入口与日志能力
 *
 * 子类继承后只需声明操作的表，即可获得类型安全的 CRUD 能力。
 * 设计上保持轻量：不引入事务模板、不强制软删除，避免过度抽象。
 */

import type { Database } from '../client';
import logger from '../../i18n/logger';
import { getDb } from '../client';

export abstract class BaseRepository {
  protected readonly db: Database;

  constructor() {
    this.db = getDb();
  }

  /** 统一的错误处理：记录日志后重新抛出，由 Service 层决定如何降级。 */
  protected handleError(operation: string, err: unknown): never {
    logger.error({ err, operation }, '数据库操作失败');
    throw err;
  }
}
