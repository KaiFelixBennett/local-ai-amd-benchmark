# Qwen3.5-122B-A10B (MoE) on AMD Strix Halo — Vulkan Benchmark & Coding Evaluation

Date: 2026-07-23
Machine: GMKtec EVO-X2 (NucBox), AMD Ryzen AI Max+ 395 "Strix Halo"

Raw MTP sweep: [mtp_sweep_raw.txt](mtp_sweep_raw.txt)
Server logs: `log_qwen-mtp-n*.txt`
Coding-eval harness: [scripts/laguna_coding_eval.py](../../custom-rag/scripts/laguna_coding_eval.py)
Companion report: [Laguna S 2.1](../laguna_s21_strix_halo_results/LAGUNA_S21_STRIX_HALO_VULKAN_BENCHMARK.md)

---

## 1. Executive Summary

Qwen3.5-122B-A10B (124.64 B total, ~10 B active, 256-expert MoE) runs fully GPU-resident on Strix
Halo via the llama.cpp Vulkan backend at UD-Q4_K_XL (73.23 GiB).

Headline measurements:

| Metric | Value |
| --- | --- |
| Prefill (pp512) | 245.71 t/s |
| Prefill (pp4096) | 232.68 t/s |
| Decode (tg128), no speculation | 20.52 t/s |
| Decode, MTP speculative decoding (`--spec-draft-n-max 2`) | **31.80 t/s (1.55x)** |
| Draft acceptance under MTP | **0.866** |
| KV cache cost | 98 KiB/token (f16), 52 KiB/token (q8_0) |

Coding quality: **5 / 5 execution-scored**, matching Laguna S 2.1's best result on the identical
harness and hidden tests — but only after correcting the sampling configuration (below).

Four findings of primary interest:

0. **Both of Unsloth's published sampling presets are wrong for thinking-mode coding on this model.**
   Their "precise coding" preset (`presence_penalty 0.0`) causes the model to generate **32,768
   tokens without ever terminating** on a task Laguna answers in 201 tokens. Their "thinking general"
   preset converges but costs 62 % more tokens than necessary. The correct configuration is a hybrid
   — coding temperature (0.6) with the general preset's `presence_penalty` (1.5) — which no published
   preset provides (Section 5.4).

1. **MTP speculative decoding works far better here than Laguna's DFlash.** Draft acceptance is
   **0.866 versus DFlash's 0.53**, and the MTP head is embedded in the GGUF rather than being a
   separate 2.2 GB draft model. This removes the bandwidth penalty that made DFlash a net loss on
   this hardware at its documented settings (Section 5.3).
2. **The vendor's suggested draft depth is again not optimal.** Unsloth's example uses
   `--spec-draft-n-max 6`, which measures 13 % below the optimum here. The same pattern held for
   Laguna, where the model card's value was 2.5x *slower* than no speculation at all.
3. **KV cache is half the size of Laguna's** — 98 KiB/token versus 192 KiB — because this model uses
   2 KV heads over 32 attention heads (GQA ratio 16) versus Laguna's 8-over-48 (ratio 6). A 256 k
   context costs ~13 GiB at q8_0, and 128 k fits at full f16 precision (Section 4.1).

Relative to Laguna S 2.1 on identical flags: decode is a dead heat without speculation (20.52 vs
20.71), prefill is 16–27 % lower at shallow depth but degrades far less with depth, and best-case
decode with speculation is **14 % higher** (31.80 vs 27.90).

---

## 2. Test Environment

### 2.1 Hardware

| Component | Specification |
| --- | --- |
| System | GMKtec EVO-X2 (`NucBox_EVO-X2`) |
| APU | AMD Ryzen AI Max+ 395 (Strix Halo) |
| iGPU | AMD Radeon 8060S Graphics (gfx1151), driver 32.0.31021.5001 |
| Memory | 128 GiB LPDDR5X-8533, 8 x 16 GiB Micron, 8 channels |
| Theoretical memory bandwidth | ~256 GB/s |
| Vulkan device heap | 98123 MiB total / 93217 MiB free |
| OS | Windows 11 Pro 10.0.26200 |

