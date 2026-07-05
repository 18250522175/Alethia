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
    // Drizzle 生成产物
    'server/drizzle/**',
    // 既有 SQL migration 不纳入 lint
    'server/src/db/migrations/**',
  ],
}, {
  // ===== 规则覆盖：对既有代码库中需要深度重构的规则降级为 warning =====
  // 这些规则在理论上正确，但一次性修复成本高、风险大；
  // 标记为 warning 后，pre-commit 不会阻断提交，但会在 lint 输出中持续可见，
  // 便于团队按文件逐步消化。
  rules: {
    // 按钮缺少 type 属性：96 处，需逐个确认是 submit 还是 button
    'react-dom/no-missing-button-type': 'warn',
    // 使用 node:process / node:buffer 全局替代 import：65 处，涉及 Bun 运行时兼容性
    'node/prefer-global/process': 'warn',
    'node/prefer-global/buffer': 'warn',
    // 使用数组索引作为 key：21 处，需确认列表项是否稳定
    'react/no-array-index-key': 'warn',
    // 正则表达式回溯风险：20 处，需逐个重写正则
    'regexp/no-super-linear-backtracking': 'warn',
    'regexp/no-unused-capturing-group': 'warn',
    'regexp/no-misleading-capturing-group': 'warn',
    // 三元表达式多行格式：16 处，纯风格
    'style/multiline-ternary': 'warn',
    // React refresh 导出约束：5 处，需拆分文件
    'react-refresh/only-export-components': 'warn',
    // Context value 不稳定：4 处，需 useMemo 包裹
    'react/no-unstable-context-value': 'warn',
    // react-hooks 依赖：3 处，需逐个审视
    'react-hooks/exhaustive-deps': 'warn',
    // 危险的 dangerouslySetInnerHTML：2 处，需确认 sanitization
    'react-dom/no-dangerously-set-innerhtml': 'warn',
    // 允许带括号的赋值作为条件（标准正则循环 `while ((m = re.exec()) !== null)`）
    'no-cond-assign': ['error', 'except-parens'],
  },
})
