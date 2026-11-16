# MyNote

在浏览器里浏览目录并原位编辑 Markdown。编辑器使用 Milkdown Crepe，支持标题、列表、任务清单、表格、代码块和 LaTeX 公式。

## 运行

需要 Node.js 22.12 或更新版本。

```bash
npm ci
npm run dev
```

打开终端显示的地址。也可以运行 `npm run build` 生成静态文件，或用 `npm run preview` 本地预览构建结果。

## 放入笔记

把 `.md` 文件放到 `public/notes/`，保留你原来的子目录。可以在页面左上方选择其中一个目录，也可以直接展开左侧目录树。相对路径图片放在对应位置，例如 `public/notes/机器学习/images/pooling.png` 可以在同目录笔记中通过 `![池化](images/pooling.png)` 引用。

开发模式新增笔记后刷新即可。静态站点需要重新构建才能更新笔记目录。整个 `public/` 会随构建输出，部署到公开站点时请只放愿意公开的内容。

## 草稿

编辑内容保存在当前浏览器。切换文档或刷新后仍可继续编辑，也可以用「下载 .md」导出。当前版本没有 GitHub 写回和提交功能。

## GitHub Pages

在仓库的 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。

推送到 `main` 会触发 **Deploy MyNote to GitHub Pages**，构建并发布 `dist/`。切换发布源后，也可以从仓库的 **Actions** 页面手动运行该工作流。默认站点地址为 <https://sbyder.github.io/mynote/>。
