#!/bin/bash
# Alethia Docker 预拉取镜像脚本
# 在 docker compose up 前运行，预拉取所有基础镜像（避免 compose 启动时逐个等待）
#
# 国内网络加速：
#   export DOCKER_REGISTRY_MIRROR=registry.cn-hangzhou.aliyuncs.com
#   bash scripts/docker-pull.sh
#
# 或在 .env 中设置 DOCKER_REGISTRY_MIRROR 后运行：
#   source .env && bash scripts/docker-pull.sh

set -e

MIRROR="${DOCKER_REGISTRY_MIRROR:-}"

# 镜像列表（与 docker-compose.yml 保持一致）
IMAGES=(
  "${MIRROR}pgvector/pgvector:pg16"
  "${MIRROR}postgres:16-alpine"
  "${MIRROR}nginx:alpine"
  "${MIRROR}oven/bun:1.3.14"
)

echo "================================================"
echo "  Alethia Docker 镜像预拉取"
if [ -n "$MIRROR" ]; then
  echo "  镜像源: ${MIRROR}"
else
  echo "  镜像源: Docker Hub（建议设置 DOCKER_REGISTRY_MIRROR 使用国内镜像）"
fi
echo "  共 ${#IMAGES[@]} 个镜像"
echo "================================================"
echo ""

# 并行拉取所有镜像
PIDS=()
for img in "${IMAGES[@]}"; do
  echo "  拉取: $img"
  docker pull "$img" &
  PIDS+=($!)
done

# 等待所有拉取完成
FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "  ✓ 所有镜像拉取完成"
else
  echo "  ✗ $FAILED 个镜像拉取失败，请检查网络或镜像源配置"
  exit 1
fi