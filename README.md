# EverTools 🛠️

专为开发者打造的实用工具集合，提供高效便捷的日常开发辅助工具。

## 🚀 项目概述

EverTools是一个轻量级工具集，包含两个核心工具：

### 📊 Excel查看器 (Excel Viewer)
基于Web的Excel文件查看器，支持在线预览和处理Excel文件，无需安装任何软件。

**核心特性：**
- 🔍 支持 `.xlsx`、`.xls`、`.csv` 多种格式
- 📱 响应式设计，移动端友好
- 🎯 拖拽上传，操作简便
- ⚡ 纯前端实现，无需服务器

### 🔧 Redis Butler
专为项目部署设计的Redis管理工具，提供直观的可视化界面管理Redis数据。

**核心特性：**
- 🌍 多环境Redis连接管理
- 🔑 完整的Key-Value CRUD操作
- 🔍 通配符搜索和批量操作
- 🛡️ 安全的操作确认机制

## 📂 项目结构

```
evertools/
├── excel-viewer/           # Excel文件查看器
│   ├── index.html         # 主页面
│   ├── script.js          # 核心逻辑
│   ├── style.css          # 样式文件
│   └── README.md          # 详细说明
├── redis-butler/          # Redis管理工具
│   ├── src/               # 源代码
│   ├── pom.xml           # Maven配置
│   └── README.md         # 详细说明
├── LICENSE               # MIT许可证
└── README.md            # 项目说明
```

## 🎯 快速开始

### Excel查看器
```bash
# 1. 进入目录
cd excel-viewer

# 2. 直接打开HTML文件
open index.html
# 或在浏览器中访问 file:///path/to/excel-viewer/index.html
```

### Redis Butler
```bash
# 1. 进入目录
cd redis-butler

# 2. 配置Redis连接
vim src/main/resources/application.yml

# 3. 启动应用
mvn spring-boot:run

# 4. 访问管理界面
open http://localhost:8080
```

## 🔧 子项目详情

| 项目 | 技术栈 | 功能描述 | 快速链接 |
|------|--------|---------|----------|
| Excel Viewer | HTML5 + JavaScript + SheetJS | Web端Excel文件查看器 | [详细说明](./excel-viewer/README.md) |
| Redis Butler | Spring Boot + Lettuce + Web UI | Redis可视化管理工具 | [详细说明](./redis-butler/README.md) |

## 💡 使用场景

### Excel查看器适用于：
- 🏢 需要快速预览Excel文件内容
- 📱 移动端查看Excel数据
- 🚫 无法安装Office软件的环境
- 🌐 Web应用中集成Excel预览功能

### Redis Butler适用于：
- 🚀 项目部署时的Redis数据管理
- 🔍 多环境Redis数据查看和调试
- 🧹 Redis缓存清理和维护
- 👥 团队协作中的Redis操作

## 🛠️ 技术栈

- **前端技术**: HTML5, CSS3, JavaScript (ES6+)
- **后端技术**: Spring Boot 3.2, Java 17
- **数据库**: Redis (单机/集群)
- **构建工具**: Maven
- **第三方库**: SheetJS, Lettuce Redis Client

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

## 📞 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 🐛 [提交Issue](../../issues)
- 💡 [功能建议](../../discussions)

---

⭐ 如果这个项目对你有帮助，欢迎给个 Star！
