# 调试会话：translation-stream-stall

- 状态：`[OPEN]`
- 现象：点击“一键翻译当前网页”后没有可见的流式打字机输出，界面看起来卡住。
- 期望：正文提取完成后，Qwen 返回的翻译增量持续显示在侧边栏中。
- 约束：取得运行时证据前不修改业务逻辑；不记录 API Key、正文或完整译文。

## 假设

1. Background 提取阶段因 Tabs API 隐藏 `tab.url` 而错误返回 `PAGE_RESTRICTED`。
2. Science 页面正文同步提取耗时过长。
3. Qwen 请求已建立，但首个 SSE 增量延迟或请求失败。
4. 增量已到达，但 Hook 的快照发布或状态切换未更新 UI。
5. `md-wx` 高频全量渲染累计 Markdown，造成明显卡顿。

## 证据

修复前日志：

- 翻译会话已启动，设置存在。
- `expectedTabId` 与 `actualTabId` 相同。
- `expectedUrlLength` 为 105，Tabs API 返回的 `actualUrlLength` 为 0。
- `urlsMatch: false`、`actualUrlProcessable: false`，因此 Background 在正文提取前返回 `PAGE_RESTRICTED`。
- Content Script 提取、模型请求和 UI 快照均未发生。

结论：假设 1 已确认；假设 2–5 尚未进入对应执行阶段。

## 修复

提取校验在标签页 URL 被隐藏时复用 Content Script 页面探针，以探针返回的真实 URL 校验当前标签页，然后继续转发正文提取请求。
