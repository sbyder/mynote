# Transformer 机制与高效推理

> 返回总纲：[机器学习知识库.md](./机器学习知识库.md)  
> 序列模型基础：[序列模型与自然语言处理.md](./序列模型与自然语言处理.md)  
> 视频时空 Attention：[视频理解与时空建模.md](./视频理解与时空建模.md)  
> 反向传播与梯度：[反向传播与梯度.md](./反向传播与梯度.md)

本分册补充 Transformer 从基本模块走向现代语言模型推理时的重要机制：Multi-Head Attention、Mask、BERT 预训练、RoPE、KV Cache、GQA 和 FlashAttention。

---

## 1. Transformer 在架构上做了什么

Transformer（*Attention Is All You Need*，2017）最初是 Encoder–Decoder 序列到序列模型。其重要突破是以 Self-Attention 替代循环网络的逐时间步状态传递，使训练时能并行处理多个序列位置。

~~~text
输入 Token ID
   ↓
Embedding + 位置表示
   ↓
Transformer Block × L
   ├── Attention：跨 Token 的动态信息交互
   ├── Residual：已有表示的直接路径
   ├── LayerNorm：稳定特征数值与训练
   └── FFN：逐 Token 非线性特征变换
   ↓
输出隐藏表示
   ↓
任务头：分类 / 下一个 Token / 其他任务
~~~

Attention 决定不同位置如何交换信息；FFN 在每个位置独立运算（不同位置共享相同 FFN 权重），不在 FFN 内部直接进行跨 Token 交换。

Transformer 的模型权重可能很多。**超参数种类相对集中，不等于可训练参数数量少。** 大规模预训练的数据需求还受到模型容量、训练预算、数据质量和任务归纳偏置影响，不能仅由“用了 Transformer”得出必然需要某个固定数据量的结论。

---

## 2. Q、K、V 与 Multi-Head Attention

设 $N$ 个 Token、隐藏维度为 $d_{model}$：

$$
X\in\mathbb R^{N\times d_{model}}
$$

线性投影：

$$
Q=XW_Q,\quad K=XW_K,\quad V=XW_V
$$

缩放点积注意力：

$$
A=\operatorname{softmax}\left(
\frac{QK^\top}{\sqrt{d_k}}+M
\right),\qquad Y=AV
$$

其中 $M$ 表示可选的 Mask（不允许访问的位置可设为 $-\infty$）。

一个注意力头中的：

- Q：当前 Token 想找到什么信息
- K：每个 Token 用于匹配的表示
- V：每个 Token 实际被聚合的内容
- $A$：依赖当前输入的动态注意力权重，而不是固定训练参数

多个头有各自的投影，再拼接并进行输出投影：

$$
\operatorname{MHA}(X)=
\operatorname{Concat}(head_1,\ldots,head_h)W_O
$$

头之间可能学到不同关系，但不保证每个头恰好对应一种人类可命名的语法或语义功能。

### 2.1 Encoder、Decoder 与 Mask

| 结构 | Self-Attention | 典型模型 / 用途 |
|---|---|---|
| Encoder-only | 通常双向，可看整个输入序列 | BERT，文本理解与表示 |
| Decoder-only | 因果 Mask，只能看当前及过去位置 | GPT，自回归生成 |
| Encoder–Decoder | Encoder 双向；Decoder 因果 + Cross-Attention | 原始 Transformer、T5 |

因果 Mask 保证预测下一个 Token 时不读取未来位置；Padding Mask 则阻止模型关注填充 Token。

训练时可在同一轮并行预测多个位置，但自回归推理仍需逐步生成新 Token。

---

## 3. BERT 的 MLM：15% 与 80/10/10 策略

BERT 原始论文（*BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*，2018）使用 Masked Language Modeling（MLM）。

随机选择约 15% 的 Token 位置作为预测目标，对这些被选中的位置：

| 概率 | 输入如何处理 | 训练目标 |
|---|---|---|
| 80% | 换成特殊 Token [MASK] | 恢复原始 Token |
| 10% | 换成随机 Token | 恢复原始 Token |
| 10% | 保持输入 Token 不变 | 恢复原始 Token |

例如原句「我去银行办业务」，若选择「银行」作为目标：

~~~text
80%：我去 [MASK] 办业务 → 目标：银行
10%：我去 苹果 办业务   → 目标：银行
10%：我去 银行 办业务   → 目标：银行
~~~

**无论如何替换，Loss 仍然只在被选中的位置上计算，并使用原始 Token 作为正确答案。**

为何不 100% 使用 [MASK]？

- 预训练时经常出现 [MASK]，普通下游输入却往往没有这个特殊 Token，存在分布差异。
- 随机词替换使模型接触有噪声的输入，不能完全依赖特殊 [MASK] 标记。
- 保持原样让预测位置不总是显式暴露，但这部分目标也可能通过复制输入得到。

