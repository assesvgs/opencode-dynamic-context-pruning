# DCP — OpenCode 上下文裁剪插件

自动管理 OpenCode 对话上下文，通过**压缩**、**去重**、**错误清理**来降低 token 消耗。

---

## 安装

### 从 GitHub Actions 构建产物安装（推荐）

1. 进入仓库 Actions 页面，选择最新成功的 **Build** workflow
2. 下载 Artifact（文件名格式 `dcp-{提交哈希前8位}`）
3. 解压到任意目录
4. 安装到 OpenCode：

```bash
# 项目级安装
cd /path/to/your/project
opencode plugin /path/to/dcp-xxxxxx --force

# 全局安装（所有项目可用）
opencode plugin /path/to/dcp-xxxxxx --global
```

### 从本地项目目录安装（Termux / ARM64）

`npm run build` 中的 `tsup` 在 Termux 上可能因 shebang 路径问题无法直接执行。

```bash
git clone https://github.com/assesvgs/opencode-dynamic-context-pruning
cd opencode-dynamic-context-pruning
npm install

# 方案 A：使用 esbuild 构建
node build-local.mjs

# 方案 B：直接调用 tsup CLI
node node_modules/tsup/dist/cli-default.js
```

标准 Linux/macOS 环境可直接使用 `npm run build`。

### 从 npm 安装（原版）

```bash
opencode plugin @tarquinen/opencode-dcp --global
```

---

## 架构

### 插件钩子系统

DCP 通过 OpenCode 的插件 API 挂载了 4 个核心钩子，按执行顺序排列：

```
用户发送消息
       │
       ▼
┌──────────────────────────────────────┐
│ command.execute.before               │ ← 斜杠命令路由
│                                      │
│   信息型命令（help/context/stats）     │ → 显示信息 + throw sentinel
│   功能型命令（sweep/decompress 等）    │ → 执行操作 + throw sentinel
│   触发型命令（compress/purge）        │ → 设置 pendingManualTrigger + return
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ experimental.chat.system.transform    │ ← 注入 DCP 系统指令
│                                      │
│   手动模式时添加手动触发说明           │
│   权限 deny 时跳过                    │
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ experimental.chat.messages.transform  │ ← 消息变换（核心管道）
│                                      │
│   checkSession()        ─ 会话检测    │
│   stripHallucinations() ─ 清理幻觉    │
│   assignMessageRefs()   ─ 分配 ID    │
│   syncCompressionBlocks()─ 同步块     │
│   prune()               ─ 裁剪消息    │
│   injectCompressNudges()─ 注入提醒    │
│   injectMessageIds()    ─ 注入 ID    │
│   applyPendingManualTrigger()─替换为   │
│     prompt（compress/purge 命令路径）  │
└──────────────────────────────────────┘
       │
       ▼
       发送给 LLM
```

### 命令分类

| 类别       | 命令                                | 行为                                  | LLM 是否收到 |
| ---------- | ----------------------------------- | ------------------------------------- | ------------ |
| **纯信息** | `help`, `context`, `stats`          | 显示信息后 throw sentinel，LLM 不处理 | ✗            |
| **开关**   | `manual`                            | 切换模式后 throw sentinel             | ✗            |
| **功能**   | `sweep`, `decompress`, `recompress` | 执行操作后 throw sentinel             | ✗            |
| **触发**   | `compress`, `purge`                 | 替换用户消息为 AI prompt → `return`   | ✓（替换后）  |

**sentinel 机制**：插件处理完命令后抛出 `Error("__DCP_COMMAND_HANDLED__")`，OpenCode 框架捕获此异常并终止后续处理，LLM 不会收到响应请求。compress/purge 不抛 sentinel，它们的用户消息已被替换为 prompt，需要 LLM 继续处理（调用 compress/purge 工具）。

### 手动模式流程

```
/dcp-compress 强力压缩
       │
       ▼
command.execute.before
       │
       ├─ state.pendingManualTrigger = { prompt }   ← 包含用户焦点
       ├─ output.parts = [{ text: "/dcp-compress" }]
       └─ return (不 throw)
       │
       ▼
messages.transform → applyPendingManualTrigger()
       │
       ├─ 找到用户消息 → 替换文本为 prompt          ← 主路径
       │    或
       ├─ 找不到用户消息 → 创建合成用户消息           ← fallback
       │
       ▼
LLM 收到 prompt → 调用 compress 工具
```

### 压缩管道

```
prepareSession()
  ├─ manual mode 检查
  ├─ 获取对话消息
  ├─ 去重（deduplication strategy）
  └─ 错误清理（purgeErrors strategy）

resolveRanges()
  └─ 解析 startId/endId → 确认边界

对每个范围:
  ├─ parseBlockPlaceholders() — 展开 (bN) 占位符
  ├─ appendProtectedUserMessages() — 保留用户消息
  ├─ appendProtectedPromptInfo() — 保留 <protect> 标签
  └─ appendProtectedTools() — 追加保护工具输出

applyCompressionState()
  └─ 注册压缩块 → 更新状态

finalizeSession()
  └─ 持久化状态 + 发送通知
```

