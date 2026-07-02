# DCP — OpenCode 上下文裁剪插件

自动管理 OpenCode 对话上下文，通过压缩、去重、错误清理来降低 token 消耗。

## 安装

### 从 GitHub Actions 构建产物安装（推荐）

1. 进入仓库 Actions 页面，选择最新成功的 **Build** workflow
2. 下载 Artifact（文件名格式 `dcp-{提交哈希前8位}`）
3. 解压到任意目录
4. 安装到 OpenCode（项目级，保存在当前项目的 `.opencode/opencode.json`）：

```bash
cd /path/to/your/project
opencode plugin /path/to/dcp-xxxxxx --force
```

> 如需全局安装（用于所有项目），添加 `--global` 参数：
>
> ```bash
> opencode plugin /path/to/dcp-xxxxxx --global
> ```

### 从本地项目目录安装（Termux / ARM64 环境）

> `tsup` 在 Termux (Android ARM64) 上无法运行，需要使用 `build-local.mjs` 替代。

```bash
git clone https://github.com/assesvgs/opencode-dynamic-context-pruning
cd opencode-dynamic-context-pruning
npm install
node build-local.mjs
opencode plugin . --force
```

标准 Linux/macOS 环境可直接使用 `npm run build`。

### 从 npm 安装（原版）

```bash
opencode plugin @tarquinen/opencode-dcp --global
```

## 配置

配置文件 `dcp.jsonc`，按优先级覆盖：全局 `~/.config/opencode/` → 自定义 `$OPENCODE_CONFIG_DIR/` → 项目 `.opencode/`

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
    // 启用 DCP 斜杠命令（/dcp-sweep、/dcp-purge 等）
    "enabled": true,
    // 额外保护的工具名（内置保护：task/skill/todowrite/todoread/compress/batch/plan_enter/plan_exit/write/edit）
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
    // 保护轮数
    "turns": 4,
  },

  // ============================================================
  // 实验性功能
  // ============================================================
  "experimental": {
    // 允许在子代理会话中裁剪上下文
    "allowSubAgents": false,
    // 允许用户自定义 DCP 提示词（开启后可覆盖 prompt 文件）
    "customPrompts": false,
  },

  // 保护文件操作不被裁剪（glob 模式匹配 filePath）
  "protectedFilePatterns": [],

  // ============================================================
  // 上下文压缩工具配置（核心）
  // ============================================================
  "compress": {
    // 语言：命令描述和 TUI 面板的显示语言
    // "en" = 英文 / "zh" = 中文
    "lang": "en",

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

    // 摘要 token 是否计入 maxContextLimit：
    // true  = 摘要 token 不计入限制，等效扩展上下文窗口
    // false = 摘要 token 计入限制
    "summaryBuffer": true,

    // 上下文软上限（token 数或百分比如 "50%"）
    // 超过此值持续注入强压缩提醒
    "maxContextLimit": 100000,

    // 上下文软下限（token 数或百分比如 "30%"）
    // 低于此值关闭提醒，高于此值开启提醒
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
    // 内置保护：task/skill/todowrite/todoread
    "protectedTools": [],

    // 保留 <protect>...</protect> 标签内容不被压缩
    "protectTags": false,

    // 保留用户原始消息不被压缩（大段粘贴的提示词将永远保留）
    "protectUserMessages": false,

    // 允许 AI 自主调用 purge 工具进行极限清理
    // 启用后 AI 可在认为上下文需要激进清理时自行调用 purge
    "autonomousPurge": false,
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

## 命令详解

### `/dcp-compress [焦点]` — 手动触发压缩

**原理**：向模型注入一条提示，让模型调用 `compress` 工具。模型选择对话中已完成的章节，将其替换为高保真技术摘要。

- 压缩的内容类型：模型选定的对话范围（用户消息、助手回复、工具调用结果）
- 受保护的内容：`protectedTools` 列表中的工具输出会追加到摘要中保留
- 两种模式：
  - `range` 模式：压缩连续对话范围，输出一个或多个摘要块
  - `message` 模式：逐条压缩独立消息，更精细
- 可选 `[焦点]` 参数指引模型压缩的重点方向

### `/dcp-purge` — 极限清理

**原理**：与 `/dcp-compress` 相同机制，但注入的提示告知模型**无任何内容限制**。模型可对每条内容独立判定：完全删除、一行摘要、或保留。

**可清理的内容（全部无豁免）：**

- 工具调用输入（包括 `write`/`edit` 等敏感工具的文件内容）
- 工具调用输出（包括 `task` 子代理结果、`skill` 技能输出）
- 用户消息（包括 `protectedUserMessages` 开启时的保护消息）
- 助手回复
- 错误信息
- 文件内容
- 之前 `compress` 生成的摘要块
- `<protect>` 标签内容

**模型判定规则：**

- **完全没用** → summary 写 `[purged]` → DCP 直接删除，不注入任何摘要
- **有一点用** → 一行极简摘要
- **还在用** → 不选中该范围

**注意**：此命令设计为数据销毁操作，使用前确认不再需要选中范围的内容。

### `/dcp-sweep [n]` — 清理工具输出

**原理**：不涉及模型。DCP 直接标记指定工具调用的输出为"待裁剪"，下次请求时从消息中移除。

- 无参数：清理上次用户消息之后的所有工具输出
- 带参数 `n`：清理最近 n 个工具调用的输出
- 清理目标：仅工具输出内容，不涉及消息本体
- 受保护的工具不受影响（`commands.protectedTools`）
- 效果：被裁剪的输出替换为 `[Output removed to save context - information superseded or no longer needed]`

### `/dcp-context` — 查看上下文状态

**原理**：分析当前会话的 token 分布，显示详细用量报告。

显示内容：

- 上下文总量（total / system / user / assistant / tools 分布）
- 上下文中工具数
- 活跃裁剪目标数
- 已裁剪 token 数

### `/dcp-stats` — 查看统计

显示 DCP 插件的累计统计数据：

- 本会话节省 token、摘要大小、压缩率
- 压缩耗时
- 已裁剪工具数/消息数
- 所有历史会话合计统计
- 有 DCP 历史的会话数

### `/dcp-manual [on/off]` — 切换手动模式

**原理**：手动模式下 DCP 不自动向对话注入压缩提醒，但 `compress`/`purge` 工具和所有斜杠命令仍可用。

- `on` — 开启手动模式
- `off` — 关闭手动模式（恢复自动提醒）
- 无参数 — 切换开关

### `/dcp-decompress <n>` — 恢复压缩

恢复指定编号的压缩块，被压缩的原始消息重新出现在上下文中。

### `/dcp-recompress <n>` — 重新压缩

对之前被用户解压的压缩块重新应用压缩。

### `/dcp-panel` — 打开设置面板

打开 DCP TUI 设置面板，可查看上下文、统计、手动模式开关等信息。

### `/dcp-help` — 帮助

显示所有可用命令及其说明。

## 工作流程

```
# 启用手动模式（可选）
/dcp-manual on

# 正常对话...

# 上下文太大时清理工具输出
/dcp-sweep

# 触发一次普通压缩
/dcp-compress

# 需要激进清理时
/dcp-purge
```

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

覆盖目录优先级：

1. `.opencode/dcp-prompts/overrides/`（项目）
2. `$OPENCODE_CONFIG_DIR/dcp-prompts/overrides/`（自定义）
3. `~/.config/opencode/dcp-prompts/overrides/`（全局）

## License

AGPL-3.0-or-later
