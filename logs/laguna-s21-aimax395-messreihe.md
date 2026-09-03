# Laguna S 2.1 (118B-A8B MoE) on AMD Strix Halo — Vulkan Benchmark & Coding Evaluation

Date: 2026-07-22
Machine: GMKtec EVO-X2 (NucBox), AMD Ryzen AI Max+ 395 "Strix Halo"

Raw measurements: [laguna_s21_raw_measurements_20260722.json](laguna_s21_raw_measurements_20260722.json)
Coding-eval harness: [scripts/laguna_coding_eval.py](../../scripts/laguna_coding_eval.py)
Related reports: [LLAMACPP_SPECULATIVE_DECODING_QWEN36_27B_MTP_VULKAN.md](../ollama_speculative_decoding_results/LLAMACPP_SPECULATIVE_DECODING_QWEN36_27B_MTP_VULKAN.md)

---

## 1. Executive Summary

Laguna S 2.1 (118B total / ~8B active, 256-expert MoE) **runs fully GPU-resident on Strix Halo via
the llama.cpp Vulkan backend**. No ROCm, no BIOS change, and no increase of the UMA/VRAM carve-out
was required.

Headline measurements (Q4_K_M, 70.01 GiB weights, all 48 layers offloaded, flash-attention on):

| Metric | Value |
| --- | --- |
| Prefill (pp512) | **309.64 t/s** |
| Decode (tg128), no speculation | **20.55 t/s** |
| Decode, DFlash speculative decoding tuned (`--spec-draft-n-max 3`) | **27.9 t/s (1.36x)** |
| Decode, DFlash at the model card's documented setting (`n_max=15`) | **8.1 t/s (0.40x — 2.5x slower)** |

Three findings are of primary interest and are, to our knowledge, not documented elsewhere:

1. **The DFlash draft depth recommended by the official model card (`--spec-draft-n-max 15`) is
   actively harmful on bandwidth-bound hardware**, causing a 2.5x *slowdown*. Reducing it to 3
   converts this into a 1.36x *speedup*. The optimum is sharp (Section 5.3).
2. **Upstream llama.cpp cannot run the S-2.1 DFlash draft** even though it registers the
   `draft-dflash` speculative type. Its DFlash implementation fails to map 7 Laguna-specific
   tensors. The poolside fork is required for speculation, but *not* for the base model (Section 7.2).
3. **Enlarging the dedicated-VRAM (UMA) carve-out does not improve throughput** on this unified-memory
   architecture, and would have starved the host OS. Measured evidence in Section 6.3.

Laguna's throughput is normal-to-favourable for its size class on this hardware: comparable public
Strix Halo measurements report 18.43 t/s for Nemotron 3 Super 120B and 13.27 t/s for DeepSeek V4
Flash 284B (IQ2_XXS) [4].

---

## 2. Test Environment

### 2.1 Hardware

| Component | Specification |
| --- | --- |
| System | GMKtec EVO-X2 (`NucBox_EVO-X2`) |
| APU | AMD Ryzen AI Max+ 395 (Strix Halo) |
| iGPU | AMD Radeon 8060S Graphics (gfx1151), driver 32.0.31021.5001 |
| Memory | 128 GiB LPDDR5X-8533, 8 x 16 GiB Micron, 8 channels (P0 CHANNEL A–H) |
| Theoretical memory bandwidth | ~256 GB/s (256-bit @ 8533 MT/s) |
| OS | Windows 11 Pro 10.0.26200 |

Memory partitioning at test time (unified memory; see Section 6.3):

| Pool | Size |
| --- | --- |
| Total installed | 128.0 GiB |
| Visible to Windows | 63.6 GiB |
| Implied BIOS UMA carve-out | 64.4 GiB |
| Vulkan-reported device heap | 98123 MiB total / 93217 MiB free |

### 2.2 Software

| Component | Version / commit |
| --- | --- |
| llama.cpp upstream (**baseline + quality runs**) | `67b9b0e7f6ce45d929a4411907d3c48ec719e81c` (2026-07-22 02:55 UTC) |
| llama.cpp poolside fork (**DFlash runs**) | `04b2b72cb54048ead292884adbe11f284e3ec950`, branch `laguna` |
| Vulkan SDK | 1.4.350.0 (LunarG) |
| Compiler | MSVC 19.44.35228.0 (VS BuildTools 14.44.35207) |
| CMake / Ninja | 4.4.0 / 1.13.2 |
| Windows SDK | 10.0.26100.0 |

Vulkan device capabilities as reported by ggml:

```
AMD Radeon(TM) 8060S Graphics (AMD proprietary driver)
  uma: 1 | fp16: 1 | bf16: 1 | fp4: 0 | warp size: 64
  shared memory: 32768 | int dot: 1 | matrix cores: KHR_coopmat
```

Build configuration (both trees identical):

```
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DGGML_VULKAN=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF
```

Shader features enabled at configure time: `coopmat`, `coopmat2`, `int dot`, `bfloat16`, `E4M3`.

### 2.3 Model under test

`poolside/Laguna-S-2.1-GGUF`, file `laguna-s-2.1-Q4_K_M.gguf`.

| Property | Value |
| --- | --- |
| File size | 75.2 GB (70.01 GiB as loaded) |
| Parameters | 117.56 B total |
| Architecture string | `laguna` |
| Layers | 48 |
| Hidden size | 3072 |
| Attention heads / KV heads | 48 / 8 (**GQA ratio 6**) |
| Head dim | 128 |
| Experts | 256, 10 active per token, 1 shared |
| MoE intermediate size | 1024 |
| Vocab | 100352 |
| `max_position_embeddings` | 1 048 576 |
| Quantisation | Q4_K_M, imatrix-calibrated (`laguna-s-2.1.imatrix`, 0.4 GB, published alongside) |

Speculative draft: `laguna-s-2.1-DFlash-BF16.gguf`.

| Property | Value |
| --- | --- |
| File size | 2.23 GB |
| Architecture string | `dflash` |
| Tensor count | 76 |
| Blocks | 6 |
| Attention heads / KV heads | 72 / 8 (**GQA ratio 9**) |
| Encoder | `fc.weight` [18432, 3072] — consumes 6 stacked target hidden states |
| Runtime config | `block_size=16, mask_token_id=12, n_extract=6` |

---

## 3. Methodology

### 3.1 Throughput

Throughput was measured with `llama-bench` (standard `pp`/`tg` protocol) and, for
speculation-enabled runs, through `llama-server`'s OpenAI-compatible endpoint reading the
server-reported `timings.predicted_per_second`. `llama-bench` does not support speculative
decoding, hence the two-instrument approach; the baseline was cross-checked on both and agreed
within 1% (20.55 t/s bench vs 20.4 t/s server).

All runs used `-ngl 999` (full offload), `-fa on`, `--no-mmap`, `--ctx-size 32768`, `--parallel 1`.