---

## 配置

配置文件 `dcp.jsonc`，按优先级覆盖：

| 层级   | 路径                             |
| ------ | -------------------------------- |
| 项目   | `.opencode/dcp.jsonc`            |
| 自定义 | `$OPENCODE_CONFIG_DIR/dcp.jsonc` |
| 全局   | `~/.config/opencode/dcp.jsonc`   |

### 完整配置字段

```jsonc
{
    // ============================================================
    // 基础设置
    // ============================================================

    // 启用或禁用 DCP 插件
    "enabled": true,

    // 自动更新 npm 安装的 DCP（版本锁定的不更新）
    "autoUpdate": true,

    // 调试日志输出到 ~/.config/opencode/logs/dcp/
    "debug": false,

    // 裁剪通知显示方式："off" 关闭 / "minimal" 简洁 / "detailed" 详细
    "pruneNotification": "detailed",

    // 通知位置："chat" 对话内 / "toast" 弹窗（依赖 TTY/GUI）
    "pruneNotificationType": "chat",

    // ============================================================
    // 斜杠命令配置
    // ============================================================
    "commands": {
        // 启用 DCP 斜杠命令
        "enabled": true,
        // 额外保护的工具名（内置保护见下方）
        "protectedTools": [],
    },

    // ============================================================
    // 手动模式
    // ============================================================
    "manualMode": {
        // 启用后 DCP 不自动注入压缩提醒，但 compress 工具仍可用
        "enabled": false,
        // 手动模式下是否继续运行自动策略（去重、错误清理）
        "automaticStrategies": true,
    },

    // ============================================================
    // 轮次保护
    // ============================================================
    "turnProtection": {
        // 保护最近 N 轮的工具缓存不被回收
        "enabled": false,
        "turns": 4,
    },

    // ============================================================
    // 实验性功能
    // ============================================================
    "experimental": {
        // 允许在子代理会话中裁剪上下文
        "allowSubAgents": false,
        // 允许用户自定义 DCP 提示词
        "customPrompts": false,
    },

    // 保护文件操作不被裁剪（glob 模式匹配 filePath）
    "protectedFilePatterns": [],

    // ============================================================
    // 上下文压缩工具配置（核心）
    // ============================================================
    "compress": {
        // 压缩模式：
        // "range"   — 将连续多轮对话压缩为摘要（稳定，推荐）
        // "message" — 实验性，单独压缩每条原始消息，更精细
        "mode": "range",

        // 压缩工具权限：
        // "allow" — 模型可自由调用，不询问
        // "ask"   — 调用时询问用户
        // "deny"  — 不注册压缩工具给模型
        "permission": "allow",

        // 在聊天中显示压缩内容的详细摘要
        "showCompression": false,

        // 上下文软上限（token 数或百分比如 "50%"）
        "maxContextLimit": 100000,

        // 上下文软下限（token 数或百分比如 "30%"）
        "minContextLimit": 50000,

        // 按模型覆盖 maxContextLimit，键名格式 "provider/model"
        "modelMaxLimits": {},

        // 按模型覆盖 minContextLimit
        "modelMinLimits": {},

        // 压缩提醒频率：1=每次请求都提醒，5=每5次提醒一次
        "nudgeFrequency": 5,

        // 距上次用户消息后多少条消息才开始提醒压缩
        "iterationNudgeThreshold": 15,

        // 提醒强度："soft" 温和 / "strong" 积极
        "nudgeForce": "soft",

        // 额外保护的工具输出会追加到压缩摘要中
        // 内置保护：task/skill/todowrite/todoread/compress/batch
        //          plan_enter/plan_exit/write/edit
        "protectedTools": [],

        // 保留 <protect>...</protect> 标签内容不被压缩
        "protectTags": false,

        // 保留用户原始消息不被压缩（大段粘贴的提示词将永远保留）
        "protectUserMessages": false,
    },
    // ============================================================
    // Purge 配置
    // ============================================================
    "purge": {
        // 启用后自动注入 purge nudge 提醒
        "autonomous": false,
        // purge nudge 提醒频率
        "nudgeFrequency": 5,
    },

    // ============================================================
    // 自动裁剪策略
    // ============================================================
    "strategies": {
        // 去重：相同工具名+参数的多次调用只保留最新结果
        "deduplication": {
            "enabled": true,
            "protectedTools": [],
        },
        // 错误清理：报错工具超过 turns 轮后清除其输入（保留错误信息）
        "purgeErrors": {
            "enabled": true,
            "turns": 4,
            "protectedTools": [],
        },
    },
}
```

---

## 配置依赖

| 配置项                                | 作用域                    | 影响对象                     |
| ------------------------------------- | ------------------------- | ---------------------------- |
| `lang`                                | 全局                      | compress / purge / TUI       |
| `maxContextLimit` / `minContextLimit` | 全局                      | compress nudge / purge nudge |
| `summaryBuffer`                       | 全局                      | compress / purge             |
| `compress.permission`                 | compress + purge 工具注册 | compress nudge / purge tool  |
| `purge.autonomous`                    | purge 独立                | purge nudge                  |
| `purge.nudgeFrequency`                | purge 独立                | purge nudge                  |
| `manualMode`                          | compress                  | compress nudge               |

