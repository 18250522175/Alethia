# Tasks

- [x] Task 1: 优化 `Dockerfile.server` — apt 源 + 重试 + 清理
  - 在 `RUN apt update` 前添加 `sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources` 切换为阿里云镜像
  - 将 `bun install` 包装为 `for i in 1 2 3; do ... done` 重试逻辑（构建阶段 + 生产阶段各 1 处）
  - 将 `bun run build` 包装为 `for i in 1 2; do ... done` 重试逻辑
  - 移除 `curl` 安装（docker-compose 健康检查已使用 `node -e`），仅保留 `adduser`
  - 更新 `SHARP_BINARY_HOST` 为 `https://npmmirror.com/mirrors/sharp-libvips/`

- [x] Task 2: 优化 `Dockerfile.web` — 重试 + 镜像源
  - 将 `bun install` 包装为重试逻辑（最多 3 次，间隔 5 秒）
  - 将 `bunx vite build` 包装为重试逻辑（最多 2 次，间隔 3 秒）
  - Nginx base image 保持 `nginx:alpine`，通过 `docker-compose.yml` 的构建变量切换镜像源

- [x] Task 3: 优化 `docker-compose.yml` — 镜像代理 + 健康检查
  - 添加 `${DOCKER_REGISTRY_MIRROR:-}` 变量支持，允许通过环境变量切换镜像源
  - 所有基础镜像（pgvector、postgres、nginx）使用 `${DOCKER_REGISTRY_MIRROR:-}` 前缀
  - 调整 server 健康检查 `start_period` 从 30s 改为 60s（首次启动需下载模型）
  - 为 postgres 健康检查添加 `start_interval: 2s`

- [x] Task 4: 优化 `init.sh` — 重试机制
  - 迁移步骤添加重试逻辑（最多 3 次，间隔 5 秒）
  - 种子数据步骤添加重试逻辑（最多 3 次，间隔 5 秒）

- [x] Task 5: 创建 `scripts/docker-pull.sh` 预拉取脚本
  - 并行拉取所有基础镜像：pgvector/pgvector:pg16、postgres:16-alpine、nginx:alpine、oven/bun:1.3.14
  - 支持 `DOCKER_REGISTRY_MIRROR` 环境变量

- [x] Task 6: 更新 `.env` 文件添加 Docker 变量
  - 添加 `DOCKER_REGISTRY_MIRROR` 注释说明（默认留空，国内用户可设为 `registry.cn-hangzhou.aliyuncs.com`）
  - 同时添加 `POSTGRES_PASSWORD`、`POSTGRES_USER`、`POSTGRES_DB` 变量

# Task Dependencies
- Task 1-2 可并行执行
- Task 3-6 可并行执行
- Task 5 依赖 Task 3 中的镜像变量约定