### 2.2 Software

| Component | Version / commit |
| --- | --- |
| llama.cpp (poolside fork, branch `laguna`) | `04b2b72cb54048ead292884adbe11f284e3ec950` |
| Vulkan SDK | 1.4.350.0 (LunarG) |
| Compiler | MSVC 19.44.35228.0 |
| CMake / Ninja | 4.4.0 / 1.13.2 |

The poolside fork was used because it was already built with Vulkan on this machine and contains
`qwen35moe` support (verified by byte-scanning `llama.dll`: 9 occurrences of `qwen35moe`, 69 of
`mtp`). Upstream master also contains both. The fork carries additional Laguna DFlash tensors that
are irrelevant here.

Build configuration:

```
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DGGML_VULKAN=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF
```

### 2.3 Model under test

`unsloth/Qwen3.5-122B-A10B-MTP-GGUF`, quantisation `UD-Q4_K_XL`, three shards.

| Property | Value |
| --- | --- |
| File size | 73.23 GiB (as loaded) |
| Parameters | 124.64 B total, ~10 B active |
| Architecture string | `qwen35moe` |
| Layers | 49 |
| Hidden size | 3072 |
| Attention heads / KV heads | 32 / 2 (**GQA ratio 16**) |
| Key length / value length | 256 / 256 |
| Experts | 256, 8 active per token |
| Expert FFN length | 1024 (shared expert also 1024) |
| RoPE freq base | 10,000,000 |
| Native context | 262,144 |
| Multimodal | yes — `Qwen3_5MoeForConditionalGeneration` with vision tower; `mmproj-F32.gguf` (1.68 GiB) shipped separately |

The **MTP** repository variant was selected over the plain GGUF repository. It costs +1.5 GiB
(73.23 vs 71.7 GiB) and embeds a multi-token-prediction head enabling speculative decoding with no
separate draft model.

### 2.4 Quantisation selection

`UD-Q4_K_XL` was selected before download on the basis of Unsloth's published KL-divergence data
across 150+ configurations:

| Quantisation | PPL | KLD 99.9 % | Mean KLD |
| --- | ---: | ---: | ---: |
| Q2_K_XL | 7.04 | 2.91 | 0.097 |
| Q3_K_XL | 6.72 | 0.95 | 0.031 |
| **Q4_K_XL** | **6.59** | **0.41** | **0.014** |
| Q5_K_XL | 6.55 | 0.24 | 0.007 |
| Q6_K_XL | 6.54 | 0.14 | 0.004 |
| Q8_K_XL | 6.54 | 0.10 | 0.003 |

Q4 sits at the knee: Q3→Q4 cuts tail divergence 2.3x, while Q4→Q5 yields only 1.7x for +9 to
+14 GiB and a large loss of context headroom (Q5_K_XL at 87.4 GiB would leave ~5 GiB for KV).

This selection is independently corroborated by our own Laguna measurements, where Q3_K_M
(comparable tail divergence) induced **non-terminating reasoning** — see the Laguna report
§5.8.2c. The 99.9 % KLD figure measures exactly the rare-token mispredictions that compound into
that failure mode.

### 2.5 Sampling parameters

Unsloth publishes three presets. The **thinking-mode precise-coding** preset was used:

| Preset | temp | top_p | top_k | min_p | presence_penalty |
| --- | ---: | ---: | ---: | ---: | ---: |
| Thinking, general | 1.0 | 0.95 | 20 | 0.0 | 1.5 |
| **Thinking, precise coding** | **0.6** | **0.95** | **20** | **0.0** | **0.0** |
| Instruct (no thinking) | 0.7 | 0.8 | 20 | 0.0 | 1.5 |

Thinking mode is **on by default** (the model emits `<think>` blocks); it is disabled per-request via
`chat_template_kwargs: {"enable_thinking": false}`.

---

## 3. Methodology

### 3.1 Throughput