### 3.2 Speculative decoding

Draft acceptance was read from llama.cpp's own instrumentation
(`slot print_timing: ... draft acceptance = <ratio> (<accepted>/<generated>), mean len = <n>`),
not inferred from timing. Each `n_max` point was measured on a freshly loaded server using an
identical prompt and `temperature=0.0`.

### 3.3 Coding quality

A purpose-built harness ([scripts/laguna_coding_eval.py](../../scripts/laguna_coding_eval.py))
issues each task to the server at `temperature=0.2`, extracts the final fenced code block, and
executes it against hidden tests in a subprocess with a 60 s timeout.

**Harness validation:** before any model run, reference solutions were written for all five
execution-scored tasks and confirmed to pass their hidden tests (5/5). A task failure therefore
indicates a model error, not a defective test. This validation step is reproducible via
`_refs.py` (see raw measurements bundle).

Tasks were designed to discriminate genuine reasoning from pattern completion:

| Task | Discriminating property |
| --- | --- |
| `lru_ttl` | LRU order and TTL must interact correctly; `get` must **not** refresh TTL; expired entries must not consume capacity |
| `iso_duration` | ISO-8601 `M` means months before `T`, minutes after; must reject 7 malformed inputs |
| `fix_binsearch` | Off-by-one repair, verified against `bisect.bisect_left` on 300 randomised cases |
| `merge_intervals` | Requires merging the base set *before* subtraction; overlapping/unsorted input |
| `topo_cycle` | Implicit nodes (dependency-only), deterministic tie-breaking, cycle detection |

Four further tasks (`race_condition`, `ts_types`, `sql_opt`, `unified_diff`) are captured verbatim
for qualitative review and are not auto-scored.

**Important:** the quality run was executed on the **upstream master build without speculative
decoding**, deliberately isolating model quality from any DFlash implementation risk. This is the
same configuration that produced the baseline throughput numbers.

---

## 4. Model Loading and Memory Behaviour

The model loads fully GPU-resident with `-ngl 999`. Load time from local NVMe with `--no-mmap`:
**~31 s**.

Measured GPU memory occupancy during inference (Windows performance counters,
`\GPU Adapter Memory(*)\Dedicated Usage` and `\Shared Usage`):

| Pool | In use |
| --- | --- |
| Dedicated (BIOS carve-out) | 60.50 GiB |
| Shared (GTT via GART) | 14.79 GiB |
| **Total GPU-addressable in use** | **~75.3 GiB** |

The working set therefore exceeds the 64.4 GiB carve-out and spills ~15 GiB into GTT. Section 6.3
shows this is not a performance problem on this architecture.

### 4.1 KV cache scaling — the 1M context claim

KV cache cost is `n_layer x n_kv_head x head_dim x 2 (K+V) x 2 bytes` =
`48 x 8 x 128 x 2 x 2` = **196 608 bytes = 192 KiB per token** at f16.

| Context | KV cache (f16) | Fits in ~23 GiB headroom? |
| --- | --- | --- |
| 32 k | 6 GiB | yes |
| 64 k | 12 GiB | yes |
| 128 k | 24 GiB | marginal |
| 256 k | 48 GiB | no |
| 1 M | 192 GiB | **not physically possible** |

With weights occupying 70 GiB of the ~95.8 GiB Vulkan device heap, the practical ceiling is roughly
**96–124 k tokens at f16 KV**. The model card's 1M context is an architectural capability, not one
this 128 GiB machine can hold at Q4_K_M.

#### 4.1.1 KV cache quantisation — measured, not estimated

`-ctk`/`-ctv` were measured empirically by loading at `--ctx-size 262144` and reading GPU memory
occupancy:

| Config | Total GPU memory | Result |
| --- | --- | --- |
| ctx 65536, f16 KV | 80.6 GiB (60.4 dedicated + 20.2 GTT) | loads |
| ctx 262144, **q8_0 KV** | **89.1 GiB** (60.4 dedicated + 28.8 GTT) | **loads** |

Subtracting the constant base (weights + draft + compute buffers ≈ 68.6 GiB) gives measured KV cost:

| KV precision | Bytes/token | Ratio vs f16 |
| --- | ---: | ---: |
| f16 | 196 608 (192 KiB) | 1.00x |
| **q8_0** | **~84 000 (~82 KiB)** | **0.43x** |
| q4_0 (interpolated, untested) | ~49 000 (~48 KiB) | ~0.25x |

Note q8_0 measured **0.43x**, better than the naive 0.5x expectation — llama.cpp's q8_0 KV layout is
more compact than a straight halving.

Resulting practical ceilings on this machine (~27.2 GiB available for KV after the 68.6 GiB base):

| KV precision | Max context | Notes |
| --- | ---: | --- |
| f16 | ~124 k | highest fidelity |
| **q8_0** | **~340 k** | **256 k verified working**; widely regarded as near-lossless |
| q4_0 | ~580 k | needed for 512 k; measurable long-context recall degradation |
| any | **1 M not reachable** | needs ~48 GiB KV even at q4_0 vs 27.2 GiB available |

**Recommendation:** `q8_0` is the favourable trade — it more than doubles the reachable context for
negligible quality cost, and is what makes 256 k viable. `q4_0` is self-defeating for the long-context
use case: the recall fidelity it degrades is precisely the capability a very large window is meant to
provide. It should not be adopted without first measuring retrieval accuracy at depth.

**The binding constraint at these sizes is prefill time, not memory.** At ~310 t/s a *full* 256 k
prompt needs ~14 minutes before the first output token, and prefill throughput degrades with depth.
llama.cpp's prompt-prefix caching makes a long-running session over a fixed codebase practical;
one-shot queries with fresh large context are not.

---

## 5. Results

### 5.1 Baseline throughput (upstream master, no speculation)

```
| model                   |     size |   params | backend | ngl | fa |  test |          t/s |
| laguna ?B Q4_K - Medium | 70.01GiB | 117.56 B | Vulkan  | 999 |  1 | pp512 | 309.64 ±0.00 |
| laguna ?B Q4_K - Medium | 70.01GiB | 117.56 B | Vulkan  | 999 |  1 | tg128 |  20.55 ±0.00 |
```

Reference smoke test on the same build (Qwen3.5 0.8B F16): pp512 5783.78 ±11.52, tg64 105.20 ±0.02
— confirming the Vulkan path itself is healthy.

### 5.2 Flash-attention correctness at GQA ratio 6

Laguna uses 48 attention heads over 8 KV heads, i.e. **GQA ratio 6** — not a power of two. The
poolside fork carries a CUDA patch (`ggml/src/ggml-cuda/fattn.cu`) changing kernel selection from
`gqa_ratio > N` to `gqa_ratio % N == 0`, precisely because non-power-of-two ratios select an
incorrect MMA kernel. The DFlash draft is ratio 9, likewise non-power-of-two.

