# 真实收款与订单邮件接入

目前 GitHub Pages 展示四种支付选择、当前标签页的演示订单和邮件预览。`commerce-config.js` 的 `apiBase` 为空，因此不会发起真实扣款或发送邮件。

## 正式服务结构

GitHub Pages 前端 → 本目录的 Node.js 24 API → 持久化 SQLite 订单数据库 → Stripe 内嵌结账 → 已验签的付款回调 → 邮件任务表 → Resend → 客人的预订邮箱。

- 微信支付、支付宝、PayPal 和银行卡分别使用 Stripe 的 `wechat_pay`、`alipay`、`paypal`、`card` 方法。待补充：实际商户国家、已开通的方法和结算币种；商户后台已启用的方法才加入 `PAYMENT_METHODS`。PayPal 在这里通过 Stripe 接入，待补充：是否使用独立 PayPal API。
- 银行卡信息交给支付平台内嵌组件处理；PayPal 等方法可能在其应用或网站完成授权，再返回本站查看结果。
- 前端金额不参与真实计价。正式房价和库存来自服务端日历；报价有效 10 分钟。创建支付时再次检查库存，并在同一数据库事务内占用入住日期。
- 后端核对签名、订单号、支付会话、实际金额、币种和测试／正式模式，只有 `payment_status=paid` 才确认。浏览器返回地址不会改为“已付款”。
- 已付款的邮件任务持久保存在 `outbox`，失败自动重试，使用稳定幂等键。超过 23 小时仍未确认发送的任务转人工处理，防止跨邮件服务幂等周期重复投递。“已提交邮件服务发送”不等于收件箱已送达。
- 邮箱查询使用 6 位验证码（10 分钟有效，最多 5 次尝试），验证后只能查看该邮箱的订单。确认邮件里的私有订单链接有效 30 天，之后通过邮箱验证查看。

## 待补充配置

| 项目 | 内容 |
|---|---|
| 收款账户 | 待补充：Stripe 商户账户；PayPal、微信、支付宝是否已开通 |
| 商户资料 | 待补充：商户所在国家、结算币种、退款与预订条款 |
| 邮件 | 待补充：Resend 或其他实际发信服务、发信邮箱、已验证域名、客服邮箱 |
| 运行环境 | 待补充：Node.js 24 后端 HTTPS 地址、单实例运行环境、持久磁盘和备份方式 |
| 公寓库存 | 待补充：单元名称、容量、当地时区、每晚价格、费用和可订日历 |
| 渠道同步 | 待补充：OTA／PMS／渠道管理器。当前后端只处理本站库存 |

密钥仅配置在后端环境变量中，不提交到 GitHub，不写入 `commerce-config.js`。

## 安装与验证

1. 在后端环境进入仓库 `server/`，使用 Node.js 24 或更高版本。
2. `npm ci` 安装锁定依赖；`npm test` 运行 16 项本地测试（使用合成数据，不会联系支付或邮件服务）。
3. 复制 `.env.example` 为 `.env`，填写其中配置；复制 `inventory.example.json` 为 `inventory.json`，填写真实日历。每个 `units` 元素包含字符串 `id`、`name`、整数 `capacity`、整数 `cleaning`、整数 `taxes`；每个 `nights` 元素包含 `unit`、`day`（YYYY-MM-DD）、整数 `rate` 和布尔值 `available`。所有金额按最小货币单位提供，零费用必须明确填写 `0`。
4. `TOKEN_SECRET` 至少 32 个随机字符，稳定保存在后端。`PROPERTY_TIMEZONE` 填公寓的 IANA 时区。当前实现仅接受代码中列出的两位小数币种。
5. 将数据库文件放在持久磁盘，`DB_PATH` 指向该文件。此实现按单实例运行；扩展多实例前应将事务和库存约束迁移到共享数据库。
6. 设置 HTTPS 反向代理与 `HOST`／`PORT`，运行 `npm start`。API 不提供静态文件，因此 `.env` 和数据库不会通过该服务暴露。
7. 在 Stripe 中将支付回调指向 `后端地址/api/webhooks/stripe`，订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`；把签名密钥填入 `STRIPE_WEBHOOK_SECRET`。
8. 在 Resend 完成域名验证，填入 `RESEND_API_KEY` 和 `MAIL_FROM`。正式启用前将邮件模板的客服邮箱占位符替换为实际联系方式。
9. 先用测试商户配置完成真实服务商沙盒验证：各已开通渠道、授权中断、重复回调、支付成功、订单私有链接、邮箱验证码、邮件失败恢复。当前自动测试验证接口和业务逻辑，未使用真实商户账户进行沙盒或正式扣款。
10. 确认库存、商户和发信均准备好后，将 `ENABLE_PAYMENTS=true`，`commerce-config.js` 的 `apiBase` 填为实际后端 HTTPS 地址，提交推送前端更新。`GET /api/config` 返回 `enabled:true` 才显示正式付款入口。

## 恢复与人工处理

- 暂停新收款：`ENABLE_PAYMENTS=false`，并将前端 `apiBase` 恢复为空后推送。保留数据库与邮件记录，勿删除已付款订单。恢复演示模式不改变既有真实订单。
- 没收到回调时，在 Stripe 重送对应事件；重复事件不会重复确认或创建第二封付款确认邮件。
- 本地计时结束不会直接释放库存。后台只有确认 Stripe 会话已过期或付款失败后才释放。
- 若创建会话时网络结果不明，保留占用并用原请求重试；没有会话 ID 的异常订单需在商户后台核对后人工处理。
- 异常迟到的成功事件若对应日期已释放，状态转为 `paid_review`；不发送入住确认邮件、不覆盖其他客人的库存。商户核对后安排入住或退款。
- 邮件任务状态 `attention` 需在邮件平台核对是否已接受，再人工决定是否重发。

## 主要接口

`GET /api/config`；`POST /api/quote`；`POST /api/checkout`；`POST /api/webhooks/stripe`；`POST /api/access/request`；`POST /api/access/verify`；`POST /api/orders/list`；`POST /api/orders/read`。

参考：[Stripe 内嵌结账](https://docs.stripe.com/checkout/embedded/quickstart)、[微信支付](https://docs.stripe.com/payments/wechat-pay)、[PayPal](https://docs.stripe.com/payments/paypal)、[支付宝](https://docs.stripe.com/payments/alipay)、[Resend 发信](https://resend.com/docs/api-reference/emails/send-email)、[邮件幂等键](https://resend.com/docs/dashboard/emails/idempotency-keys)。