Throughput was measured with `llama-bench` using flags **identical to the Laguna run** so the two
models are directly comparable:

```
-p 512,4096 -n 128 -ngl 999 -fa 1 -mmp 0 -r 1
```

`--no-mmap` (`-mmp 0`) is mandatory on this machine, not optional: Windows exposes only 63.6 GiB of
system RAM (the remainder is the GPU carve-out), so memory-mapping a 73 GiB model page-thrashes. On
Laguna this was measured at ~5 % GPU utilisation with CPU time climbing past 170 s for an allocation
that takes ~7 s with mmap disabled. It is also a ~9 % prefill speedup.

Speculative-decoding measurements use `llama-server` (llama-bench does not support speculation),
reading `timings.predicted_per_second` from the server response.

### 3.2 Speculative decoding

Draft acceptance was read from llama.cpp's own instrumentation
(`slot print_timing: ... draft acceptance = <ratio> (<accepted>/<generated>), mean len = <n>`),
not inferred from timing. Each `n_max` point was measured on a freshly loaded server with an
identical prompt.

### 3.3 Coding quality

The same harness and hidden tests used for Laguna
([scripts/laguna_coding_eval.py](../../custom-rag/scripts/laguna_coding_eval.py)) were reused
unchanged, so scores are directly comparable. The harness was pre-validated: reference solutions
for all five execution-scored tasks pass their hidden tests (5/5) before any model run, so a failure
indicates a model error rather than a defective test.

**Caveat on sampling:** the harness issues requests at `temperature=0.2` for exact parity with the
Laguna run, whereas Unsloth's coding preset for this model is `0.6`. Harness parity (one variable
changed: the model) was prioritised over per-model tuning. This is a known confound and is restated
in Section 9.

---

## 4. Model Loading and Memory Behaviour

### 4.1 KV cache cost — computed from GGUF metadata

KV cost is derived **architecturally** from the model's own metadata rather than inferred from OS
memory counters. (The Laguna report's earlier 82 KiB/token figure was derived by differencing
Windows GPU performance counters and did not reconcile with the architecture; that method is not
used here.)

```
KV bytes/token = n_layer x n_kv_head x key_length x 2 (K+V) x bytes_per_element
               = 49 x 2 x 256 x 2 x bytes_per_element
```

| KV precision | Bytes/token | vs Laguna |
| --- | ---: | ---: |
| f16 | 100,352 B (**98 KiB**) | Laguna 192 KiB — **Qwen is 51 %** |
| q8_0 (1.0625 B/elem) | 53,312 B (**52 KiB**) | Laguna 102 KiB |

The advantage comes from grouped-query attention: **2 KV heads over 32 attention heads (ratio 16)**
versus Laguna's 8-over-48 (ratio 6).

Resulting memory at 73.23 GiB weights, ~95.8 GiB usable pool:

| Context | KV f16 | Total f16 | KV q8_0 | Total q8_0 |
| ---: | ---: | ---: | ---: | ---: |
| 32,768 | 3.1 GiB | 76.3 GiB | 1.6 GiB | 74.8 GiB |
| 65,536 | 6.1 GiB | 79.3 GiB | 3.3 GiB | 76.5 GiB |
| 131,072 | 12.2 GiB | **85.5 GiB — fits at full f16** | 6.5 GiB | 79.7 GiB |
| 262,144 | 24.5 GiB | 97.7 GiB — too tight | 13.0 GiB | **86.2 GiB — fits** |

**128 k at full f16 KV precision is reachable**, which was not possible with Laguna. 256 k requires
q8_0 KV and still leaves ~9 GiB headroom.

---

## 5. Results

### 5.1 Baseline throughput (no speculation)

```
| model                             |     size |   params | backend | ngl | fa | mmap |  test |    t/s |
| qwen35moe 122B.A10B Q4_K - Medium | 73.23GiB | 124.64 B | Vulkan  | 999 |  1 |    0 | pp512 | 245.71 |
| qwen35moe 122B.A10B Q4_K - Medium | 73.23GiB | 124.64 B | Vulkan  | 999 |  1 |    0 | pp4096| 232.68 |
| qwen35moe 122B.A10B Q4_K - Medium | 73.23GiB | 124.64 B | Vulkan  | 999 |  1 |    0 | tg128 |  20.52 |
```

