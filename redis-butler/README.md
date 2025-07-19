# Redis Butler - Redis管理工具

专为程序员部署项目时设计的Redis管理工具，提供简洁高效的Redis key-value操作界面。

## 功能特性

- 🌍 **多环境支持** - 支持dev/test/prod等多环境Redis连接配置
- 🔑 **Key-Value管理** - 完整的增删改查操作
- 🔍 **智能搜索** - 支持通配符模式搜索Redis keys
- 📦 **批量操作** - 批量删除、批量设置过期时间
- 🎯 **类型识别** - 自动识别并显示key的数据类型
- ⚡ **快速连接** - 一键测试连接状态
- 🖥️ **现代界面** - 响应式设计，支持移动端

## 技术栈

- **后端:** Spring Boot 3.2 + Lettuce Redis客户端
- **前端:** 原生HTML + JavaScript
- **数据库:** Redis (支持单机和集群)

## 快速开始

### 1. 配置Redis连接

编辑 `src/main/resources/application.yml`：

```yaml
redis:
  environments:
    dev:
      host: localhost
      port: 6379
      database: 0
      password: 
      timeout: 2000ms
    test:
      host: test-redis.example.com
      port: 6379
      database: 1
      password: test123
      timeout: 2000ms
```

### 2. 启动应用

```bash
mvn spring-boot:run
```

### 3. 访问管理界面

打开浏览器访问：http://localhost:8080

## 使用说明

### 基础操作

1. **选择环境** - 在右上角选择要连接的Redis环境
2. **测试连接** - 点击"测试连接"确保环境可用
3. **管理Keys** - 在左侧面板进行key-value操作
4. **浏览Keys** - 在右侧面板查看和搜索所有keys

### 高级功能

#### 搜索Keys
- 使用通配符模式搜索：`user:*`、`*cache*`、`session:*`
- 支持实时key类型显示

#### 批量操作
- **批量删除：** 根据模式删除多个keys
- **批量过期：** 为匹配的keys统一设置过期时间
- **预览功能：** 操作前可预览将影响的keys

#### 安全特性
- 危险操作需要二次确认
- 批量操作需要输入确认文本
- 连接异常自动提示

## API接口

应用提供完整的REST API：

```
GET  /api/redis/environments      # 获取环境列表
POST /api/redis/test-connection   # 测试连接
GET  /api/redis/key              # 获取key值
POST /api/redis/key              # 设置key值
DELETE /api/redis/key            # 删除key
GET  /api/redis/keys             # 搜索keys
GET  /api/redis/key-info         # 获取key详细信息
POST /api/redis/batch-delete     # 批量删除
POST /api/redis/batch-expire     # 批量过期
POST /api/redis/flush-db         # 清空数据库
```

## 部署建议

### 开发环境
```bash
mvn spring-boot:run
```

### 生产环境
```bash
mvn clean package
java -jar target/redis-butler-1.0.0.jar
```

### Docker部署
```dockerfile
FROM openjdk:17-jre-slim
COPY target/redis-butler-1.0.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

## 配置说明

### 环境配置
每个环境支持以下配置项：
- `host` - Redis服务器地址
- `port` - Redis端口号
- `database` - 数据库编号
- `password` - 访问密码(可选)
- `timeout` - 连接超时时间

### 安全配置
生产环境建议：
- 配置访问控制
- 使用HTTPS
- 限制网络访问
- 定期更新密码

## 注意事项

⚠️ **重要提醒**
- 批量删除操作不可恢复
- 清空数据库会删除所有数据
- 建议在测试环境先验证操作
- 生产环境请谨慎使用批量功能

## 技术支持

如遇问题请检查：
1. Redis连接配置是否正确
2. 网络连通性
3. Redis服务是否正常运行
4. 日志中的错误信息