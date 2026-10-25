# 公寓旅居 · 多语言网站

约 12 个单元的公寓旅宿网站前端，使用 GitHub Pages 托管。

## 访问

- 中文界面：站点网址后加 `?lang=zh`。
- 其他语言：`?lang=en`、`?lang=pt`、`?lang=fr`、`?lang=es`、`?lang=ru`、`?lang=ar`。
- 阿拉伯语支持 RTL；页面提供浅色／暗色外观及交互动效。

## 预订状态

当前为预订流程演示。价格与房态使用体验者输入的测试值，支付为模拟，不会创建真实预订或扣款。
待补充：项目名称、最终单元资料、实景照片、真实价格、实时库存、支付渠道、当地短租要求、OTA／PMS 配置及正式域名。

演示客人资料仅保存在当前页面内存中，不发送到服务器。请使用虚构资料。

## 修改与自动发布

网页文件直接位于仓库根目录，发布源为 `main` 分支根目录。
修改后提交并推送到 `main`，GitHub Pages 会自动构建并部署。
导航指向独立 HTML 文档，直接访问或刷新子页均有效；链接携带所选语言，当前页导航会高亮。
`.nojekyll` 用于按普通静态文件发布。本项目无需安装依赖或执行构建。

- `index.html`：首页与精选公寓。
- `apartments.html`：约 12 个单元的完整列表。
- `about.html`：旅居理念。
- `information.html`：入住须知与预订步骤。
- `faq.html`：常见问题。
- `scripts/build-pages.mjs`：生成上述五个 HTML 页面，共享导航、页脚与预订弹窗。修改后运行 `node scripts/build-pages.mjs`，再提交生成的 HTML。
- `style.css`：视觉、响应式及 RTL。
- `i18n.js`：七种语言内容。
- `app.js`：预订演示与交互。
- `motion.js`：点击、滚动逐项浮现和过渡动画；尊重减少动态效果设置。
- `assets/`：示意图片、字体和图标；第三方授权文本在 `assets/licenses/`。

## 本地预览

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

## 域名

待补充：自定义域名。当前使用 GitHub Pages 提供的 HTTPS 地址。
