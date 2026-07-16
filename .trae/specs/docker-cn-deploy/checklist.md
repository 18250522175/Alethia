# Checklist

## Dockerfile.server
- [x] apt 源已切换为阿里云镜像 `mirrors.aliyun.com`
- [x] `bun install` 包含重试逻辑（最多 3 次，构建阶段 + 生产阶段各 1 处）
- [x] `bun run build` 包含重试逻辑（最多 2 次）
- [x] 已移除 `curl` 安装（仅注释提及），仅保留 `adduser`
- [x] `SHARP_BINARY_HOST` 更新为 `https://npmmirror.com/mirrors/sharp-libvips/`

## Dockerfile.web
- [x] `bun install` 包含重试逻辑（最多 3 次）
- [x] `bunx vite build` 包含重试逻辑（最多 2 次）

## docker-compose.yml
- [x] 所有基础镜像支持 `${DOCKER_REGISTRY_MIRROR:-}` 前缀
- [x] server 健康检查 `start_period` 调整为 60s
- [x] postgres 健康检查添加 `start_interval: 2s`

## init.sh
- [x] 迁移步骤包含重试逻辑（最多 3 次，间隔 5 秒）
- [x] 种子数据步骤包含重试逻辑（最多 3 次，间隔 5 秒）

## 预拉取脚本
- [x] `scripts/docker-pull.sh` 存在且可执行
- [x] 脚本支持 `DOCKER_REGISTRY_MIRROR` 环境变量

## 环境变量
- [x] `.env` 包含 `DOCKER_REGISTRY_MIRROR` 说明注释
- [x] `.env` 包含 `POSTGRES_PASSWORD`、`POSTGRES_USER`、`POSTGRES_DB` 变量