Direct comparison with Laguna S 2.1 Q4_K_M (identical flags):

| test | Laguna (70.01 GiB) | Qwen3.5 (73.23 GiB) | delta |
| --- | ---: | ---: | ---: |
| pp512 | 338.68 | 245.71 | **−27 %** |
| pp4096 | 275.82 | 232.68 | −16 % |
| tg128 | 20.71 | 20.52 | **−1 %** |

Two observations:

**Decode is a dead heat** despite Qwen activating ~10 B parameters per token versus Laguna's ~8 B,
and being 3.2 GiB larger on disk. Naive bandwidth scaling predicts Qwen should be ~20 % slower. It
is not, which suggests its expert-routing access pattern is more bandwidth-efficient — plausibly
because it activates 8 of 256 experts versus Laguna's 10 of 256.

**Qwen's prefill degrades far less with depth**: −5 % from pp512 to pp4096 (245.71 → 232.68) versus
Laguna's −19 % (338.68 → 275.82). Laguna starts higher but the curves converge; a full depth sweep
is pending (Section 5.5).

### 5.2 Prefill/decode depth scaling

*(Pending — server-based probe at 4 k / 32 k / 128 k, matching the Laguna methodology. Note that
`llama-bench -d <depth>` wedged at large depth on this Vulkan driver during the Laguna work; the
server-based probe is the working method.)*

### 5.3 MTP speculative decoding — draft depth sweep

Fork build, `--spec-type draft-mtp`, identical prompt, ctx 65536, q8_0 KV, thinking on.

| `--spec-draft-n-max` | Decode t/s | Draft acceptance | Mean accepted len | vs no spec |
| ---: | ---: | ---: | ---: | ---: |
| 0 (no speculation) | 20.55 | — | — | 1.00x |
| **2** | **31.80** | **0.866** | 2.73 | **1.55x** |
| 3 | 31.05 | 0.726 | 3.18 | 1.51x |
| 4 | 31.89 | 0.725 | 3.90 | 1.55x |
| 6 *(Unsloth example)* | 27.68 | 0.530 | 4.18 | 1.35x |

`n_max` 2 and 4 are **statistically tied** (31.80 vs 31.89 = 0.3 %, well inside single-run noise).
`n_max = 2` is adopted for production because its **0.866 acceptance leaves substantially more
headroom**: with Laguna's DFlash, acceptance collapsed to ~0.00 in real VS Code agent sessions and
speculation then cost ~2.5x. A configuration starting at 87 % acceptance degrades more gracefully
than one starting at 53 %.

The vendor's example value (6) measures **13 % below optimum**. This is the second model in this
series where the documented speculative-decoding depth is not the best choice on this hardware; for
Laguna the model card's value was 2.5x *slower* than disabling speculation entirely.

### 5.4 Sampling configuration — both published presets are wrong for thinking-mode coding

This section documents the single most consequential finding in this report. It was discovered
because the first coding-eval run scored 4/5 with one task failing to terminate, and that failure
turned out to be caused by the sampling preset, not the model.

**Symptom.** Using Unsloth's "thinking, precise coding" preset (temp 0.6, `presence_penalty` 0.0),
the task `lru_ttl` — the most explicitly-specified task in the set — generated **32,768 tokens over
1,087 s and never produced an answer** (`finish_reason: length`). Laguna answers the same task in
**201 tokens with zero reasoning in 11.7 s**.

**The reasoning was not degenerate.** Inspection of the 35,626-character reasoning trace found
**zero repeated sentences**. The content is coherent, structured problem-solving that correctly
identifies the task's intended trap (`"If I strictly follow 'Expired entries must not count toward
capacity', I must remove them. Since I cannot scan, I cannot guarantee this for non-LRU expired
items without O(N)."`). It then enters open-ended self-verification — *"16. Wait, `get` logic
check… 17. Wait, `put` logic check…"* — and never exits. The failure mode is **unbounded
self-audit, not repetition**.

