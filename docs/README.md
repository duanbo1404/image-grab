# 图提取 ImageGrab · 官网

纯静态宣传站，无需构建、无需后端，双击 `docs/index.html` 即可在浏览器中打开。

## 目录结构

```
docs/
├── index.html        # 首页：Hero、产品介绍、核心功能、安装步骤、CTA、Footer
├── css/style.css     # 全站样式（变量、组件、响应式）
├── js/main.js        # 交互：吸顶导航、汉堡菜单、滚动入场、区块高亮
└── assets/favicon.svg # 站点图标（纯 SVG，无外部图片依赖）
```

## 本地预览

- 直接双击 `docs/index.html`；或在浏览器地址栏输入
  `file:///C:/Users/Steven/Desktop/ai-training/image-grab/docs/index.html`
- 建议同时把窗口拖到窄宽度，检查移动端汉堡菜单与单列布局。

## 修改主色调

`docs/css/style.css` 顶部的 `:root` 里改两个变量即可全站生效：

```css
:root {
  --primary: #3b6bff;   /* 主色：蓝 */
  --primary-2: #8b5cf6; /* 渐变的另一端：紫 */
}
```

- 想改成纯蓝风格：把 `--primary-2` 设为接近 `--primary` 的蓝色（如 `#22d3ee` 青色或 `#2563eb`）。
- 深色区（Hero / CTA / Footer）底色同样在 `:root` 中，变量为 `--ink`、`--ink-2`。

## 修改文案

- 结构在 `docs/index.html`，每个区块都有 HTML 注释标注（如 `<!-- 核心功能 -->`）。
- 常见改动位置：
  - Hero 标题与副标题：`.hero-title`、`.hero-sub`
  - 三大痛点卡片：`.pain-list` 内三个 `<li class="pain-card">`
  - 六个功能卡片：`.feature-grid` 内三个字段 `h3` / `p`
  - 四步安装：`.steps` 内 `.step-card`
  - 页脚版权与 GitHub 链接：`<footer class="site-footer">`

## 替换下载地址

`index.html` 中的下载按钮当前是占位链接：

```html
<a class="btn btn--primary btn--lg" href="#" id="downloadBtn" download>下载插件</a>
```

把它改成插件压缩包或应用商店的真实地址，`js/main.js` 里的占位提示会自动失效。
