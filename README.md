# 电商图片提取下载（Chrome 扩展）

在淘宝 / 天猫 / 京东 / 拼多多商品详情页一键提取商品图片，于新标签页网格展示、勾选，并批量下载为 PNG。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目文件夹（包含 `manifest.json` 的目录）

## 使用

1. 打开淘宝、天猫、京东或拼多多的**商品详情页**
2. 页面右下角会出现蓝色「获取图片」按钮（非详情页不显示）
3. 点击后自动扫描并过滤小图 / 图标，打开「商品图片库」新标签页
4. 默认全选；可取消勾选、全选、反选
5. 点击「下载选中」：扩展会在后台将图片转为 PNG，按 `商品图_001.png` 规则保存到浏览器**默认下载目录**

## 文件结构

```
image-grab/
├── manifest.json      # Manifest V3 配置
├── content.js         # 详情页按钮 + 图片提取
├── content.css        # 悬浮按钮样式
├── background.js      # Service Worker：图库打开 / PNG 转换 / 下载
├── gallery.html       # 图库页面
├── gallery.js         # 勾选与下载交互
├── gallery.css        # 图库样式
└── README.md
```

## 权限说明

- `activeTab` / `scripting`：在详情页注入脚本
- `downloads`：批量保存 PNG
- `storage`：在 content 与 gallery 之间传递图片列表
- `host_permissions`：淘宝、天猫、京东、拼多多域名，用于跨域拉取原图