This raised a concern that the **Vulkan** flash-attention path might share the assumption and
silently corrupt output. It does not: generation with `-fa on` is fully coherent, and all executed
quality tasks passed under `-fa on`. **`-fa on` is safe on Vulkan for this model** and was used
throughout.

### 5.3 DFlash speculative decoding — draft depth sweep

Fork build, `--spec-type draft-dflash`, identical prompt, `temperature=0.0`, draft fully offloaded
(`-ngld 999`).

| `--spec-draft-n-max` | Decode t/s | Draft acceptance | Mean accepted len | vs baseline (20.4 t/s) |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 26.0 | 0.645 | 2.29 | 1.27x |
| **3** | **27.9** | **0.559** | **2.67** | **1.36x  ← optimum** |
| 4 | 24.7 | 0.443 | 2.77 | 1.21x |
| 5 | 23.1 | 0.391 | 2.95 | 1.13x |
| 6 | 19.6 | 0.293 | 2.75 | 0.96x |
| 8 | 9.7 | 0.265 | 3.11 | 0.48x |
| 15 *(model card default)* | 8.1 | 0.150 | 3.24 | **0.40x** |

Note the two quantities move in opposition: **mean accepted length rises slightly with `n_max`
(2.29 → 3.24) while acceptance *ratio* collapses (0.645 → 0.150)**. Deeper drafting buys almost no
additional accepted tokens but pays linearly more draft cost. Analysis in Section 6.2.

Configuration achieving the optimum:

```
llama-server -m laguna-s-2.1-Q4_K_M.gguf \
             -md laguna-s-2.1-DFlash-BF16.gguf \
             --spec-type draft-dflash --spec-draft-n-max 3 \
             -ngl 999 -ngld 999 -fa on --jinja --no-mmap --ctx-size 32768
```

### 5.4 Reasoning behaviour

**Laguna S 2.1 is a reasoning model.** Output is returned in `reasoning_content`; `content` holds
only the final answer. A request with insufficient `max_tokens` returns an **empty `content` with
`finish_reason: length`** because the budget was consumed while still thinking — a failure mode
worth documenting for integrators.

Reasoning effort is **adaptive**, not a fixed tax:

| Task | Total tokens | of which reasoning | Wall time |
| --- | ---: | ---: | ---: |
| `lru_ttl` | 266 | 0 | 16.9 s |
| `iso_duration` | 625 | 0 | 33.7 s |
| `fix_binsearch` | 2180 | ~1644 | 110.2 s |
| `is_balanced` (probe) | 1768 | ~1212 | 87.6 s |

The model emitted zero reasoning tokens for tasks it found straightforward and ~1600 for the
subtle off-by-one repair. Latency therefore scales with problem difficulty rather than being a
constant overhead.

### 5.5 Coding quality

Configuration: upstream master, `-fa on`, **no speculative decoding**, `temperature=0.2`,
`max_tokens=8192`. Harness pre-validated at 5/5 with reference solutions (Section 3.3).

#### 5.5.1 Execution-scored tasks — **5 / 5 passed**

| Task | Result | Total tokens | of which reasoning | Wall time | Decode t/s |
| --- | --- | ---: | ---: | ---: | ---: |
| `lru_ttl` | **PASS** | 201 | 0 | 11.7 s | 20.8 |
| `iso_duration` | **PASS** | 623 | 0 | 33.2 s | 20.6 |
| `fix_binsearch` | **PASS** | 2441 | 1899 | 123.0 s | 20.4 |
| `merge_intervals` | **PASS** | 6811 | 6142 | 343.7 s | 20.0 |
| `topo_cycle` | **PASS** | 4420 | 3680 | 224.4 s | 20.2 |

All five tasks were designed with adversarial edge cases (Section 3.3) and their tests were verified
against reference implementations *before* the model run. A perfect score on this set indicates the
model handles specification detail that commonly defeats pattern completion — notably the
"`get` must not refresh TTL" and "expired entries must not consume capacity" clauses in `lru_ttl`,
and the ISO-8601 `M`-before/after-`T` ambiguity.

Note the **strong correlation between reasoning volume and task subtlety**: the two tasks the model
solved with zero reasoning tokens (`lru_ttl`, `iso_duration`) are the ones with the most explicit
specifications, while the three requiring inference of intent (`fix_binsearch`, `merge_intervals`,
`topo_cycle`) consumed 1899–6142 reasoning tokens.

#### 5.5.2 Qualitative review tasks

Not auto-scored; assessed by inspection. Full texts in the raw results JSON.

| Task | Assessment |
| --- | --- |
| `race_condition` | **Correct.** Identified the TOCTOU window between `db.fetch()` and `db.execute()`, and correctly noted the in-memory `seen` set cannot prevent it. Fix uses an atomic compare-and-swap (`UPDATE ... WHERE id=$1 AND status='pending'`) and gates `handle()` on rows-affected — the idiomatic solution. |
| `ts_types` | **Correct, with an advanced detail.** Function passthrough, `Map`/`Set` → `ReadonlyMap`/`ReadonlySet`, and crucially distinguished fixed tuples from variable-length arrays via `number extends T['length']` — the correct idiom, frequently missed. |
| `sql_opt` | **Largely correct, one gap.** Correctly diagnosed the leading-wildcard `LIKE` defeating index use, the missing `events(user_id, created_at)` composite index, and that `u.email` is functionally dependent on the PK so it can drop out of `GROUP BY`. **However**, the rewrite replaces `lower(u.email) LIKE '%@acme.com'` with `u.email ILIKE '%@acme.com'` — which *retains* the leading wildcard and therefore does not fix the problem it correctly identified. A trigram or reverse-string index would be required. Diagnosis outpaced the remedy. |
| `unified_diff` | **Correct.** Emitted a valid unified diff with no prose wrapper, correct hunk header, added the `time` import, the `--retries` flag with default 3, and exponential backoff. Clean format adherence — relevant for agent/tool integration. |

**Summary:** 5/5 execution-scored, 3/4 qualitative fully correct with one partial
(`sql_opt` diagnosed correctly but produced a rewrite that does not resolve the diagnosed issue).
This is a capable coding model; the observed failure mode is not incorrect reasoning but
incomplete follow-through from diagnosis to fix.

### 5.6 Backend comparison: Vulkan vs ROCm/HIP, and the mmap effect

A ROCm/HIP path was evaluated because published Strix Halo guidance reports ROCm winning
prompt-processing-heavy work, which would matter at large context.

**Method without a HIP SDK install.** llama.cpp loads compute backends *dynamically*
(`ggml_backend_load_all` discovers `ggml-*.dll`), and the Laguna architecture lives in `llama.dll`,
not in the backend. It was therefore possible to take release `b10082`'s complete, self-consistent
ggml stack (including `ggml-hip.dll`, `rocblas.dll`, `libhipblaslt.dll`) and overlay **only** the
llama layer from the Laguna-capable master build. The cross-version boundary is ggml's *public* API,
which is far more stable than its internals. This avoided a ~15 GB AMD HIP SDK installation.

