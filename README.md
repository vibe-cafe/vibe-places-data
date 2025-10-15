# Vibe Places Data

🌍 开源的创作空间地点数据库，为 Vibe Friends 提供适合工作和创作的地点信息。

## 📖 简介

这是一个简单的数据仓库，收集适合创作者、程序员、设计师工作的优质空间。

## 🗂️ 数据结构

```
vibe-places-data/
├── README.md           # 项目说明
├── CONTRIBUTING.md     # 贡献指南
├── data/
│   └── places.json    # 地点数据
└── images/            # 地点图片
    └── {place-id}/
        └── main.jpg
```

### 数据格式

```json
{
  "id": "唯一标识符 (UUID)",
  "title": "地点名称",
  "description": "地点描述",
  "address_text": "详细地址",
  "latitude": 纬度,
  "longitude": 经度,
  "cost_per_person": 人均消费（元）,
  "opening_hours": "营业时间",
  "link": "相关链接（可选）",
  "image": "图片路径"
}
```

## 🚀 使用方式

### 作为 Git Submodule

推荐在你的项目中作为 Git Submodule 使用：

```bash
# 添加为 submodule
git submodule add https://github.com/YOUR_USERNAME/vibe-places-data.git data/places

# 更新到最新版本
git submodule update --remote data/places
```

### 直接使用

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/vibe-places-data.git

# 读取数据
cat data/places.json
```

## 🤝 贡献指南

欢迎贡献新地点或更新现有信息！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 快速贡献

1. Fork 这个仓库
2. 在 `data/places.json` 中添加或修改地点
3. 如有图片，添加到 `images/{place-id}/main.jpg`
4. 提交 Pull Request

## 📋 地点收录标准

- ✅ 有稳定的 WiFi 网络
- ✅ 提供舒适的座位和工作环境
- ✅ 允许长时间停留工作
- ✅ 有电源插座
- ✅ 环境相对安静

## 📊 数据统计

- 总地点数：7 个
- 主要城市：北京

## 📜 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

Made with ❤️ by Vibe Community | https://vibecafe.ai
