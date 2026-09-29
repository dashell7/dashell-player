# LangPlayer 1.1.1

## 变更

- 新增“打开英语学习主页”命令：优先打开 Vault 根目录的 `Home.md`，找不到时打开 `README.md`；
- 找不到入口文件时给出明确提示，不影响播放器和字幕功能；
- 版本号同步到 `manifest.json`、`package.json`、`package-lock.json` 和 `versions.json`。

## 用途

该命令用于客户版英语学习 Vault 的首次进入，减少用户在文件列表中寻找入口的步骤。插件单独使用时仍可正常工作。
