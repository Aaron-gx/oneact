# @oneact/orchestrator — v3 协作回路 + 会话控制架构

> v3 在 v2 基础上修复了 3 个架构缺陷，并新增会话控制器。

## v2 → v3 改进

| 维度 | v2 | v3 |
|------|----|----|
| **校验归属** | Inspector 校验 + Conductor 重复 validateDeck | Inspector 独占，返回 InspectionReport |
| **错误传递** | Healer 收裸字符串，盲猜修哪 | ErrorLocation 结构化定位 |
| **大纲归属** | Conductor 自己调 generateOutline | Director 全权产出 {brief, outline} |
| **可控性** | 只读 onEvent | Session 控制器：cancel/pause/resume |

## v3 四项改进详解

### 1. Inspector 独占校验

v2 问题：Inspector 内部跑 validateDeck，Conductor 的 G2 门禁又跑一遍——浪费。

v3 方案：Inspector 返回完整 `InspectionReport`：
```typescript
interface InspectionReport {
  validation: ValidationResult;  // 校验结果
  guard: GuardResult;             // 安全扫描
  errors: ErrorLocation[];        // 结构化错误定位
  score: number;                  // 综合评分
  passed: boolean;                // 是否通过门禁
}
```
Conductor 直接用 `report.passed` 判断，不再调 validateDeck。

### 2. ErrorLocation 结构化错误定位

v2 问题：Healer 拿到笼统的错误文本，不知道该修哪个元素的什么问题。

v3 方案：
```typescript
interface ErrorLocation {
  pageId: string;       // 哪页
  elementId?: string;   // 哪个元素
  rule: string;         // 哪条校验规则
  message: string;      // 错误说明
  suggestion: string;   // 修复建议
}
```
Inspector 将 Issue 转换为 ErrorLocation（带预设建议表），Healer 按定位精准修。

### 3. Director 全权负责 Brief + Outline

v2 问题：大纲在 Conductor 里生成，职责散落。

v3 方案：Director 在生成模式产出 `{ brief, outline }` 联合产物。Generator 只管"大纲 → 逐页"，不管大纲从哪来。

### 4. Session 会话控制器

v2 问题：事件只读，无法取消/暂停。

v3 方案：
```typescript
class Session {
  cancel(reason?: string): void;   // 取消
  pause(): void;                    // 暂停
  resume(): void;                   // 恢复
  get isCancelled(): boolean;       // 状态查询
  readonly cancelToken: CancelToken; // 注入 AgentContext
}
```
Conductor 在每个阶段入口检查 `checkCancel(session)`，支持随时打断。

## 文件结构

```
packages/orchestrator/src/
├── orchestrator.ts     # Conductor — generate() + edit() + Session 集成
├── types.ts            # 所有类型（含 v3 新增：ErrorLocation, InspectionReport, Session, CancelToken）
├── gates.ts            # G1/G2/G3 门禁
├── event-bus.ts        # 事件总线
├── index.ts            # 公共 API
└── agents/
    ├── director.ts     # v3：产出 {brief, outline}
    ├── generator.ts    # 内容生成
    ├── inspector.ts    # v3：返回 InspectionReport + ErrorLocation[]
    └── healer.ts       # v3：接收 ErrorLocation[] 精准修复
```

## 测试覆盖（41 个）

- generate 模式（4 个）
- edit 模式（3 个）
- v3 InspectionReport（3 个）
- v3 Session 会话控制（6 个）
- Agent 单元测试（8 个）
- 门禁测试（13 个）
- 事件总线测试（7 个）
