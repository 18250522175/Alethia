# Tasks

- [x] Task 1: 修复 `DiffCompare.test.tsx` 截断警告测试断言
  - 将 `screen.getByText(/已使用简化对比模式/)` 改为 `screen.getByText(/diffCompare.truncatedWarning/)`
  - 原因：mock 的 `useTranslation` 返回 i18n 键而非翻译文本

- [x] Task 2: 修复 `DiffCompare.test.tsx` copy 按钮测试的 `act()` 警告
  - 在 `fireEvent.click` 后使用 `await waitFor()` 等待异步状态更新完成

- [x] Task 3: 验证所有测试通过
  - 运行 `npx vitest run` 确认 45 个测试全部通过
  - 结果：3 个测试文件，45 个测试全部通过，0 个失败

# Task Dependencies
- Task 3 依赖 Task 1 和 Task 2