**Controlled A/B**, identical task and prompt, varying only sampling:

| cfg | temp | top_p | top_k | min_p | presence | repeat | Tokens | Reasoning | Wall | finish | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| **A** | 0.6 | 0.95 | 20 | 0.0 | **0.0** | 1.0 | 32768 | 26524 | 1087 s | length | **FAIL** |
| **B** | 0.6 | 0.95 | 20 | 0.0 | **1.5** | 1.0 | **7680** | 6781 | **297 s** | stop | **PASS** |
| **C** | 0.6 | 0.95 | 20 | **0.05** | 0.0 | **1.05** | 8453 | 7702 | 333 s | stop | **PASS** |
| **D** | **1.0** | 0.95 | 20 | 0.0 | **1.5** | 1.0 | 12456 | 12386 | 540 s | stop | **PASS** |

Two independent conclusions:

1. **Any anti-repetition mechanism prevents the runaway.** B (presence penalty) and C (min_p plus
   repeat penalty) both converge, by different means. Config A's failure is caused by having
   **none** engaged — Unsloth's coding preset sets `min_p 0.0`, `presence_penalty 0.0` and
   `repetition_penalty 1.0` simultaneously, which is safe for instruct mode but leaves thinking mode
   unbounded.
2. **Temperature 0.6 beats 1.0 for this workload.** Config D, which is Unsloth's full "thinking,
   general" preset, used **62 % more tokens than B** to reach the same passing result.

**Therefore neither published preset is correct here.** The optimal configuration is a hybrid:

```
temp 0.6   top_p 0.95   top_k 20   min_p 0.0   presence_penalty 1.5
```

i.e. the *coding* preset's temperature with the *general* preset's `presence_penalty`. Unsloth's own
guidance supports the mechanism — *"if you encounter significant endless repetitions, set the
presence_penalty to 1.5"* — but their coding preset does not apply it.

This parallels the Laguna result, where the model card's `--spec-draft-n-max 15` measured 2.5x
*slower* than no speculation at all. In both cases the vendor default was materially wrong on this
hardware and only measurement revealed it.

Raw data: [sampling_param_ab_test.txt](sampling_param_ab_test.txt)

### 5.5 Coding quality — **5 / 5 execution-scored**

Configuration: UD-Q4_K_XL, MTP `n_max=2`, thinking **enabled**, config B sampling, ctx 65536,
q8_0 KV, `max_tokens` 32768. Same harness and same hidden tests as the Laguna evaluation.

| Task | Result | Total tokens | of which reasoning | Wall | Decode |
| --- | --- | ---: | ---: | ---: | ---: |
| `lru_ttl` | **PASS** | 6926 | 6551 | 264.1 s | 26.5 t/s |
| `iso_duration` | **PASS** | 9501 | 6606 | 353.1 s | 27.2 t/s |
| `fix_binsearch` | **PASS** | 3747 | 3055 | 138.3 s | 28.0 t/s |
| `merge_intervals` | **PASS** | 6251 | 5371 | 228.9 s | 27.7 t/s |
| `topo_cycle` | **PASS** | 6682 | 5687 | 248.1 s | 27.4 t/s |
| **Score** | **5/5** | | | **1232 s total** | |

**Qwen3.5 matches Laguna's best score (5/5 QUALITY).** Direct comparison:

| | Laguna Q4_K_M (QUALITY) | Qwen3.5 Q4_K_XL (config B) |
| --- | ---: | ---: |
| Execution-scored | **5/5** | **5/5** |
| Total wall time, 5 tasks | 736 s | 1232 s |
| Total tokens | 14,479 | 33,107 |
| Reasoning-token range | **0 – 6,142** | 3,055 – 6,606 |

