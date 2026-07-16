# Docker 部署调试 Spec（国内网络优化）

## Why
现有 Docker 部署配置未针对中国大陆网络环境做优化：Docker Hub 拉取镜像缓慢/失败、apt 源未切换国内镜像、npm/bun 依赖安装无重试机制、Sharp 二进制下载可能超时、init 脚本无重试。需全面适配国内网络环境，确保一键部署可成功。

## What Changes
- **Dockerfile.server**: 切换 apt 源为阿里云镜像，添加 `bun install` 重试机制，移除无用的 `curl` 安装，增加 `bun build` 重试
- **Dockerfile.web**: 添加 `bun install` 和 `vite build` 重试机制，Nginx 镜像使用阿里云代理
- **docker-compose.yml**: 所有镜像添加国内代理前缀（或提供 `DOCKER_MIRROR` 构建变量），增加服务启动重试/backoff，调整健康检查参数
- **init.sh**: 添加迁移和种子数据重试机制
- **新增 `.env.docker`**（或扩展现有 `.env`）: 添加 `DOCKER_REGISTRY_MIRROR` 变量，方便切换镜像源
- **新增 `scripts/docker-pull.sh`**: 预拉取镜像脚本，避免 compose 启动时等待

## Impact
- Affected specs: runtime-startup-debug（Docker 启动流程）
- Affected code: `Dockerfile.server`, `Dockerfile.web`, `docker-compose.yml`, `init.sh`, `.env`

## ADDED Requirements

### Requirement: apt 国内镜像源
`Dockerfile.server` 的 `apt update` 前 SHALL 替换 `/etc/apt/sources.list` 为阿里云镜像源（`mirrors.aliyun.com`），解决 Debian 官方源在国内访问缓慢的问题。

#### Scenario: 国内服务器构建镜像
- **WHEN** 执行 `docker build -f Dockerfile.server`
- **THEN** `apt update` 应在 30 秒内完成，不再因官方源超时而失败

### Requirement: bun install 重试机制
Dockerfile 中的 `bun install` 命令 SHALL 包含重试逻辑（最多 3 次，每次间隔 5 秒），应对国内网络不稳定导致的偶发失败。

#### Scenario: 网络波动导致首次安装失败
- **WHEN** `bun install` 因网络超时失败
- **THEN** 自动重试最多 3 次，每次间隔 5 秒

### Requirement: bun build 重试
Dockerfile.server 的 `bun run build` 和 Dockerfile.web 的 `bunx vite build` SHALL 包含重试逻辑。

#### Scenario: 构建阶段偶发失败
- **WHEN** 构建命令因 OOM 或临时文件锁失败
- **THEN** 自动重试最多 2 次

### Requirement: Docker 镜像国内代理
`docker-compose.yml` 中所有 Docker Hub 基础镜像 SHALL 支持通过 `DOCKER_REGISTRY_MIRROR` 环境变量切换国内镜像源，默认使用阿里云容器镜像服务代理。

#### Scenario: 国内拉取 pgvector/pgvector 镜像
- **WHEN** 设置 `DOCKER_REGISTRY_MIRROR=registry.cn-hangzhou.aliyuncs.com` 后执行 `docker compose pull`
- **THEN** 镜像通过阿里云代理拉取，速度显著提升

### Requirement: init.sh 重试机制
`init.sh` 中的迁移和种子数据执行 SHALL 包含重试逻辑（最多 3 次），应对数据库连接未完全就绪的情况。

#### Scenario: 数据库刚启动，连接未完全就绪
- **WHEN** 迁移脚本首次执行失败
- **THEN** 等待 5 秒后重试，最多 3 次

### Requirement: 预拉取镜像脚本
新增 `scripts/docker-pull.sh`，在 `docker compose up` 前预拉取所有基础镜像，避免 compose 启动时逐个等待。

#### Scenario: 首次部署
- **WHEN** 执行 `bash scripts/docker-pull.sh`
- **THEN** 所有基础镜像并行拉取完成

## MODIFIED Requirements

### Requirement: Dockerfile.server 健康检查依赖
**原**: 安装 `curl` 和 `adduser` 工具用于健康检查  
**改**: 移除 `curl` 安装（docker-compose 健康检查已使用 `node -e` 方式），仅保留 `adduser`

### Requirement: Sharp 二进制镜像源
**原**: `SHARP_BINARY_HOST=https://registry.npmmirror.com/-/binary/sharp-libvips/`  
**改**: 改用 `SHARP_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips/`，兼容性更好