# Excel 文件查看器

这是一个基于Web的Excel文件查看器，支持上传和查看多种格式的Excel文件。

## 功能特性

- 📁 支持多种文件格式：`.xlsx`, `.xls`, `.csv`
- 📊 多工作表支持
- 🎯 拖拽上传文件
- 📱 响应式设计，支持移动设备
- 🔄 同时处理多个文件
- ⚡ 实时数据预览
- 🎨 现代化UI设计

## 如何使用

1. 打开 `index.html` 文件
2. 点击上传区域或拖拽Excel文件到页面
3. 选择要查看的工作表（如果有多个）
4. 查看表格数据

## 支持的文件格式

- **XLSX**: Excel 2007及以上版本
- **XLS**: Excel 97-2003版本
- **CSV**: 逗号分隔值文件

## 技术实现

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **Excel解析**: SheetJS (XLSX库)
- **样式**: 现代CSS Grid和Flexbox布局
- **兼容性**: 支持所有现代浏览器

## 项目结构

```
excel-viewer/
├── index.html          # 主页面
├── style.css           # 样式文件
├── script.js           # 主要逻辑
├── test-data.csv       # 测试数据
└── README.md          # 项目说明
```

## 开发说明

项目使用纯前端技术，无需服务器支持。直接在浏览器中打开`index.html`即可使用。

### 主要类和方法

- `ExcelViewer`: 主要的Excel查看器类
- `handleFiles()`: 处理文件上传
- `processFile()`: 解析Excel文件
- `renderTable()`: 渲染数据表格
- `parseCSV()`: 解析CSV文件

## 使用示例

1. 上传test-data.csv文件测试基本功能
2. 创建包含多个工作表的Excel文件测试工作表切换
3. 上传大型Excel文件测试性能

## 浏览器支持

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 注意事项

- 大文件可能需要较长加载时间
- 建议文件大小不超过10MB
- 某些复杂的Excel功能（如公式、图表）暂不支持显示