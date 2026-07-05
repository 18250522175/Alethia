#!/bin/sh
# Alethia 数据库初始化脚本
# 在容器内执行：运行迁移 + 种子数据
# 该脚本由 docker-compose 的 init 服务调用

set -e

echo "================================================"
echo "  Alethia AI 知识库 v5.0 · 数据库初始化"
echo "================================================"
echo ""

# 等待 PostgreSQL 就绪，最多重试 60 次 × 5s = 5 分钟，避免无限挂起阻塞 server 启动链
echo "[1/3] 等待 PostgreSQL 就绪..."
MAX_RETRIES=60
RETRY=0
until pg_isready -h postgres -U "${POSTGRES_USER:-alethia}" -d "${POSTGRES_DB:-alethia}" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "  ✗ PostgreSQL 在 $MAX_RETRIES 次重试后仍未就绪，放弃" >&2
    exit 1
  fi
  echo "  PostgreSQL 未就绪，5 秒后重试 ($RETRY/$MAX_RETRIES)..."
  sleep 5
done
echo "  ✓ PostgreSQL 已就绪"
echo ""

# 运行打包后的迁移与种子脚本（Dockerfile 多阶段构建产物位于 dist/，bun build 保留源目录结构）
echo "[2/3] 执行数据库迁移..."
cd /app/server
bun run dist/scripts/migrate.js
echo "  ✓ 迁移完成"
echo ""

echo "[3/3] 写入种子数据..."
bun run dist/scripts/seed.js
echo "  ✓ 种子数据写入完成"
echo ""

echo "================================================"
echo "  ✓ 初始化完成！"
echo "  数据库已就绪，可以启动主服务。"
echo "================================================"
