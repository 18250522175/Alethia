#!/bin/sh
# Alethia 数据库初始化脚本
# 在容器内执行：运行迁移 + 种子数据
# 该脚本由 docker-compose 的 init 服务调用
#
# 注意：docker-compose 已配置 depends_on + service_healthy，
# postgres 标记 healthy 后本脚本才会启动，无需额外等待

set -e

echo "================================================"
echo "  Alethia AI 知识库 v5.0 · 数据库初始化"
echo "================================================"
echo ""

echo "[1/3] PostgreSQL 已就绪（由 docker-compose healthcheck 保证）"
echo ""

# 运行打包后的迁移与种子脚本（Dockerfile 多阶段构建产物位于 dist/，bun build 保留源目录结构）
echo "[2/3] 执行数据库迁移..."
cd /app/server
bun dist/scripts/migrate.js
echo "  ✓ 迁移完成"
echo ""

echo "[3/3] 写入种子数据..."
bun dist/scripts/seed.js
echo "  ✓ 种子数据写入完成"
echo ""

echo "================================================"
echo "  ✓ 初始化完成！"
echo "  数据库已就绪，可以启动主服务。"
echo "================================================"