这套策略旨在改进上下文表示学习，但不意味着随机替换一定在所有模型和任务中都是最优设计。它是 BERT 原始预训练方案的具体选择。

---

## 4. RoPE：从绝对旋转得到相对位置关系

原始 Transformer 可将正余弦位置向量加到 Embedding 上。RoPE（Rotary Position Embedding，2021）则通常根据位置对每个注意力头的 **Q、K** 做旋转。

### 4.1 二维旋转

$$
R(\theta)=
\begin{bmatrix}
\cos\theta&-\sin\theta\\
\sin\theta&\cos\theta
\end{bmatrix}
$$

将注意力头的向量维度两两分组，每组以不同频率旋转。例如一组的旋转角：

$$
\theta_i(m)=m\omega_i,\qquad
\omega_i=\frac{1}{10000^{2i/d}}
$$

$m$ 是 Token 位置；$d$ 是该注意力头中应用 RoPE 的维度数。实际模型可能修改频率基数或缩放规则。

### 4.2 为什么能体现相对距离

设 Query 在位置 $m$，Key 在位置 $n$，在某个二维子空间内：

$$
q'_m=R(m\omega)q,\qquad
k'_n=R(n\omega)k
$$

点积：

$$
(q'_m)^\top k'_n
=q^\top R(m\omega)^\top R(n\omega)k
=q^\top R((n-m)\omega)k
$$

旋转带来的位置关系依赖于两者的**相对位置差** $n-m$。多个频率的二维组一起为模型提供丰富的位置线索。

注意：

- Q、K 还携带内容信息，Attention 权重不只取决于距离。
- RoPE 的相对位置性质依赖 Q–K 点积的运算结构。
- 把帧特征旋转后堆进普通 Conv2D，并不会自动获得上述相对位置性质。
- RoPE 通常不直接旋转 V，但 V 可经网络其他层间接包含位置信息。

### 4.3 视频中的位置

Video Transformer 可以使用时空 Token 的位置坐标 $(t,h,w)$，并在时间轴和空间轴设计 RoPE 变体。位置编码告诉模型各 Token 的位置关系，但不自动让模型学会最优的时序关联。

### 4.4 长上下文限制

RoPE 具有相对位置性质，不等于天然具备无限长度泛化。超出训练长度后可能出现位置分布外推困难。因此存在位置插值、NTK-aware Scaling、YaRN 等扩展方案。**扩大可用长度不等于模型一定会有效利用所有远处信息。**

---

## 5. KV Cache：自回归推理中的重复计算消除

在因果 Decoder 中，历史 Token 不能看到未来 Token。因此在模型参数固定、推理输入不变、正确处理位置与 Mask 的条件下，追加新 Token 不会改变历史位置已计算好的 K、V。

### 5.1 Prefill 与 Decode

~~~text
Prefill：一次处理整个 Prompt
   ├── 计算各层历史 Token 的 Q、K、V
   └── 保存各层历史 K、V
             ↓
Decode：每次追加一个新 Token
   ├── 只计算新 Token 在各层的表示及 Q、K、V
   ├── 新 Q 查询历史缓存 K + 当前 K
   ├── 使用对应 V 聚合上下文信息
   └── 将新 K、V 追加到对应层的缓存
~~~

**KV Cache 不是整个网络共享的一份缓存**：每个注意力层通常都有自己的历史 K 和 V。

### 5.2 为什么缓存 K、V 而不是历史 Q

新 Token 需要拿自己的 Query 查询所有历史 Key，再聚合 Value。历史 Query 对新 Token 的计算通常用不到。

缓存 K、V 避免历史 Token 重复经过各层投影与其他网络运算。但新 Query 仍需与历史 K 做点积、读取历史 V：

- 避免大量重复计算。
- 不会消除随着上下文长度增加的历史注意力读取与计算。
- 需要用显存存储历史缓存。

注意，双向 Encoder 的历史表示可能因加入新 Token 而改变，上述缓存可复用性主要依赖**因果计算结构**。

### 5.3 KV Cache 的显存公式

对于批次大小 $B$、层数 $L$、缓存长度 $T$、KV 头数 $H_{kv}$、每头维度 $d_h$、单元素字节数 $b$：

$$
M_{KV}\approx
2BLTH_{kv}d_hb
$$

前面的 2 表示 K 和 V 各一份。它不计模型权重、额外中间激活、分配碎片等。

示例（单序列）：

| 配置 | 数值 |
|---|---:|
| 层数 $L$ | 32 |
| Token 长度 $T$ | 8192 |
| KV 头数 $H_{kv}$ | 8 |
| 每头维度 $d_h$ | 128 |
| 每元素字节数 $b$ | 2（BF16） |
| KV Cache | **约 1 GiB** |

显存瓶颈会随批次大小和上下文长度增加而扩大。

### 5.4 RoPE 与缓存怎么配合

一种常见实现会缓存已经经过 RoPE 位置旋转的历史 K：

$$
K'_t=R(t)K_t
$$

下一步只需对新 Q、K 按新位置旋转，再与历史旋转后的 K 计算注意力。必须维护正确的位置索引，不能把历史缓存当作新位置重复旋转。

---

## 6. MHA、MQA、GQA：减少缓存头数

传统 Multi-Head Attention（MHA）通常每个 Query Head 有对应的 K、V Head。

- **MHA**：$H_q=H_{kv}$。
- **MQA（Multi-Query Attention）**：许多 Query Head 共享同一组 K、V，通常 $H_{kv}=1$。
- **GQA（Grouped-Query Attention）**：若干 Query Head 分组共享 K、V，$1<H_{kv}<H_q$。

例如 32 个 Query Head，8 个 KV Head，则每 4 个 Query Head 共享一组 K、V。

~~~text
Q1 Q2 Q3 Q4 ─┐
             ├── KV Head A
Q5 Q6 Q7 Q8 ─┤
             └── KV Head B
... 其余分组
~~~

在每头维度和其他设置固定时，KV Cache 大小与 $H_{kv}$ 成正比，因此 GQA 可以显著降低显存占用与读取带宽需求。它也改变了模型结构，精度与效率之间要实测平衡。

---

## 7. FlashAttention：同样的密集注意力，更好的执行方式

朴素实现的全局 Attention：

$$
A=\operatorname{softmax}(QK^\top/\sqrt{d_k})
$$

往往需要显式构造并读写 $N\times N$ 的注意力矩阵。对于长序列，这带来巨大显存压力和显存读写成本。

FlashAttention 的核心是 IO-aware 的分块计算与在线 Softmax：

- 在片上高速存储中处理适当大小的 Q/K/V 分块。
- 避免把完整注意力矩阵落到 GPU 高带宽显存中。
- 在数学意义上计算精确的密集 Attention（允许正常浮点误差）。

**它不等于只关注少量 Token，也不把标准密集注意力的计算复杂度直接变成线性。**

| 技术 | 解决问题 | 是否完整密集注意力 |
|---|---|---|
| KV Cache | 自回归生成重复计算 | 保留原有注意力关系 |
| FlashAttention | Attention 内存读写与中间矩阵 | 是 |
| GQA | KV Head / Cache 过多 | 每个 Query 仍能读取所有允许的 Token |
| Window / Sparse Attention | Token 两两匹配太昂贵 | 通常限制直接可见的连接 |

---

## 8. 为什么现代显卡仍然无法“无成本”运行超长全局 Attention

对于 $N$ 个 Token、头维度 $d$：

$$
\text{密集 Attention 计算量}\sim O(N^2d)
$$

较大的 GPU 可以运行完整自注意力，FlashAttention 等实现大幅改善了实际速度与显存开销；但当 $N$ 极大时，平方级计算仍然昂贵。

视频尤其明显：假设每帧 196 个 Patch Token，$T$ 帧视频有 $N=196T$ 个 Token，匹配规模：

$$
N^2=(196T)^2
$$

把时间与空间 Attention 分开，匹配数量可近似变为：

$$
O(PT^2+TP^2)
$$

这和 R(2+1)D 的“按结构分解”思想有相通之处，但两者运算本身不同。详见：[视频理解与时空建模.md](./视频理解与时空建模.md)。

---

## 9. 把 Transformer 的三个问题分开

1. **表示什么**：Embedding、位置编码、RoPE、FFN 与残差连接决定表示方式。
2. **交互什么**：Attention、Head 划分、Mask、空间/时间分解决定可交换的信息。
3. **怎样执行**：KV Cache、FlashAttention、批处理和缓存布局决定实际运行成本。

不要把“允许全局交互”“参数规模很大”“推理显存大”混为一个问题：三者既相关，又可以分别优化。

### 代表论文与后续问题

- Vaswani 等，*Attention Is All You Need*（2017）。
- Devlin 等，*BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*（2018）。
- Su 等，*RoFormer: Enhanced Transformer with Rotary Position Embedding*（2021）。
- Shazeer，*Fast Transformer Decoding: One Write-Head is All You Need*（2019，MQA）。
- Ainslie 等，*GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints*（2023）。
- Dao 等，*FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*（2022）。

待进一步展开：

- [ ] Pre-LN 与 Post-LN 对优化的影响
- [ ] KV Cache 在多用户批处理中的管理
- [ ] PagedAttention 与连续批处理
- [ ] RoPE 长上下文外推的经验限制
- [ ] FlashAttention 分块在线 Softmax 推导
- [ ] 不同 Token 选择策略与任务性能的关系
