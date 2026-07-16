#!/bin/sh
# Alethia 数据库初始化脚本
# 在容器内执行：运行迁移 + 种子数据
# 该脚本由 docker-compose 的 init 服务调用
#
# 注意：docker-compose 已配置 depends_on + service_healthy，
# postgres 标记 healthy 后本脚本才会启动，无需额外等待
#
# 已添加重试机制：应对数据库连接未完全就绪或网络波动

set -e

echo "================================================"
echo "  Alethia AI 知识库 v5.0 · 数据库初始化"
echo "================================================"
echo ""

echo "[1/3] PostgreSQL 已就绪（由 docker-compose healthcheck 保证）"
echo ""

# 运行打包后的迁移与种子脚本（Dockerfile 多阶段构建产物位于 dist/，bun build 保留源目录结构）
echo "[2/3] 执行数据库迁移..."

# 重试逻辑：最多 3 次，每次间隔 5 秒
MIGRATION_SUCCESS=false
for i in 1 2 3; do
  cd /app/server
  if bun dist/scripts/migrate.js; then
    MIGRATION_SUCCESS=true
    echo "  ✓ 迁移完成"
    break
  else
    echo "  ✗ 迁移失败（尝试 $i/3），5 秒后重试..."
    sleep 5
  fi
done

if [ "$MIGRATION_SUCCESS" = false ]; then
  echo "  ✗ 迁移失败：已重试 3 次仍失败，请检查数据库连接和迁移文件"
  exit 1
fi

echo ""

echo "[3/3] 写入种子数据..."

# 重试逻辑：最多 3 次，每次间隔 5 秒
SEED_SUCCESS=false
for i in 1 2 3; do
  cd /app/server
  if bun dist/scripts/seed.js; then
    SEED_SUCCESS=true
    echo "  ✓ 种子数据写入完成"
    break
  else
    echo "  ✗ 种子数据写入失败（尝试 $i/3），5 秒后重试..."
    sleep 5
  fi
done

if [ "$SEED_SUCCESS" = false ]; then
  echo "  ✗ 种子数据写入失败：已重试 3 次仍失败，请检查数据库连接"
  exit 1
fi

echo ""

echo "================================================"
echo "  ✓ 初始化完成！"
echo "  数据库已就绪，可以启动主服务。"
echo "================================================"