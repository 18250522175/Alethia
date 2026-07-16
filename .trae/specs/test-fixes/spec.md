# 测试修复 Spec

## Why
现有 45 个测试中 1 个失败（`DiffCompare.test.tsx`），原因是 i18n mock 未正确处理 `t()` 函数返回的翻译键，导致测试期望与实际渲染不匹配。

## What Changes
- 修复 `web/src/components/DiffCompare.test.tsx` 中 `shows truncation warning` 测试的断言，使其匹配 mock 返回的 i18n 键
- 修复 `web/src/components/DiffCompare.test.tsx` 中 `copy button` 测试的 `act()` 警告

## Impact
- Affected code: `web/src/components/DiffCompare.test.tsx`

## MODIFIED Requirements

### Requirement: 截断警告测试断言
**原**: 测试期望 `screen.getByText(/已使用简化对比模式/)`  
**改**: 测试期望 `screen.getByText(/diffCompare.truncatedWarning/)`，与 mock 返回的 i18n 键一致

### Requirement: copy 按钮测试 act 警告
**原**: `copy button calls clipboard.writeText with newValue` 测试中复制操作后产生 React `act()` 警告  
**改**: 使用 `waitFor` 或 `act` 包裹异步状态更新