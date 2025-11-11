# Vibe Places Data

🌍 适合 Vibe Friends 的创作空间数据库，可以访问 https://vibecafe.ai/places 体验

## 结构

```
data/places.json    # 地点数据
images/{id}/main.jpg  # 地点图片
```

## 贡献

- [📝 添加新地点](../../issues/new?template=new-place.yml)
- [✏️ 更新地点信息](../../issues/new?template=update-place.yml)

填写表单后，系统会自动：
1. 使用 AI 提取地点信息
2. 创建 Pull Request
3. 等待审核合并

## 自动部署

每个贡献的 Pull Request 被合并到 `main` 分支后，会自动触发 [vibecafe.ai](https://vibecafe.ai) 网站重新部署，2-3 分钟内更新生效 ✨