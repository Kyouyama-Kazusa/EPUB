# EPUB 电子书管理系统 - 设计规格书

**版本**: 1.0  
**日期**: 2026-03-18  
**技术栈**: Electron + SQLite

---

## 1. 概述

一个面向 Windows 平台的 epub 电子书元数据管理系统，专注于帮助用户整理、搜索和管理 epub 书籍的元数据信息。

### 1.1 核心功能

- 批量导入 epub 文件，自动解析内置元数据
- 手动/联网补全缺失的元数据
- 封面提取与自定义替换
- 多维度分类：文件夹 + 标签 + 阅读状态
- 完整的批量操作支持

---

## 2. 技术架构

### 2.1 技术选型

| 组件 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 数据库 | SQLite (better-sqlite3) |
| epub 解析 | epub.js 或 jszip + xml2js |
| 前端 | HTML/CSS/Vue.js 或 React |
| 构建工具 | electron-builder |

### 2.2 系统架构

```
┌─────────────────────────────────────────┐
│              Renderer Process           │
│  ┌─────────┬──────────┬──────────────┐ │
│  │  导航栏  │  书籍列表  │  详情/编辑   │ │
│  │(文件夹/  │          │    面板      │ │
│  │ 标签/状态)│          │              │ │
│  └─────────┴──────────┴──────────────┘ │
└────────────────┬──────────────────────┘
                  │ IPC
┌─────────────────┴──────────────────────┐
│              Main Process              │
│  ┌──────────────┬──────────────────┐  │
│  │  文件操作模块 │   数据库模块      │  │
│  │  (epub解析)  │   (SQLite)       │  │
│  └──────────────┴──────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │       网络模块 (可选:联网补全)     │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 3. 界面设计

### 3.1 三栏布局

```
┌────────────┬─────────────────┬────────────────┐
│   导航栏    │     书籍列表     │    详情面板     │
│  (240px)   │    (自适应)     │    (320px)    │
│            │                 │               │
│ ▼ 文件夹    │ [封面] 书名     │  封面大图       │
│   ├ 文学    │       作者名     │  书名: xxx     │
│   ├ 科幻    │ [封面] 书名     │  作者: xxx     │
│   └ 技术    │       作者名     │  出版社: xxx   │
│            │                 │  标签: xxx     │
│ ▼ 标签      │                 │  状态: 已读    │
│   ├ 必读    │                 │               │
│   └ 待看    │                 │  [编辑] [删除] │
│            │                 │               │
│ ▼ 阅读状态  │                 │               │
│   □ 未读    │                 │               │
│   □ 阅读中  │                 │               │
│   ■ 已读    │                 │               │
└────────────┴─────────────────┴────────────────┘
```

### 3.2 导航栏功能

- **文件夹树**: 支持多级文件夹，可折叠/展开
- **标签列表**: 显示所有标签及书籍数量，支持多选
- **阅读状态**: 未读/阅读中/已读，快速筛选

### 3.3 书籍列表

- 支持网格/列表视图切换
- 显示：封面缩略图、书名、作者
- 支持多选（Ctrl/Shift）
- 右键菜单：编辑、删除、移动、导出

### 3.4 详情/编辑面板

- 大封面展示
- 完整元数据字段显示
- 编辑模式切换
- 保存/取消按钮

---

## 4. 数据模型

### 4.1 数据库表结构

```sql
-- 书籍表
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  description TEXT,
  cover_path TEXT,
  file_path TEXT NOT NULL,
  file_mode TEXT CHECK(file_mode IN ('copy', 'reference')) DEFAULT 'reference',
  read_status TEXT CHECK(read_status IN ('unread', 'reading', 'read')) DEFAULT 'unread',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文件夹表
CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES folders(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 标签表
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 书籍-文件夹关联表
CREATE TABLE book_folders (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, folder_id)
);

-- 书籍-标签关联表
CREATE TABLE book_tags (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);
```

### 4.2 索引

```sql
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_read_status ON books(read_status);
CREATE INDEX idx_folders_parent ON folders(parent_id);
```

---

## 5. 功能详细设计

### 5.1 导入功能

**批量导入流程**:
1. 用户选择文件夹或多个 epub 文件
2. 后台遍历文件，解析每个 epub 的 metadata.xml
3. 提取字段：title、creator、publisher、description、cover
4. 对于没有元数据的文件，标记为"待完善"
5. 显示导入结果统计

**文件模式选择**:
- `copy`: 复制文件到软件数据目录
- `reference`: 仅记录原文件路径

### 5.2 元数据解析

** epub 内置元数据解析**:
- 解析 OPF 文件中的 metadata 节点
- 提取：title、creator (author)、publisher、description、date
- 提取封面图像

**联网补全 (可选扩展)**:
- 调用 Google Books API 或 Open Library API
- 根据书名搜索匹配
- 用户确认后更新元数据

### 5.3 封面处理

1. **提取**: 从 epub/OPF/manifest 中查找 cover 引用
2. **存储**: 复制到本地数据目录的 covers/ 子目录
3. **显示**: 列表页缩略图 (80x120)，详情页大图 (200x300)
4. **自定义**: 支持上传本地图片替换

### 5.4 分类系统

**文件夹分组**:
- 用户创建/重命名/删除文件夹
- 支持拖拽书籍到文件夹
- 支持多级目录

**标签系统**:
- 创建/删除标签
- 多标签支持
- 批量添加/移除标签

**阅读状态**:
- 三种状态：未读、阅读中、已读
- 快速切换

### 5.5 批量操作

- **批量选择**: Ctrl/Shift 多选
- **批量编辑**: 一次编辑多本书的共同字段
- **批量标签**: 一次添加/移除多个标签
- **批量移动**: 移动到指定文件夹
- **批量删除**: 删除时询问是否删除原文件

### 5.6 搜索与筛选

- 全局搜索：书名、作者、出版社
- 组合筛选：文件夹 + 标签 + 阅读状态
- 搜索结果高亮

---

## 6. 项目结构

```
epub-manager/
├── package.json
├── electron-builder.json
├── src/
│   ├── main/                 # 主进程
│   │   ├── index.js          # 入口
│   │   ├── database.js       # SQLite 操作
│   │   ├── epub-parser.js     # epub 解析
│   │   ├── file-manager.js    # 文件操作
│   │   └── ipc-handlers.js    # IPC 处理
│   ├── renderer/             # 渲染进程
│   │   ├── index.html
│   │   ├── main.js           # Vue/React 入口
│   │   ├── styles/
│   │   │   └── main.css
│   │   ├── components/
│   │   │   ├── Sidebar.vue    # 左侧导航
│   │   │   ├── BookList.vue   # 书籍列表
│   │   │   ├── DetailPanel.vue# 详情面板
│   │   │   └── common/        # 通用组件
│   │   └── store/            # 状态管理
│   └── preload/
│       └── preload.js         # 预加载脚本
├── assets/
│   └── icons/                # 应用图标
├── data/                     # 运行时数据
│   ├── books/                # 复制的书籍
│   └── covers/               # 封面图片
└── README.md
```

---

## 7. 后续扩展 (可选)

- [ ] 导出功能：导出元数据为 JSON/CSV
- [ ] 笔记功能：为书籍添加阅读笔记
- [ ] 统计面板：阅读统计、书架概览
- [ ] 皮肤主题：深色/浅色模式
- [ ] 云同步：备份数据库到云端
