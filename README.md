# Castle Knockout H5 Demo

H5skill 重构版城堡拆除试玩：按住决定地面 Z 轴射程，松开后将当前颜色炮弹投向对应深度的同色砖群，触发颜色连锁、支撑解体和向屏幕深处飞散的透视物理。

## 玩法

- 只使用“按住 / 松开”，没有 XY 拖拽瞄准。
- 蓝、红、金三色炮弹按固定队列出现。
- 命中同色核心砖后触发连锁；失去支撑的普通砖随后解体。
- 5 个颜色核心、6 发炮弹，保留 1 发容错。
- 完成或炮弹耗尽后显示 End Card，DOWNLOAD 跳转指定 TapTap 页面。

完整玩法与验收标准见 [H5skill PRD](docs/Castle_Knockout_H5_试玩需求文档_PRD.md)。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

默认打开 `http://localhost:3000`。静态 GitHub Pages 包：

```bash
PAGES_BASE_PATH=/castle-knockout-h5/ \
NEXT_PUBLIC_SITE_URL=https://kamimaomao.github.io/castle-knockout-h5 \
npm run export:pages
```

输出位于 `dist/client/`。

## 验证

```bash
npm test
npm run lint
```

GitHub Pages 由 `.github/workflows/deploy-pages.yml` 在 `main` 推送后自动部署。