**说明：**

- `lang`、`maxContextLimit`、`minContextLimit`、`summaryBuffer` 从 `compress` 下提升到配置根级，compress 和 purge（含 nudges 和工具）共用同一组值
- `compress.permission` 控制 compress nudge 注入和 purge 工具注册（purge 尚未完全解耦）；`compress.permission = "deny"` 时 purge 工具不可用，但 purge nudge 仍可注入
- `purge.autonomous` 和 `purge.nudgeFrequency` 完全独立于 compress，仅控制 purge nudge
- `manualMode` 只阻塞 compress nudge，不阻塞 purge nudge

---

## 命令详解

### `/dcp-compress [焦点]` — 手动触发压缩

**原理**：注入一条 AI prompt 让模型调用 `compress` 工具。模型选择已完成的对话章节替换为技术摘要。

- 压缩内容：模型选定的对话范围（用户消息、助手回复、工具调用结果）
- 受保护内容：`compress.protectedTools` 中的工具输出追加到摘要保留
- 两种模式：
    - `range`：压缩连续对话范围，输出一个或多个摘要块
    - `message`：逐条压缩独立消息，更精细
- `[焦点]` 参数：追加到 prompt 尾部指引模型压缩方向

### `/dcp-purge` — 替换清理

**原理**：选中一段已完成的任务对话，将其替换为一段自包含的总结卡片。相比 `compress`，purge 压缩得更紧凑、节省更多 token。可通过 `/dcp-decompress` 恢复。

可替换内容：

- 已完成的任务对话段（工具调用、助手回复、用户输入）
- 旧 `compress` 生成的摘要块（bN）
- 大段不再需要的工具输出

效果：

- 选中的消息范围被替换为一段总结卡片（合成用户消息），注册为压缩块
- 卡片中可标注哪些工具输出已被删除，说明如何重新读取
- 可通过 `/dcp-decompress <blockId>` 恢复原始消息
- **与 compress 的区别**：purge 不受内容保护限制，会替换所选范围内的所有内容（无视 `protectedTools`、`protectTags`、`protectUserMessages` 设置）

### `/dcp-sweep [n]` — 清理工具输出

**原理**：不涉及模型。DCP 直接标记工具输出为"待裁剪"，下次请求时移除。

- 无参数：清理上次用户消息之后的所有工具输出
- `n`：清理最近 n 个工具调用输出
- 受保护工具不受影响（`commands.protectedTools`）
- 被裁剪的输出替换为 `[Output removed to save context - ...]`

### `/dcp-context` — 查看上下文状态

分析当前会话的 token 分布，显示用量详情：

- 上下文总量（System / User / Assistant / Tools 分布）
- 上下文中工具数、活跃裁剪目标数
- 已裁剪 token 数

### `/dcp-stats` — 查看统计

显示 DCP 累计统计数据：

- 本会话节省 token、摘要大小、压缩率、压缩耗时
- 已裁剪工具数 / 消息数
- 所有历史会话合计统计

### `/dcp-manual [on/off]` — 切换手动模式

手动模式下 DCP 不自动注入压缩提醒（compress nudge），但 purge nudge 不受影响——若开启了 `purge.autonomous`，purge 提醒仍会自动注入。所有斜杠命令和 `compress`/`purge` 工具仍可用。

### `/dcp-decompress <n>` — 恢复压缩

恢复指定编号的压缩块，原始消息重新出现在上下文中。

### `/dcp-recompress <n>` — 重新压缩

对之前被用户解压的压缩块重新应用压缩。

### `/dcp-panel` — 打开设置面板

打开 DCP TUI 面板，可查看上下文、统计、手动模式开关等。

### `/dcp-help` — 帮助

显示所有可用命令及其说明。

---

## 工作流程

```
# 1. 启用手动模式（可选）
/dcp-manual on

# 2. 正常对话...

# 3. 上下文太大时清理工具输出
/dcp-sweep

# 4. 触发普通压缩
/dcp-compress

# 5. 需要激进清理时
/dcp-purge

# 6. 查看状态和统计
/dcp-context
/dcp-stats
```

---

## 提示词覆盖

启用 `experimental.customPrompts: true` 后，可自定义 DCP 提示词：

| 文件                     | 用途             |
| ------------------------ | ---------------- |
| `system.md`              | DCP 系统指令     |
| `compress-range.md`      | 范围压缩工具提示 |
| `compress-message.md`    | 消息压缩工具提示 |
| `context-limit-nudge.md` | 上下文超限提醒   |
| `turn-nudge.md`          | 轮次提醒         |
| `iteration-nudge.md`     | 迭代提醒         |
| `purge-nudge.md`         | Purge 提醒       |

覆盖目录优先级：

1. `.opencode/dcp-prompts/overrides/`（项目）
2. `$OPENCODE_CONFIG_DIR/dcp-prompts/overrides/`（自定义）
3. `~/.config/opencode/dcp-prompts/overrides/`（全局）

---

## License

AGPL-3.0-or-later