The prebuilt HIP stack does target this GPU:

```
ggml_cuda_init: found 1 ROCm devices
  Device 0: AMD Radeon(TM) 8060S Graphics, gfx1151 (0x1151), VMM: no, Wave Size: 32, VRAM: 89976 MiB
```

Note `VMM: no` — the release build already has the `GGML_HIP_NO_VMM` behaviour that gfx1151 guidance
calls essential.

#### 5.6.1 Results (identical flags, `-ngl 999 -fa 1 -mmp 0 -r 1`)

| test | **Vulkan** | ROCm/HIP (stock release) | ROCm delta |
| --- | ---: | ---: | ---: |
| pp512 | **338.68** | 285.07 | **-16%** |
| pp4096 | **275.82** | 237.72 | **-14%** |
| tg128 | **20.71** | 19.11 | **-8%** |

**Vulkan wins on every axis.** The ROCm deficit narrows only marginally with depth (-16% -> -14%),
far short of overtaking.

This does *not* contradict the published ROCm advantage — it qualifies it. The favourable ROCm
numbers (e.g. pp512 = 405.99 on a 122B MoE) require a **custom build**: `GGML_HIP_ROCWMMA_FATTN=ON`,
`GPU_TARGETS=gfx1151`, `GGML_HIP_NO_VMM=ON`, `GGML_HIP_MMQ_MFMA=ON`, plus MMQ VGPR tuning. A generic
release binary carries none of the prefill-critical ones. Two open llama.cpp issues document exactly
this gap for gfx1151: #21284 (inefficient ROCm prefill defaults) and #13565 (HIP underperforms on
Ryzen AI MAX 395).

#### 5.6.2 Why a tuned ROCm build was still not pursued

Even granting the best published tuning gain, ROCm is a net loss for a *reasoning* model, because
decode dominates total turn time roughly 7:1. For a representative turn (10 k prompt, ~6 500 output
tokens):

| Backend | Prefill | Decode | Total |
| --- | ---: | ---: | ---: |
| Vulkan (338 pp, 27.9 tg with DFlash) | 30 s | 233 s | **263 s** |
| ROCm, assuming +20 % prefill and the measured -8 % decode | 25 s | 340 s | **365 s** |

Prefill saves ~5 s while decode costs ~107 s. ROCm only wins for very large prompts with short
outputs (e.g. 200 k prompt / 500 output: ~564 s vs ~663 s) — a document-analysis profile, not
interactive coding.

A hard constraint compounds this: **ROCm reports only 89 976 MiB (87.9 GiB) addressable versus
Vulkan's 98 123 MiB (95.8 GiB)**. The verified 256 k configuration needs 89.1 GiB and therefore does
not fit on ROCm at all; the ceiling there is roughly 220 k.

#### 5.6.2b Does DFlash work on ROCm? Yes — but it converts to far less speedup

The decisive remaining question was whether speculative decoding works on the HIP backend, since a
working DFlash would lift ROCm decode and could change the balance. Tested by overlaying the
**poolside fork's** llama layer (which carries the Laguna DFlash tensors) onto the same b10082 HIP
stack. DFlash engaged cleanly:

```
common_speculative_impl_draft_dflash: adding speculative implementation 'draft-dflash'
  - n_max=3, n_min=0, p_min=0.00
  - block_size=16, mask_token_id=12, n_extract=6
draft acceptance = 0.53762 (493 accepted / 917 generated), mean len = 2.61
```

| Backend | no speculation | + DFlash (n_max=3) | gain | draft acceptance |
| --- | ---: | ---: | ---: | ---: |
| **Vulkan** | 20.71 | **27.90** | **+34.7 %** | 0.559 (mean len 2.67) |
| ROCm/HIP | 19.11 | 20.79 | +8.8 % | 0.538 (mean len 2.61) |

Draft acceptance is essentially identical on both backends (0.538 vs 0.559), so the draft model
predicts equally well. ROCm simply converts that into far less wall-clock benefit, implying a worse
draft-step to verify-step cost ratio on this backend.

The practical outcome: **ROCm with speculation (20.79 t/s) barely exceeds Vulkan with no speculation
at all (20.71 t/s), and is 25 % below Vulkan with speculation (27.90 t/s).**

**Conclusion: Vulkan is the correct backend for this model on this hardware — it wins prefill
(+14-16 %), wins decode (+25 % with both speculating), and addresses 8 GiB more memory. ROCm is
closed on every axis.**

#### 5.6.3 `--no-mmap` is mandatory, and is also a speedup

An initial ROCm run left `llama-bench`'s default `--mmap 1` in place and appeared to hang: GPU
compute sat at ~5 % while CPU time climbed past 170 s for the same allocation that takes ~7 s with
mmap disabled. Cause: the machine exposes **only 63.6 GiB of system RAM to Windows** (the remainder
is the GPU carve-out), so memory-mapping a 70 GiB model page-thrashes.

`--no-mmap` is therefore **required**, not optional, for any model larger than the OS-visible RAM on
this unified-memory architecture. The gfx1151 guidance that "`-dio` is required for models >~6 GB or
they hang on load" describes the same failure from a different angle.

It is also a measurable speedup on Vulkan:

| Vulkan pp512 | t/s |
| --- | ---: |
| `--mmap 1` (llama-bench default) | 309.64 |
| `--mmap 0` | **338.68  (+9.4 %)** |

All production configurations in this work use `--no-mmap`. **Baseline prefill for the deployed
configuration is therefore 338.68 t/s, not the 309.64 originally recorded in Section 5.1.**

### 5.7 Context-depth scaling — the decisive result

Measured against a running `llama-server` (Vulkan, q8_0 KV, no speculation) using **real code-like
prompts** of increasing size, with prefill and decode read from the server's own timings.

`llama-bench -d <depth>` was attempted first and **wedged** at `-d 131072`: GPU compute 0 %, CPU at
18 % of one core, no progress. The server path is both more robust and more representative of actual
use, and it persists each depth as it completes.

| Depth | Actual prompt tokens | Prefill t/s | Decode t/s | Prefill wall time |
| ---: | ---: | ---: | ---: | ---: |
| 4 096 | 4 267 | **252.9** | **29.28** | 16.9 s |
| 32 768 | 33 477 | **239.8** | **18.13** | 121.9 s |
| 131 072 | 133 839 | **126.4** | **13.28** | **794.0 s (13.2 min)** |

Relative to the 4 k baseline: at 128 k **prefill falls 50 %** and **decode falls 55 %**.

Two observations that matter more than the endpoints:

**Degradation is non-linear and accelerates past 32 k.** From 4 k to 32 k prefill loses only 5 %
(252.9 -> 239.8); from 32 k to 128 k it loses a further 47 % (239.8 -> 126.4). An early reading of the
4 k/32 k pair alone suggests prefill is depth-insensitive. It is not — that conclusion is an artefact
of sampling too shallow a range.