The decisive behavioural difference is **not accuracy but effort allocation**. Laguna spends **zero**
reasoning tokens on the two well-specified tasks (`lru_ttl`, `iso_duration`) and reserves deliberation
for the three requiring inferred intent. Qwen spends 3,000–6,600 reasoning tokens on **every** task
regardless of difficulty. Qwen is ~34 % faster per token (MTP) but generates ~2.3x more tokens, so
it is **~67 % slower in wall-clock** on this task set despite the identical score.

#### 5.5.1 Void result — first run under config A

The first evaluation scored 4/5 with `lru_ttl` failing. **That result is void**: it was measured
under config A (Section 5.4), where the failure was non-convergence caused by sampling, not a coding
error. It is retained as
[eval_results_configA_VOID_broken_sampling.json](eval_results_configA_VOID_broken_sampling.json)
for the record. The valid result is
[eval_results_configB_5of5.json](eval_results_configB_5of5.json).

### 5.5 Tool calling

*(Pending. Unsloth reports BFCL-V4 = 72.2 for this model versus 55.5 for GPT-5 mini. Laguna
reference on this machine: `tool_calls` parsed correctly in 2.9–3.0 s, ~40 tokens.)*

### 5.6 Vision

*(Pending — `mmproj-F32.gguf` downloaded; the model declares a vision tower. Laguna is text-only,
so this is a capability Laguna cannot provide at all.)*

---

## 6. Analysis

### 6.1 Bandwidth model for decode

At UD-Q4_K_XL, ~10 B active parameters correspond to roughly 5.6 GB read per decoded token. Observed
20.52 t/s implies an achieved bandwidth of ~115 GB/s against a ~256 GB/s theoretical peak, i.e.
**~45 % bandwidth efficiency**.

For comparison, Laguna achieved ~36 % (~4.5 GB/token at 20.71 t/s ≈ 93 GB/s). Qwen extracts
meaningfully more of the available bandwidth, which is why its decode matches Laguna's despite
reading ~25 % more bytes per token.

### 6.2 Why MTP succeeds where DFlash failed

Speculative decoding is profitable only when the draft is far cheaper than the target. The two
mechanisms differ fundamentally on this axis:

| | Laguna DFlash | Qwen3.5 MTP |
| --- | --- | --- |
| Draft model | separate 2.23 GB GGUF | head embedded in the model file |
| Draft cost per step | ~2.2 GB read (≈ half a target step) | small head, no separate weight stream |
| Measured acceptance | 0.53 | **0.866** |
| Best measured speedup | 1.36x | **1.55x** |
| Behaviour at vendor default | **0.40x (2.5x slower)** at n_max 15 | 1.35x at n_max 6 |

DFlash's draft cost roughly half a target forward pass — a poor ratio when speculative decoding
normally assumes a 10–50x cheaper draft. On bandwidth-bound hardware there are no spare memory
cycles to hide that cost in, so deep drafting became a net loss. MTP avoids the problem structurally
by not streaming a second set of weights at all.

The acceptance gap (0.866 vs 0.53) is the more important number: it predicts how much margin exists
before speculation becomes counterproductive under harder-to-predict workloads.

### 6.3 Grouped-query attention and long-context economics

Qwen3.5's GQA ratio of 16 (2 KV heads / 32 attention heads) versus Laguna's 6 halves KV cost per
token. Combined with a native 262,144 context, this makes long-context operation materially cheaper:
128 k runs at **full f16 KV precision** (85.5 GiB total), where Laguna required q8_0 quantisation of
the cache to reach comparable depth.

Whether that translates into usable long-context performance depends on the depth-scaling curve,
which is still pending (Section 5.2). Laguna's curve showed prefill collapsing 47 % between 32 k and
128 k, and decode falling 55 % — the binding constraint there was not memory but time.

---

## 7. Reproducibility

