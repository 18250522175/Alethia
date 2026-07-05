// Alethia ESLint 扁平配置（flat config）
// 基于 @antfu/eslint-config，统一 TypeScript + React 代码风格
import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: false,
  react: true,
  stylistic: true,
  // 全局忽略目录与文件
  ignores: [
    'dist/**',
    '**/dist/**',
    'node_modules/**',
    '**/node_modules/**',
    'wiki/**',
    '*.md',
    '**/*.md',
  ],
})