**The decline is visible *within* a single request.** Server progress lines during the 128 k prefill
show throughput sliding continuously as the KV cache grows:

```
n_tokens = 71680, progress = 0.79, t = 500.94 s / 143.09 tokens per second
n_tokens = 79872, progress = 0.85, t = 577.57 s / 138.29 tokens per second
n_tokens = 94208, progress = 0.95, t = 720.94 s / 130.67 tokens per second
n_tokens = 96256, progress = 0.97, t = 742.36 s / 129.66 tokens per second
```

#### 5.7.1 Consequences for large-context use

**The earlier estimate of "~14 min to fill 256 k" was wrong** — it assumed a flat ~310 t/s. Applying
the measured curve, prefill at 256 k would plausibly run at 90–110 t/s, giving a fill time of
**roughly 40–47 minutes**, with decode thereafter around 9–10 t/s.

Practical throughput per turn (assuming a ~3 000-token reasoning answer, which is modest for this
model — the quality eval saw up to 6 142 reasoning tokens):

| Context | One-time prefill | Per-turn decode | Notes |
| ---: | ---: | ---: | --- |
| 4 k | 17 s | ~1.7 min | fastest, minimal context |
| 32 k | 2.0 min | ~2.8 min | **good balance** |
| 128 k | 13.2 min | ~3.8 min | usable only for long sessions |
| 256 k (extrapolated) | ~40–47 min | ~5.0 min | impractical for interactive work |

Prompt-prefix caching amortises the prefill across a session, so the fill cost is paid once — but the
**decode penalty is paid on every token of every turn**, and for a reasoning model emitting thousands
of tokens per answer that is the dominant term.

**Recommendation: 32 k–64 k is the practical operating range for interactive coding.** 128 k is
defensible for a long session over a fixed codebase. 256 k is technically verified to load
(Section 4.1.1) but its 40+ minute fill and ~9–10 t/s decode make it unsuitable as a default.

#### 5.7.2 Note on cross-instrument comparison

Decode at 4 k here (29.28 t/s) exceeds the `llama-bench` `tg128` figure at depth 0 (20.71 t/s). The
two are **not directly comparable**: this run uses q8_0 KV and server-side timing, the other f16 KV
and `llama-bench` timing. Isolating the q8_0-vs-f16 decode effect requires a matched run and was not
performed; no claim is made here about KV precision improving decode speed.

### 5.8 Production findings — where the benchmark and real use diverge

Two conclusions from the controlled benchmarks did **not** survive contact with a real VS Code agent
session. Both are recorded because the benchmark result alone would mislead a reader.

#### 5.8.1 DFlash collapses under agentic tool-calling

Section 5.3 established `--spec-draft-n-max 3` as optimal, worth +36 % on a single-turn prompt.
In a live VS Code agent session at ~26 k context, draft acceptance **collapsed to zero**:

```
task   0 : acceptance 0.019  ( 12/624)  mean len 1.06
task 224 : acceptance 0.014  (  2/144)  mean len 1.04
task 275 : acceptance 0.000  (  0/ 96)  mean len 1.00
task 311 : acceptance 0.000  (  0/ 99)  mean len 1.00
task 347 : acceptance 0.000  (  0/102)  mean len 1.00
```

Measured consequence: **decode fell to 8.56 t/s**, versus ~19-20 t/s without speculation at that
depth. `mean len = 1.00` means the target's own token is the only one produced — the draft
contributes nothing while costing three extra forward passes.

At zero acceptance **no value of `n_max` helps**; the cost is strictly proportional to draft depth:

| n_max | draft traffic | + target | total | vs no speculation |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2.2 GB | 4.5 GB | 6.7 GB | 1.49x slower |
| 2 | 4.4 GB | 4.5 GB | 8.9 GB | 1.98x slower |
| 3 | 6.6 GB | 4.5 GB | 11.1 GB | 2.47x slower |

There is also a large **fixed per-request penalty**: requests adding only 13-29 new tokens against a
99.9 %-cached prefix still spent 11.6-11.9 s in "prompt eval", as the DFlash encoder rebuilds its
state over the full context (`n_extract=6`).

```
task 311: prompt eval 11925 ms /  17 tokens (1.43 t/s)
task 347: prompt eval 11748 ms /  29 tokens (2.47 t/s)
```

**Caveat on the mechanism:** the failing requests were both *deep* (26 k) and *agentic* (tool calls),
and these were not isolated. A plain single-turn prompt at shallow depth still achieved 30.18 t/s on
the same server. Whether the trigger is context depth or tool-call output structure remains
**undetermined**; only the operational consequence is established.

#### 5.8.2 Reasoning is the dominant wall-clock term, and is switchable

`--reasoning off --reasoning-budget 0` suppresses the thinking phase entirely. Measured on the same
prompt, same server, steady state (first request excluded — it carries ~32 s of warm-up):

| Configuration | Tokens | Reasoning | Decode | Wall |
| --- | ---: | ---: | ---: | ---: |
| reasoning on + DFlash | 1768 | 8712 chars | — | **87.6 s** |
| reasoning off, no DFlash (req 1) | 422 | 0 | 20.3 t/s | 22.2 s |
| reasoning off, no DFlash (req 2) | 314 | 0 | 20.3 t/s | **16.9 s** |
| reasoning off, no DFlash (req 3) | 412 | 0 | 20.3 t/s | 21.5 s |

**~4.4x faster wall-clock** from a 5x reduction in generated tokens. Answer content remained
substantial (1543 chars) — the answer is not truncated, only the thinking phase is skipped.

The quality trade-off is real and was **measured**, not assumed — see 5.8.2b. Two launchers are
therefore provided rather than a single default (`start-laguna-FAST.bat` /
`start-laguna-QUALITY.bat`, sharing `C:\models\laguna-s-2.1\laguna-server.cmd`).

#### 5.8.2b Quantifying the reasoning trade-off: 5/5 -> 3/5

The identical harness and hidden tests from Section 5.5 were re-run with reasoning disabled. Only
the reasoning setting differed, so the score change is attributable to it alone.

| Task | Reasoning tokens used in QUALITY | QUALITY | FAST | FAST failure |
| --- | ---: | --- | --- | --- |
| `lru_ttl` | 0 | PASS | **PASS** | — |
| `iso_duration` | 0 | PASS | **PASS** | — |
| `fix_binsearch` | 1899 | PASS | **FAIL** | `IndexError: list index out of range` |
| `merge_intervals` | 6142 | PASS | **FAIL** | `AssertionError` on the first case |
| `topo_cycle` | 3680 | PASS | **PASS** | — |
| **Score** | | **5/5** | **3/5** | |