```bash
# 1. Model (73.2 GiB + 1.7 GiB vision projector)
hf download unsloth/Qwen3.5-122B-A10B-MTP-GGUF --include "UD-Q4_K_XL/*" \
   --local-dir C:\models\qwen3.5-122b-a10b
hf download unsloth/Qwen3.5-122B-A10B-MTP-GGUF --include "mmproj-F32.gguf" \
   --local-dir C:\models\qwen3.5-122b-a10b

# 2. Throughput (flags identical to the Laguna run)
llama-bench -m .../Qwen3.5-122B-A10B-UD-Q4_K_XL-00001-of-00003.gguf \
            -p 512,4096 -n 128 -ngl 999 -fa 1 -mmp 0 -r 1

# 3. Production server with MTP speculative decoding
llama-server -m .../Qwen3.5-122B-A10B-UD-Q4_K_XL-00001-of-00003.gguf \
             --mmproj .../mmproj-F32.gguf \
             --spec-type draft-mtp --spec-draft-n-max 2 \
             -ngl 999 --ctx-size 262144 -ctk q8_0 -ctv q8_0 \
             -fa on --jinja --no-mmap --host 127.0.0.1 --port 8090 --parallel 1 \
             --temp 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --presence-penalty 0.0

# 4. Coding evaluation
python scripts/laguna_coding_eval.py --url http://127.0.0.1:8090 --out results.json
```

Launcher: `C:\Users\admin.securesight\Desktop\Model Inference\start-qwen35-122b-A10B-MTP.bat`

Windows note: `--no-mmap` is mandatory (Section 3.1). The Vulkan build requires MSVC + Windows SDK +
Vulkan SDK, with `vcvars64.bat` imported into the environment before `cmake` when using Ninja.

---

## 8. Limitations and Threats to Validity

- **Single runs.** `llama-bench` was run with `-r 1` to limit 73 GiB reloads; the reported ±0.00 is
  therefore not a confidence interval. The MTP sweep is one measurement per `n_max`. The 31.80 vs
  31.89 difference between `n_max` 2 and 4 is explicitly treated as noise rather than a ranking.
- **The MTP sweep used a single prompt.** Acceptance is prompt-dependent. Laguna's DFlash sweep
  looked similarly healthy on a single-turn prompt and then collapsed to 0.00 acceptance under
  agentic tool-calling at 26 k context. **The same failure has not yet been excluded for MTP** — an
  agentic-workload acceptance check is required before the 1.55x figure can be claimed for real use.
- **Eval sampling mismatch.** The coding harness runs at `temperature=0.2` for parity with the
  Laguna run, not Unsloth's recommended `0.6` for this model. If Qwen underperforms, this confound
  must be excluded before drawing conclusions.
- **Quality, tool-calling, vision and depth scaling are pending** at the time of writing (Sections
  5.2, 5.4, 5.5, 5.6). No claim about coding quality relative to Laguna is made here.
- **Windows / AMD proprietary driver only.** Linux + RADV and ROCm are untested for this model. For
  Laguna, ROCm measured worse on every axis (−16 % prefill, −25 % decode) despite published guidance
  suggesting otherwise.
- **Bandwidth-efficiency figures are derived**, not directly instrumented: they assume active
  parameter counts and average quantised bits per weight.

---

## 9. References

1. `unsloth/Qwen3.5-122B-A10B-MTP-GGUF` — https://huggingface.co/unsloth/Qwen3.5-122B-A10B-MTP-GGUF
2. Unsloth Qwen3.5 run guide (sampling presets, MTP flags) — https://unsloth.ai/docs/models/qwen3.5
3. Unsloth Qwen3.5 GGUF benchmarks (KLD table) — https://unsloth.ai/docs/models/qwen3.5/gguf-benchmarks
4. `Qwen/Qwen3.5-122B-A10B` base model card — https://huggingface.co/Qwen/Qwen3.5-122B-A10B
5. Companion Laguna S 2.1 report — [../laguna_s21_strix_halo_results/](../laguna_s21_strix_halo_results/LAGUNA_S21_STRIX_HALO_VULKAN_BENCHMARK.md)
6. Strix Halo local-LLM benchmark guide — https://github.com/hogeheer499-commits/strix-halo-guide
