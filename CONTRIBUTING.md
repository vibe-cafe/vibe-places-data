# 贡献指南

感谢你对 Vibe Places Data 的兴趣！

## 🎯 如何贡献

### 1. 添加新地点

**步骤：**

1. Fork 本仓库
2. 创建新分支：`git checkout -b add-{place-name}`
3. 在 `data/places.json` 中添加地点信息
4. 添加地点照片到 `images/{place-id}/main.jpg`
5. 提交 Pull Request

**数据格式：**

```json
{
  "id": "使用 UUID v4 生成",
  "title": "地点名称",
  "description": "地点描述（50-200字）",
  "address_text": "完整地址",
  "latitude": 纬度,
  "longitude": 经度,
  "cost_per_person": 人均消费,
  "opening_hours": "08:00-22:00",
  "link": "",
  "image": "{place-id}/main.jpg"
}
```

### 2. 更新现有地点

如果发现信息有误或过时：

1. Fork 本仓库
2. 创建分支：`git checkout -b update-{place-name}`
3. 更新 `data/places.json` 中的信息
4. 提交 Pull Request

## 📋 地点收录标准

- ✅ 适合工作和创作
- ✅ 有稳定的 WiFi
- ✅ 环境舒适安静
- ✅ 有电源插座
- ✅ 允许长时间停留

## 📸 图片要求

- 格式：JPG 或 PNG
- 文件名：`main.jpg`
- 建议尺寸：1200x800 像素
- 文件大小：< 500KB
- 展示地点整体环境

## ✅ 提交前检查

- [ ] JSON 格式正确
- [ ] 地点 ID 唯一
- [ ] 必填字段完整
- [ ] 地址准确
- [ ] 图片路径正确
- [ ] 提交信息清晰

---

感谢你的贡献！
