# iPhone 原位屏幕翻译

Scripting + 苹果快捷指令：截取英文界面，识别文字位置，调用苹果翻译，再把中文画回截图对应位置。

**v0.2.1 测试版：已完成本地验证；尚未完成 iPhone 端到端运行验收。**

## 安装

在 iPhone 上打开 [最新安装包](https://github.com/qqqqqq219499-cmd/iphone-screen-translation/releases/latest)。

1. 先下载 [ScreenTranslation.scripting](https://github.com/qqqqqq219499-cmd/iphone-screen-translation/releases/latest/download/ScreenTranslation.scripting)，用 Scripting 打开并导入；保留项目名称 **原位屏幕翻译-直装版**。已有同名项目时使用 App 的更新/替换选项。
2. 再下载 [ScreenTranslation.shortcut](https://github.com/qqqqqq219499-cmd/iphone-screen-translation/releases/latest/download/ScreenTranslation.shortcut)，添加到快捷指令；本次需要改用这个修正版，因为旧版翻译动作的输入变量格式错误。下载名使用英文避免 GitHub 去除中文；快捷指令添加后可改为你喜欢的中文名称，但 Scripting 项目名不要改。
3. 如系统询问是否允许从其他 App 粘贴，允许 Scripting 读取本次输入。
4. 从普通英文页面触发，不要在快捷指令编辑器里截屏测试。可将“轻点背面”绑定到此快捷指令。

不需要手动组装七个动作。不需要为了测试预先购买 Scripting PRO。

## 云端更新

`script.json` 的 `remoteResource` 指向本仓库，`autoUpdateInterval` 设置为 3600 秒。
该配置由 Scripting 负责读取、检查和更新，不是脚本自己下载并执行远程代码；实际检查时机取决于 App，不能承诺后台每小时必定执行。

- 项目名称保持不变，快捷指令继续调用同一 Scripting 项目。
- 后续仅脚本逻辑修复时，更新云脚本即可；改动快捷指令动作时仍需重新导入 `.shortcut`。
- 已导入的旧版 v0.2.0 没有远程更新配置，需要先导入本次 v0.2.1 一次。
- GitHub Release 的 `releases/latest` 是稳定入口。这里没有更新或覆盖任何原有 iCloud 分享链接。
- 仓库根目录可作为 Scripting Git 远程资源导入。若要停用自动更新，可在 Scripting 中取消远程资源自动更新配置。

## v0.2.1 修复

翻译动作 `WFInputText` 从裸 `WFTextTokenAttachment` 改成带 U+FFFC 占位符和 `attachmentsByRange` 的 `WFTextTokenString`。
旧格式在用户 iPhone 上显示为空的“文本”占位；本次修正的是这一明确可见的问题，不能据此保证其他 iPhone 集成环节已经通过。
语言选择沿用用户截图中已正确显示的英语（美国）与中文（中国大陆）。

## 隐私和限制

- 运行时会覆盖本机剪贴板。`localOnly` 禁止 Handoff 同步，但不使剪贴板变成私有存储。
- 截图和文字不上传到本仓库或签名服务；苹果翻译是否联网取决于系统设置及语言包。
- 签名服务 HubSign 只接收通用七动作配置和脚本名，不接收截图或脚本源码。
- 截图缓存正常合成后清理；中断时可能留到下次运行过期检查。OCR 标记文本设置十分钟剪贴板过期。
- 不要重复连续触发。会话 token / 条目数量不匹配时拒绝合成；不猜测错位翻译。
- 译图是查看用的截图，不是可点击的原 App；复杂背景只是近似底色覆盖。
- 原位绘图仍是测试版。首次只用普通英文界面，不要用密码、验证码或银行页面。

## 验证范围

- 17 项本地模拟逻辑检查：OCR/存储/剪贴板/回调失败、标记错配、缓存过期、渲染释放等。
- 1 项新增文本变量格式回归检查：修复前失败，修复后通过。
- 已签名归档经解压后，实际七个动作与本地模板逐项一致；脚本 ZIP CRC 和源码一致。
- 未独立校验 Apple CMS 证书链；未在 iPhone 上验证 v0.2.1 导入、粘贴权限、回调、系统翻译和最终显示。

## 接口依据

- [Scripting Script / 远程资源配置](https://scriptingapp.github.io/guide/Script/Script.md)
- [Scripting Pasteboard](https://scriptingapp.github.io/guide/Device%20Capabilities/Pasteboard.md)
- [Scripting Safari / 自定义 URL scheme](https://scriptingapp.github.io/guide/Device%20Capabilities/Safari/index.md)
- [Shortcuts 文本变量格式参考](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/BEST_PRACTICES.md)
- [Cherri 签名实现](https://github.com/electrikmilk/cherri/blob/dc82114f346f77e5cf04987cb0ee4e781302fc32/signing.go)
