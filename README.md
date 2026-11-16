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

## Markdown 组件

普通正文、标题、列表、表格和公式使用原生 Markdown。需要状态和交互时，可直接在 Markdown 的独立段落中写 `{@body}` 和 JSX，也可以使用 `dil` 围栏。组件默认显示预览，点击「编辑源码」可修改。

~~~markdown
{@body const [value, setValue] = DIL.useState(3);}

<box gap={2}>
  <slider min={1} max={10} value={value} onChange={setValue} aria-label="数值" />
  <text>当前数值：{value}</text>
  {value > 5 && <badge label="大于 5" />}
  <button onClick={() => setValue(3)}>重置</button>
</box>
~~~

| 用途 | 支持的 DIL 标签 | 常用参数 |
| --- | --- | --- |
| 布局 | `box`、`row`、`col`、`grid`、`grid-item`、`flow`、`flow-item`、`card`、`divider`、`spacer` | `gap`、`padding`、`align`、`justify`、`wrap`、`columns`、`rows`、`minChildWidth`、`span`、`rowSpan`、`flex`、`width`、`height`、`background`、`border`、`radius`、`aspectRatio` |
| 文本 | `text`、`title`、`caption`、`label`、`badge`、`bold`、`italic`、`underline`、`strikethrough` | `size`、`color`、`weight`、`strong`、`textAlign`、`truncate`、`maxLines`、`highlight`、`pill`、`variant` |
| 交互 | `button`、`pressable`、`input`、`textarea`、`slider`、`checkbox`、`select`、`radio-group`、`radio`、`segmented-control`、`date-picker`、`form` | `value`、`defaultValue`、`onChange`、`onClick`、`min`、`max`、`step`、`options`、`disabled`、`variant`、`size`、`color` |
| 可视化 | `Chart`、`AppBlock`、原生 `svg` 元素 | Chart 支持 `line`、`bar`、`scatter`、`pie`；SVG 可组合节点、路径、渐变、裁剪和滤镜 |

支持 JSX 嵌套、片段、JS 属性表达式、条件渲染和数组映射。每个交互块有独立状态。`DIL` 提供 `useState`、`useEffect`、`useCallback`、`useMemo`、`useRef`、`useId`、`useTheme` 和 `useBreakpoint`（返回 `sm` / `md` / `lg`）。`slider.onChange` 接收数字，`checkbox.onChange` 接收布尔值，`button.onClick` 和 `form.onSubmit` 无参数。数值型 `gap`、`padding`、`rowGap`、`columnGap` 按 4pt 间距单位换算。

文本与布局组件支持常用样式属性；控件支持受控值、默认值、禁用状态和事件。Markdown 原生已支持的标题、列表、表格和 LaTeX 公式仍优先使用 Markdown，不重复实现。当前实现的是可在本地静态笔记中运行的组件子集；依赖宿主数据源的异步媒体、地图和实体引用组件暂不支持。DIL `AppBlock` 可用 `content={html字符串}`，内部通过 `window.appBlock.bind` 读取数据，外部更新会触发 `appblock:bind` 事件。

| 围栏名 | 内容 |
| --- | --- |
| `Chart` | JSON 对象，包含 `content` 和可选 `id`。图表支持 `line`、`bar`、`scatter`、`pie`。 |
| `AppBlock` | 自包含的 HTML、CSS、JavaScript。也可使用 JSON，详见下文。 |
| `svg` | 完整的 `<svg>` 元素，用于流程图和其他自定义图示。 |

~~~markdown
```Chart
{
  "id": "training-loss",
  "content": {
    "chartType": "line",
    "xKey": "epoch",
    "series": [{"dataKey": "loss", "label": "训练损失"}],
    "data": [{"epoch": 1, "loss": 0.8}, {"epoch": 2, "loss": 0.5}],
    "xAxisLabel": "轮次",
    "axisLabel": "损失",
    "yAxisMin": 0,
    "xAxisScale": "linear"
  }
}
```

```AppBlock
<button onclick="this.textContent = '已点击'">点一下</button>
```
~~~

`Chart.content` 还可使用 `valueSuffix`、`yAxisMax`。横向柱状图设置 `layout: "horizontal"`，折线图和散点图的 `xAxisScale` 可用 `"linear"` 或 `"time"`，默认按输入顺序显示分类。饼图使用一个数据系列。

JSON 形式的 `AppBlock` 用 `content` 保存 HTML 字符串。可带 `app_block_id`、`bind`、`bundle_version`、`entrypoint`、`icon`、`id`、`language`、`title`、`variant`。组件脚本通过 `window.appBlock.bind` 读取初始值，其余字段保存在 `window.appBlock` 中，`title` 用作预览名称。MyNote 的 AppBlock 运行内联脚本和样式，外部入口和宿主状态绑定采用本地元数据表示。SVG 预览禁用脚本。

「示例 / 学习笔记.md」包含三种组件。旧的 `html-demo` 围栏仍可打开。

## 草稿

编辑内容保存在当前浏览器。切换文档或刷新后仍可继续编辑，也可以用「下载 .md」导出。当前版本没有 GitHub 写回和提交功能。

## GitHub Pages

在仓库的 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。

推送到 `main` 会触发 **Deploy MyNote to GitHub Pages**，构建并发布 `dist/`。切换发布源后，也可以从仓库的 **Actions** 页面手动运行该工作流。默认站点地址为 <https://sbyder.github.io/mynote/>。
