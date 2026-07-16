export const errorMessages: Record<string, string> = {
  UNAUTHORIZED: '未授权：缺失或无效的 API 密钥',
  VALIDATION_ERROR: '请求参数校验失败',
  NOT_FOUND: '请求的资源不存在',
  BUDGET_EXCEEDED: '预算已超出限制',
  LLM_UNAVAILABLE: '未配置可用的大模型适配器，请在设置页→集成中填入至少一个厂商 API Key',
  SERVICE_UNAVAILABLE: '服务暂不可用，请稍后重试',
  INTERNAL_ERROR: '服务器内部错误',
  DATABASE_CONNECTION_FAILED: '无法连接到 PostgreSQL，请检查 DATABASE_URL 与容器健康状态',
  MIGRATION_FAILED: '数据库迁移执行失败',
  INVALID_API_KEY: 'API 密钥无效',
  FILE_NOT_FOUND: '文件不存在',
  INVALID_FILE_TYPE: '不支持的文件类型',
  EXTRACT_FAILED: '内容提取失败',
  EMBEDDING_FAILED: '向量嵌入生成失败',
  RATE_LIMITED: '请求过于频繁，请稍后再试',
  CONTEXT_TOO_LONG: '上下文长度超出模型限制'
};

export function getErrorMessage(code: string): string {
  return errorMessages[code] || errorMessages.INTERNAL_ERROR;
}
