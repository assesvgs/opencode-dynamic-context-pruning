# DCP — OpenCode 上下文裁剪插件

自动管理 OpenCode 对话上下文，通过压缩、去重、错误清理来降低 token 消耗。

## 安装

### 从 GitHub Actions 构建产物安装（推荐）

1. 进入仓库 Actions 页面，选择最新成功的 **Build** workflow
2. 下载 Artifact（文件名格式 `dcp-{提交哈希前8位}`）
3. 解压到任意目录
4. 安装到 OpenCode：

```bash
opencode plugin /path/to/dcp-xxxxxx --force
```

### 从本地项目目录安装

```bash
git clone https://github.com/assesvgs/opencode-dynamic-context-pruning
cd opencode-dynamic-context-pruning

# 安装依赖
npm install

# 构建
node build-local.mjs

# 安装插件
opencode plugin . --force
```

### 从 npm 安装（原版）

需要原发布者权限：

```bash
opencode plugin @tarquinen/opencode-dcp --global
```

## 配置

DCP 使用独立的配置文件 `dcp.jsonc`，按以下顺序覆盖：

1. **全局**：`~/.config/opencode/dcp.jsonc`（首次运行自动生成）
2. **自定义**：`$OPENCODE_CONFIG_DIR/dcp.jsonc`
3. **项目**：`.opencode/dcp.jsonc`

配置示例（`~/.config/opencode/dcp.jsonc`）：

```jsonc
{
    "compress": {
        "lang": "zh",                   // 界面语言：en / zh
        "permission": "allow",          // allow / ask / deny
        "autonomousPurge": true,        // 允许 AI 自主调用 purge 工具
        
        "maxContextLimit": 100000,      // 上下文软上限（超过后强提醒压缩）
        "minContextLimit": 50000,       // 上下文软下限（低于此值不提醒）
        "nudgeFrequency": 5,            // 压缩提醒频率（1=每次请求都提醒）
        "nudgeForce": "soft",           // 提醒强度：soft / strong
        "mode": "range",                // 压缩模式：range / message
        "showCompression": false,       // 显示压缩摘要通知
        "protectUserMessages": false,   // 保护用户消息不被压缩
        "protectTags": false            // 保护 <protect> 标签内容
    },
    "manualMode": {
        "enabled": true,               // 启用手动模式
        "automaticStrategies": true    // 手动模式下仍运行自动策略
    },
    "strategies": {
        "deduplication": { "enabled": true },
        "purgeErrors": { "enabled": true, "turns": 4 }
    }
}
```

## 命令

### 手动压缩

| 命令 | 说明 |
|------|------|
| `/dcp-compress [焦点]` | 手动触发一次压缩，可选焦点指定压缩范围 |
| `/dcp-purge` | **极限清理**：AI 可删除或压缩任意内容，无任何保护限制 |
| `/dcp-sweep [n]` | 清理上次用户消息后的工具输出，可指定数量 |

### 信息查看

| 命令 | 说明 |
|------|------|
| `/dcp-context` | 查看当前会话 Token 用量详情 |
| `/dcp-stats` | 查看 DCP 清理统计 |
| `/dcp-help` | 显示帮助信息 |

### 管理

| 命令 | 说明 |
|------|------|
| `/dcp-manual [on/off]` | 切换手动模式 |
| `/dcp-decompress <n>` | 恢复指定压缩块 |
| `/dcp-recompress <n>` | 重新压缩已解压的块 |
| `/dcp-panel` | 打开 DCP 设置面板（TUI） |

## 工作流程

推荐的日常使用流程：

```
# 1. 启用手动模式（可选）
/dcp-manual on

# 2. 正常对话，AI 不会自动压缩

# 3. 上下文太大时先清理工具输出
/dcp-sweep

# 4. 触发一次压缩
/dcp-compress

# 5. 需要激进清理时
/dcp-purge
```

## 提示词覆盖

启用 `experimental.customPrompts: true` 后可自定义 DCP 的提示词：

- `system` — DCP 系统指令
- `compress-range` — 范围压缩工具提示
- `compress-message` — 消息压缩工具提示
- `context-limit-nudge` / `turn-nudge` / `iteration-nudge` — 压缩提醒

覆盖文件放在（优先级从高到低）：
1. `.opencode/dcp-prompts/overrides/`
2. `$OPENCODE_CONFIG_DIR/dcp-prompts/overrides/`
3. `~/.config/opencode/dcp-prompts/overrides/`

## License

AGPL-3.0-or-later