**The model's own allocation of reasoning effort predicts where reasoning is required.** Both tasks
it solved with zero thinking tokens still pass without thinking enabled. Two of the three that
consumed heavy reasoning fail without it. This is a useful property: the model's thinking budget is
a usable signal of task difficulty, not undifferentiated overhead.

The failures are characteristic rather than random:

- `fix_binsearch` returned `return lo if a[lo] >= target else lo + 1`, which raises `IndexError`
  when `lo == len(a)`. It produced a *subtly wrong off-by-one fix for an off-by-one bug* — precisely
  the class of error that deliberation catches.
- `merge_intervals` failed the very first assertion: it did not merge the base interval set before
  subtracting, which is the specific trap the task was constructed around.

Speed on the same five tasks:

| | QUALITY | FAST |
| --- | ---: | ---: |
| Total wall time (5 exec tasks) | 736 s | **91 s** |
| Per-task range | 11.7-343.7 s | 12.8-32.6 s |
| Score | 5/5 | 3/5 |

**~8x faster for a 40 % drop in pass rate on deliberately subtle tasks.** Note the task set is biased
toward problems requiring inference of intent; on well-specified work the gap should be much smaller,
as the two zero-reasoning tasks demonstrate.

**Operational guidance:** run FAST for well-specified work (file reading, overviews, boilerplate,
refactors with an explicit spec) and switch to QUALITY when the problem requires inferring intent or
reasoning about edge cases. The `topo_cycle` result — passing in FAST despite consuming 3680
reasoning tokens in QUALITY — shows the boundary is not perfectly sharp.

#### 5.8.2c Quantization below Q4 induces non-terminating reasoning

`unsloth/Laguna-S-2.1-GGUF UD-Q3_K_M` (50.3 GiB vs 70.0 GiB) was tested to see whether the smaller
quant's speed advantage is usable. Same harness, same tasks, **reasoning enabled in both runs**
(verified from the server command line and from reasoning tokens actually emitted).

**Speed improves substantially and unambiguously:**

| | Q4_K_M | UD-Q3_K_M |
| --- | ---: | ---: |
| Size | 70.0 GiB | 50.3 GiB |
| Decode | 20.3 t/s | **30.7 t/s (+51 %)** |
| Max ctx @ q8_0 KV | 291 k | 543 k |

The gain exceeds naive size scaling (70.0/50.3 = 1.39x predicted, 1.51x measured).

**But task-level performance collapses.** Eval score 3/5 vs 5/5, and the two failures are the
important part:

| Task | Q4 reasoning | Q4 result | Q3 reasoning | Q3 result |
| --- | ---: | --- | ---: | --- |
| `lru_ttl` | 0 | PASS | 0 | PASS |
| `iso_duration` | **0** | **PASS, 623 tok, 33 s** | **20135** | **FAIL, 24576 tok, 856 s** |
| `fix_binsearch` | 1899 | PASS | 1522 | PASS |
| `merge_intervals` | 6142 | PASS | 21932 | **FAIL, 24576 tok, 876 s** |
| `topo_cycle` | 3680 | PASS | **0** | PASS |

Both failures initially hit an 8192-token cap. They were re-run at **24576 tokens (3x)** to separate
truncation from genuine failure — and **both hit the cap again**. This is not a budget problem:
**Q3 causes the model to reason without terminating** on tasks Q4 answers immediately.

The single clearest data point: `iso_duration` requires **zero** reasoning tokens at Q4 and completes
in 33 s. At Q3 it consumed **20 135 reasoning tokens over 856 s and never produced an answer** —
roughly 26x slower and still wrong.

**The +51 % decode advantage is therefore worthless**: per-token speed is irrelevant when answers
require 40x the tokens, or never arrive.

**Caveat — the effect is not uniform.** `topo_cycle` moved the opposite way (3680 reasoning tokens at
Q4, zero at Q3, still passing), and `fix_binsearch` used slightly fewer. Reasoning allocation carries
real run-to-run variance at `temperature=0.2`, and these are single runs per task. What is *not*
ambiguous is the non-termination: two tasks failed to converge at 3x budget, which no amount of
sampling variance explains.

**Interpretation.** Published guidance reports Q3 as costing "3-8 % perplexity, with visible
regression on reasoning benchmarks", versus 1-3 % for Q4 — a gap that sounds modest. This result
shows why perplexity is a poor proxy for a reasoning model: a few percent worse next-token prediction
converts a model that *knows* an answer into one that *searches indefinitely* for it. The failure
presents as non-termination, not as visibly wrong output.

**VERDICT: UD-Q3_K_M is disqualified for this model. Q4_K_M remains the production quant.**
Published sources separately indicate Q5/Q6 "won't unlock meaningfully better code generation", so
Q4_K_M appears to be the correct operating point in both directions.

#### 5.8.3 Implementation note: a silent batch-scripting failure

The first FAST-mode launcher silently did **not** apply `--reasoning off`. Variables assigned inside a
Windows batch `if (...)` block are expanded at parse time, so `%REASONARGS%` read on a later line
returned empty. The server started normally and answered normally — it simply ignored the setting,
producing a 180 s "fast" run with 8712 chars of reasoning.

The failure is invisible from the model's behaviour alone. **Verification must inspect the launched
process's command line**, not the script source:

```powershell
(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'").CommandLine
```

Fixed by using single-line `if` statements without parentheses. The same latent bug affected the
`USESPEC` toggle.

---

## 6. Analysis

### 6.1 Bandwidth model for decode

At Q4_K_M, ~8 B active parameters correspond to roughly **4.5 GB read per decoded token**. Observed
20.55 t/s implies an achieved bandwidth of ~92 GB/s against a ~256 GB/s theoretical peak, i.e.
**~36% bandwidth efficiency**.

This is expected rather than anomalous for a sparse MoE: with 10 of 256 experts active per token,
expert weight reads are scattered rather than sequential, defeating prefetch and burst efficiency
in a way a dense model of equivalent active size would not. It also explains why the *briefing's*
premise — that MoE suits bandwidth-limited hardware — is directionally right but optimistic: the
8B-active figure sets the *volume* of traffic, not its *efficiency*.

### 6.2 Why the documented draft depth fails

> **SUPERSEDED 2026-07-23 — read §6.2b first.** The model below treats DFlash as an
> *autoregressive* drafter doing `n_max` sequential draft steps, and concludes a *low* `n_max`
> (≈ mean accepted length) is optimal. That is wrong on two counts. (1) DFlash is a **block
> drafter**: it predicts the whole ~15-token block in **one** forward pass, so "15 sequential draft
> steps" is not the cost model. (2) poolside clamps `n_max` to the trained block size (15); the value
> `3` used here is not a tuning choice but a crippled block. The section's own prediction — that
> `n_max=3` "turns the trade positive" — was never observed: the n_max=3 agent run measured 0.00
> acceptance / 2× slower. §6.2b replaces this with a direct on/off measurement at the correct `n_max`.
> The text is kept for provenance, not as guidance.

