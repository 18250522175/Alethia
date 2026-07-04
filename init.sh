#!/bin/sh
# Alethia 数据库初始化脚本
# 在容器内执行：运行迁移 + 种子数据
# 该脚本由 docker-compose 的 init 服务调用

set -e

echo "================================================"
echo "  Alethia AI 知识库 v5.0 · 数据库初始化"
echo "================================================"
echo ""
echo "[1/3] 等待 PostgreSQL 就绪..."
until pg_isready -h postgres -U alethia -d alethia 2>/dev/null; do
  echo "  PostgreSQL 未就绪，5 秒后重试..."
  sleep 5
done
echo "  ✓ PostgreSQL 已就绪"
echo ""

echo "[2/3] 执行数据库迁移..."
cd /app/server
bun run scripts/migrate.ts
echo "  ✓ 迁移完成"
echo ""

echo "[3/3] 写入种子数据..."
bun run scripts/seed.ts
echo "  ✓ 种子数据写入完成"
echo ""

echo "================================================"
echo "  ✓ 初始化完成！"
echo "  数据库已就绪，可以启动主服务。"
echo "================================================"
