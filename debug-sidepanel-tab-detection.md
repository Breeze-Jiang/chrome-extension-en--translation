# 调试会话：sidepanel-tab-detection

- 状态：`[OPEN]`
- 现象：普通 HTTPS Science 文章页仍被侧边栏判定为“不支持当前页面”。
- 期望：侧边栏识别当前 Science 文章标签页并启用翻译。
- 约束：取得运行时证据前不修改业务逻辑。

## 待验证假设

1. Background 查询到的活动标签页不是 Science 文章标签页。
2. `activeTab` 权限不足，导致 `tab.url` 为空。
3. 侧边栏使用的扩展构建不是当前最新 `dist`。
4. 标签切换事件触发后，Background 查询窗口条件仍选择了错误窗口。

## 证据

待收集。
