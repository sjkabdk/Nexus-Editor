# Nexus-Editor 编码标准

## 概述

本文档概述了 Nexus-Editor 项目的编码标准和质量规范。遵循这些标准可确保整个代码库的一致性、可维护性和高质量的代码。

## 代码质量工具

### ESLint

我们使用 ESLint 进行静态代码分析。配置强制执行：

- TypeScript 最佳实践
- 一致的导入顺序
- 无未使用变量（除了以 `_` 前缀的变量）
- 限制 `console` 使用（只允许 `warn`、`error`、`info`）
- 禁止显式 `any` 类型（使用 `unknown` 或适当的类型）
- 一致的类型导入

**命令：**
```bash
# 检查代码质量问题
pnpm run lint

# 自动修复代码质量问题
pnpm run lint:fix

# 运行在特定文件上
pnpm run lint -- path/to/file.ts
