# Checklist

## 测试断言修复
- [x] `DiffCompare.test.tsx` 截断警告测试使用正确的预期文本
- [x] `npx vitest run` 中 DiffCompare 测试全部通过

## act() 警告
- [x] copy 按钮测试不再产生 React `act()` 警告

## 全部测试通过
- [x] `npx vitest run` 45 个测试全部通过
- [x] `bun test` (server) 10 个测试全部通过