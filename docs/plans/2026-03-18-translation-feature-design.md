# EPUB 翻译功能 - 设计规格书

**版本**: 1.0  
**日期**: 2026-03-18  
**功能**: 大模型翻译 + 双语对照 epub 生成

---

## 1. 概述

为 EPUB Manager 添加大模型翻译功能，支持将原版英文书籍翻译为中文，并生成保留原书格式的双语对照 epub 文件。

### 1.1 核心功能

- 大模型 API 集成（OpenAI GPT、Claude、本地模型）
- 整本书一次性翻译
- 生成逐段嵌套双语对照 epub
- 保留原书所有格式和图片
- 实时进度跟踪 + 成本估算
- 中断恢复（断点续译）

---

## 2. 技术架构

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────┐
│                   Renderer Process                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ 书籍列表    │  │ 翻译配置面板  │  │ 翻译进度   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└──────────────────────────┬──────────────────────────┘
                           │ IPC
┌──────────────────────────┴──────────────────────────┐
│                    Main Process                      │
│  ┌──────────────────────────────────────────────┐  │
│  │              Translation Engine                │  │
│  │  ┌─────────────┐  ┌──────────────────────┐  │  │
│  │  │ LLM Client  │  │ Progress Tracker     │  │  │
│  │  │ (multi-     │  │ (状态持久化)         │  │  │
│  │  │ provider)   │  └──────────────────────┘  │  │
│  │  └─────────────┘                            │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │              EPUB Generator                   │  │
│  │  ┌─────────────┐  ┌──────────────────────┐  │  │
│  │  │ Style       │  │ Bilingual            │  │  │
│  │  │ Preserver   │  │ Content Builder      │  │  │
│  │  └─────────────┘  └──────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 支持的 LLM Provider

| Provider | API Format | Base URL | Notes |
|----------|------------|----------|-------|
| OpenAI | OpenAI API | https://api.openai.com/v1 | GPT-4, GPT-3.5 |
| Claude | Anthropic API | https://api.anthropic.com | Claude 3, Claude 2 |
| Local (Ollama) | OpenAI Compatible | http://localhost:11434/v1 | LLaMA, Mistral, etc. |

---

## 3. 功能详细设计

### 3.1 API 配置

**配置参数**：
- `provider`: openai | claude | local
- `model`: 模型名称 (gpt-4, claude-3-sonnet, llama2, etc.)
- `apiKey`: API 密钥
- `baseUrl`: API 端点 (支持本地模型)
- `temperature`: 0.0-2.0 (默认 0.3)
- `maxTokens`: 单次请求最大 token 数

**配置存储**：
- 使用 SQLite settings 表存储
- 加密存储 API Key

### 3.2 翻译流程

```
1. 解析原 epub 文件
   └── 提取所有 HTML/XHTML 章节内容
   └── 提取样式表 (CSS)
   └── 提取图片资源
   └── 提取目录结构 (NCX/导航)

2. 内容分块
   └── 按段落分割内容
   └── 识别标题、列表、引用等特殊元素
   └── 记录每块的原始位置和样式

3. 逐段翻译
   └── 批量发送翻译请求 (batch)
   └── 原文 → LLM → 译文
   └── 保存每段翻译结果

4. 生成双语 epub
   └── 原文样式 + 译文样式
   └── 逐段嵌套: [原文] [分隔] [译文]
   └── 保留原书所有格式和资源

5. 保存/导出
   └── 生成新 epub 文件
   └── 保存到用户指定位置
```

### 3.3 双语对照格式

**HTML 结构**：
```html
<div class="bilingual-block">
  <div class="original-text">原文内容 (深色 #333333)</div>
  <div class="separator"></div>
  <div class="translated-text">译文内容 (浅色 #666666 或蓝色 #4a90d9)</div>
</div>
```

**CSS 样式**：
```css
.original-text {
  color: #333333;
  font-style: normal;
}

.translated-text {
  color: #4a90d9;
  font-style: normal;
}

.separator {
  height: 1em;
  border-bottom: 1px solid #e0e0e0;
}
```

### 3.4 进度跟踪

**跟踪数据**：
- 总段落数
- 已完成段落数
- 当前进度百分比
- 已消耗 token 数
- 预估剩余 token 数
- 预估费用 (USD)

**状态持久化**：
- SQLite 记录翻译任务状态
- 支持中断后从断点继续
- 失败重试机制

### 3.5 断点续译

**保存内容**：
- 已翻译段落结果
- 当前翻译任务 ID
- 最后成功翻译的位置
- 累计 token 使用量

**恢复流程**：
1. 检测未完成的翻译任务
2. 加载已翻译内容
3. 从断点继续翻译
4. 合并结果生成 epub

---

## 4. 数据库扩展

### 4.1 翻译任务表

```sql
CREATE TABLE translation_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER REFERENCES books(id),
  status TEXT CHECK(status IN ('pending', 'translating', 'completed', 'failed', 'paused')) DEFAULT 'pending',
  provider TEXT,
  model TEXT,
  total_paragraphs INTEGER DEFAULT 0,
  translated_paragraphs INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  progress REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE TABLE translation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES translation_tasks(id),
  paragraph_index INTEGER,
  original_text TEXT,
  translated_text TEXT,
  tokens_used INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_translation_tasks_book ON translation_tasks(book_id);
CREATE INDEX idx_translation_results_task ON translation_results(task_id);
```

---

## 5. 界面设计

### 5.1 翻译入口

在书籍详情面板添加 "翻译" 按钮：
- 选中书籍后显示翻译按钮
- 点击打开翻译配置面板

### 5.2 翻译配置面板

```
┌─────────────────────────────────────┐
│  翻译配置                           │
├─────────────────────────────────────┤
│  Provider: [OpenAI ▼]               │
│                                     │
│  Model: [gpt-4 ▼]                   │
│                                     │
│  API Key: [****************]         │
│                                     │
│  Base URL: (留空使用默认)            │
│  [https://api.openai.com/v1]        │
│                                     │
│  Temperature: [0.3]                 │
│                                     │
│  Max Tokens: [4096]                 │
│                                     │
│  预估费用: $0.00                     │
│                                     │
│  [ ] 保留原书格式                    │
│  [x] 生成双语对照版                  │
│                                     │
│  [取消]           [开始翻译]         │
└─────────────────────────────────────┘
```

### 5.3 翻译进度面板

```
┌─────────────────────────────────────┐
│  翻译进度                           │
├─────────────────────────────────────┤
│  ████████████░░░░░░░  65%          │
│                                     │
│  已翻译: 130 / 200 段落              │
│  已用 Token: 15,230                 │
│  预估剩余: 8,200                     │
│  预估费用: $0.12                    │
│                                     │
│  当前: Chapter 3 - The Door...      │
│                                     │
│  [中断翻译]       [取消]             │
└─────────────────────────────────────┘
```

---

## 6. 项目结构

```
src/main/
├── translation/
│   ├── index.js           # 翻译引擎入口
│   ├── llm-client.js      # 大模型客户端 (多provider)
│   ├── epub-parser.js     # EPUB 解析 (复用)
│   ├── epub-generator.js  # 双语 epub 生成
│   ├── progress-tracker.js # 进度跟踪
│   └── config-manager.js   # API 配置管理
```

---

## 7. 后续扩展

- [ ] 批量翻译多本书籍
- [ ] 翻译记忆 (避免重复翻译相同段落)
- [ ] 自定义对照样式
- [ ] 翻译质量评估