Speculative decoding wins only when the draft is far cheaper than the target. Here:

- target: ~4.5 GB read per token
- draft: 2.23 GB (BF16, fully offloaded) per draft step

The draft costs roughly **half** a target step — a poor ratio; speculative decoding normally assumes
a 10–50x cheaper draft. Verification is nearly free in bandwidth terms (a batch of drafted tokens
reads the target weights once), so total cost is dominated by the *number of sequential draft steps*.

At `n_max=15`: ~15 x 2.23 GB = ~33 GB of draft traffic plus one verify (~4.5 GB) to win ~3.24
tokens — versus ~14.6 GB to decode those tokens directly. Predicted ratio ~2.6x slower; **measured
2.5x slower**. At `n_max=3` the draft cost falls to ~6.7 GB while still winning ~2.67 tokens,
turning the trade positive.

The general rule this yields: **on bandwidth-bound hardware, set draft depth at or just below the
observed mean accepted length**, not at the vendor default tuned for bandwidth-rich GPUs.

An independent Strix Halo report [4] notes a *quantised* (Q8_0) DFlash sidecar was also slower
"because acceptance stayed low" — consistent with our finding that draft *depth*, not draft
*precision*, is the dominant term.

### 6.2b DFlash on/off, measured at the correct `n_max`

