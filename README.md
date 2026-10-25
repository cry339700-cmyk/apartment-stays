# 公寓旅居 · 多语言网站

约 12 个单元的公寓旅宿网站前端，使用 GitHub Pages 托管。

## 访问

- 中文界面：站点网址后加 `?lang=zh`。
- 其他语言：`?lang=en`、`?lang=pt`、`?lang=fr`、`?lang=es`、`?lang=ru`、`?lang=ar`。
- 阿拉伯语支持 RTL；页面提供浅色／暗色外观及交互动效。

## 预订状态

当前为预订流程演示。价格与房态使用体验者输入的测试值，支付为模拟，不会创建真实预订或扣款。
待补充：项目名称、最终单元资料、实景照片、真实价格、实时库存、支付渠道、当地短租要求、OTA／PMS 配置及正式域名。

演示订单可按填写的邮箱，在“我的订单”中查询。数据仅保存于当前标签页的 sessionStorage，刷新或本站跨页后仍可查看，关闭标签页后清除；不发送到服务器。请使用虚构资料。

四种付款选择已展示：银行卡、微信支付、支付宝、PayPal。正式渠道均待配置；邮件目前提供明确标识的样式预览，不会声称已发送。

真实收款、订单验证与自动邮件的后端代码位于 `server/`，接入步骤见 [server/DEPLOY.md](server/DEPLOY.md)。待补充实际商户、发信服务、库存与后端地址后启用。

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
- `orders.html`：邮箱验证订单查询；未接后端时为本机演示订单。
- `commerce-config.js`：公开后端地址，默认留空；不得放密钥。
- `commerce-client.js`、`orders.js`：付款接入和订单查询。
- `commerce-copy.js`、`mail-template.js`：七语言订单内容与确认邮件。
- `server/`：Node.js 24 + Stripe + SQLite + Resend 后端。
- `scripts/build-pages.mjs`：生成上述六个 HTML 页面，共享导航、页脚与预订弹窗。修改后运行 `node scripts/build-pages.mjs`，再提交生成的 HTML。
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