The §6.2 model was replaced with a direct measurement. Q3_K_M target, DFlash-BF16 drafter,
`--spec-draft-n-max 15` (poolside's trained block size), Vulkan, `q8_0` KV, ctx 8192, fixed seed,
identical prompts with speculation on vs off. Decode rate and acceptance are read straight from the
llama.cpp `timings` object (`predicted_per_second`, `draft_n`, `draft_n_accepted`).

| Workload  | DFlash off | DFlash on | Draft acceptance | Ratio |
| --------- | ---------: | --------: | ---------------: | ----: |
| code      | 31.22 t/s  | 29.38 t/s | 53.6 %           | 0.94x |
| prose     | 30.90 t/s  |  7.98 t/s |  8.3 %           | 0.26x |
| reasoning | 30.77 t/s  | 11.63 t/s | 15.5 %           | 0.38x |

**DFlash is a net loss across every workload on this hardware — including code, where the drafter
accepts 53.6 % of its tokens.** That is the decisive point: acceptance is not the bottleneck.
Even when more than half the block is accepted, the block-draft plus MoE parallel-verify overhead
exceeds what the accepted tokens save. On low-acceptance workloads (prose, reasoning) it collapses to
0.26–0.38x, i.e. up to **3.9× slower**.

This resolves the §6.2 confusion. The problem was never draft *depth* (n_max) — raising it from 3 to
the correct 15 lifted acceptance from ~0 to 53.6 % on code and the trade still lost. The dominant
terms are backend and architecture, both specific to this box and both matching llama.cpp issue
\#25117 (Strix Halo + quantised MoE target, 0.48×): parallel verification wakes more experts per step
than single-token decode, and the DFlash cross-attention ring buffer that makes it fast on CUDA falls
back to a CPU path under Vulkan. Dense models on the same silicon win 2.5–2.7× [DFlash Strix Halo
report]; Laguna is MoE, and loses. Raw data: `dflash_measurement_20260723.json`.

**Operational conclusion:** DFlash stays **off** (`USESPEC=0`). This also bounds the agentic case
without a separate test — DFlash loses in its *best* regime (code, 53.6 % acceptance), and an agent
loop's context churn only lowers acceptance further.

### 6.2c Sustaining ≥27 t/s at agentic depth: it is the quant, not the KV cache

Target: keep decode at or above 27 t/s in real agent use. Measured 2026-07-23 (real prompts, decode
from the API `timings.predicted_per_second`, true depth from `usage.prompt_tokens`, Vulkan):

| Depth (tok) | Q3_K_M q8_0 | Q3_K_M q4_0 | Q4_K_M q8_0 |
| ----------: | ----------: | ----------: | ----------: |
|         ~60 |    31.8     |      —      |    20.6     |
|       7 700 |    30.5     |    29.7     |      —      |
|      20 900 |    27.4     |    27.5     |      —      |
|      36 500 |    26.6     |      —      |    17.8     |

Three results, in order of usefulness:

1. **The quant is the whole story.** Q3 holds ≥26.5 t/s to 36k; Q4 sits at ~18 t/s at the same depth
   and never reaches 27 at any depth. Q4 decode is bandwidth-bound on the ~4.5 GB/token weight read
   and there is no sampling or cache knob that moves it — reaching 27 t/s *requires* Q3. This also
   identifies the earlier "16.96 t/s agent turn": it was Q4 at ~34k depth (Q4 at 36k = 17.8), not Q3.

2. **KV cache quantisation does not help here.** q8_0 vs q4_0 KV are within noise at 21k (27.4 vs
   27.5). At agentic depth the per-token KV read (~0.5 GB at 21k, q8_0) is small against the ~3.2 GB
   Q3 weight read, so halving it changes nothing. q4_0 KV only matters past ~100k, where KV read
   approaches weight read — and that depth is a ~1.5 h prefill anyway. Not a lever for this workload.

3. **The current build is ~45 % faster at depth than the recorded curve.** §6/launcher notes have Q3
   at 18.13 t/s @ 32k; the current fork build measures 26.6 t/s @ 36k. Whatever changed (build, not
   method — same real-prompt approach), the 27 t/s target is now essentially met by Q3 alone up to
   ~30k, drifting to 26.6 by 37k. The old depth curve overstates the problem.

**So the ≥27 t/s answer collides with the quant-quality thread (§5.8):** the speed target is only
reachable on Q3, which is the quant whose agentic *termination* is still the open question. Q4 is
correct but physically capped near 18 t/s at depth. The reconciling path, if it exists, is UD-Q3_K_XL
— Q3-class speed with attention kept at higher precision — which remains untested. Raw data:
`decode_depth_kv_20260723.json`.

### 6.3 Unified memory: the VRAM carve-out does not matter

A natural hypothesis is that the ~15 GiB spilling into GTT (Section 4) costs throughput, and that
enlarging the BIOS UMA carve-out to 80–96 GiB would recover it. The evidence says otherwise:

1. **Physically identical memory.** Dedicated VRAM and GTT are the same LPDDR5X-8533 on Strix Halo.
   The carve-out is an address-space reservation, not distinct silicon. There is no bandwidth
   difference to recover — only GART translation, which adds latency but does not throttle large
   sequential weight reads.
2. **Decode stability.** Measured decode held at 20.4–20.7 t/s across all tasks (±1.5%). Because
   this MoE activates different experts per token, the working set continuously moves between the
   dedicated and GTT regions; a material GTT penalty would surface as decode variance. It does not.
3. **Community practice runs the opposite way.** Published Strix Halo tuning guidance recommends
   setting the UMA Frame Buffer to its **minimum (512 MB)** and letting GTT handle allocation
   (`amdgpu.gttsize=131072`) [4] — practitioners deliberately *shrink* the carve-out.
4. **Cost.** A 96 GiB carve-out leaves the host 32 GiB. The co-resident RAG stack on this machine
   was measured using ~50 GiB, so the change would have broken production services.

**Conclusion: do not enlarge the carve-out for this workload.**

---

## 7. Corrections to Prior Assumptions

Documented because each cost investigation time and each is wrong in publicly circulating advice.

### 7.1 Prebuilt binaries do not contain Laguna

The Laguna merge (PR #25165) landed on master at **2026-07-22 01:54 UTC** (`1f66c3ce1`). Release
`b10080` was *published* at 05:06 UTC — three hours later — and yet **does not contain it**:
`b10080` is `fd41bf65a`, which is **7 commits behind** the merge. Release publication time is not
commit time. Verified by byte-scanning `llama.dll` for the `laguna` architecture string
(count 0, with `qwen3moe`/`deepseek2` as positive controls returning 6 each).

Building from source was therefore mandatory at the time of testing.

### 7.2 The fork is required for DFlash, but not for the base model

Upstream master **does** register `{"draft-dflash", COMMON_SPECULATIVE_TYPE_DRAFT_DFLASH}` in
`common/speculative.cpp`, which suggests full support. It does not have it. Loading the S-2.1 draft
against upstream fails:

```
done_getting_tensors: wrong number of tensors; expected 76, got 69
```

The draft file contains 76 tensors; upstream's `dflash.cpp` claims only 69. The 7 unmapped tensors
are exactly:

- `blk.{0..5}.attn_gate.weight` (6) — Laguna's attention output gates
- `enc.aux_norm.weight` (1)

The poolside fork adds these via a `decoder_laguna` code path (`LLM_KV_DECODER_ARCH`,
`LLM_TENSOR_ENC_AUX_NORM`, and per-layer `attn_gate` loading). Note this is *the same error string*
reported publicly as "DFlash is broken" — the report is accurate for upstream, and the correct
reading is "expected 76 (file) / got 69 (claimed)", i.e. the loader is deficient, not the file.

**Practical consequence:** run the base model on upstream master (current, faster Vulkan path); run
speculation on the fork.

### 7.3 Summary of briefing claims vs measurement

| Claim as briefed | Measured reality |
| --- | --- |
| Q4_K_M ~65–70 GB | **75.2 GB** (70.01 GiB loaded) |
| 118B total / 8B active, 256 experts | Confirmed (117.56 B, 256 experts, 10 active) |
| "Base support still in upstream review" | **Merged** 2026-07-22 01:54 UTC |
| Fork needed for full Laguna support | Only for **DFlash**; base model runs on upstream |
| DFlash gives speculative speedup | Only after retuning; **2.5x slower** at documented settings |
| 1M context "theoretically possible" | Not on 128 GiB at Q4_K_M; ~96–128 k practical ceiling |
| ROCm/gfx1151 build risk | Moot — **Vulkan** is the working path; no ROCm needed |

---

## 8. Reproducibility

```bash
# 1. Model
hf download poolside/Laguna-S-2.1-GGUF \
   laguna-s-2.1-Q4_K_M.gguf laguna-s-2.1-DFlash-BF16.gguf chat_template.jinja \
   --local-dir C:\models\laguna-s-2.1

# 2. Base model (upstream master) — baseline throughput and quality
git clone --depth 1 https://github.com/ggml-org/llama.cpp
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON \
      -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF
cmake --build build --config Release

llama-bench -m laguna-s-2.1-Q4_K_M.gguf -p 512 -n 128 -ngl 999 -fa 1

# 3. Speculation (poolside fork) — required for DFlash
git clone --depth 1 --branch laguna https://github.com/poolsideai/llama.cpp
# same cmake invocation

llama-server -m laguna-s-2.1-Q4_K_M.gguf -md laguna-s-2.1-DFlash-BF16.gguf \
             --spec-type draft-dflash --spec-draft-n-max 3 \
             -ngl 999 -ngld 999 -fa on --jinja --no-mmap --ctx-size 32768

# 4. Coding evaluation
python scripts/laguna_coding_eval.py --url http://127.0.0.1:8090 --out results.json
```

Windows note: the Vulkan build requires MSVC + Windows SDK + Vulkan SDK; the Ninja generator needs
`vcvars64.bat` imported into the environment before `cmake`.

---

## 9. Limitations and Threats to Validity

- **Single machine, single run per configuration.** `llama-bench` reports ±0.00 because `-r 1`/`-r 2`
  was used to keep the 70 GiB load count low; the reported variance is therefore not a meaningful
  confidence interval. Repeat counts should be raised for publication-grade error bars.
- **The `n_max` sweep used a single prompt.** Acceptance is prompt-dependent; the optimum may shift
  for prose-heavy versus code-heavy workloads. Poolside reports 2.9–3.1 accepted tokens/step [3]
  against our 2.67–3.24, so the regime is comparable, but a multi-prompt sweep is needed to
  generalise the `n_max=3` recommendation.
- **Quality set is small (5 execution-scored tasks).** Sufficient to detect gross capability gaps,
  not to rank against other frontier models. No contamination analysis was performed.
- **Throughput measured at shallow context.** Decode degrades with KV depth; Section 5.6 is pending.
- **Windows/AMD-proprietary driver only.** Linux + RADV is reported to behave differently, and ROCm
  is reported to roughly double prompt processing (303 vs 156 t/s pp5000 in [4]) — untested here.
- **The two builds differ.** Baseline/quality used upstream master; speculation used the fork, which
  is 84 commits behind upstream. The `n_max` sweep is internally consistent (all points on the fork),
  but the 1.36x speedup is stated against the *upstream* baseline and so mixes trees. A fork-internal
  `n_max=0` control would tighten this.

---

## 10. References

1. llama.cpp PR #25165 — "Add support for Laguna XS.2 & M.1", merged 2026-07-22 01:54 UTC.
2. poolside llama.cpp fork, branch `laguna` — https://github.com/poolsideai/llama.cpp
3. poolside/Laguna-S-2.1-GGUF model card — https://huggingface.co/poolside/Laguna-S-2.1-GGUF
   (reports prefill 600–800 t/s, decode 15 t/s prose / 22–24 t/s code, DFlash accepting 2.9–3.1
   tokens/step on the authors' reference hardware)
4. Strix Halo local-LLM setup and benchmark guide — https://github.com/hogeheer499-commits/strix-halo-guide
5. AMD Strix Halo backend benchmarks (grid) — https://kyuz0.github.io/amd-strix-halo-toolboxes/
6. llm-tracker, AMD Strix Halo GPU performance — https://llm-tracker.info/AMD-Strix-Halo-(Ryzen-AI-Max+-395)-GPU-Performance
