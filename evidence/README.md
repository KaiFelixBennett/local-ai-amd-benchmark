# Evidence

Every throughput figure published in this repository is derived from a file in this
directory. Nothing is hand-typed. If a number in the top-level `README.md` disagrees
with what the parser reads out of these logs, the logs win.

## Verify it yourself

```bash
# 1. confirm the raw files are the ones the numbers came from
cd evidence && sha256sum -c SHA256SUMS && cd ..

# 2. re-derive every published figure from the logs
python scripts/parse_logs.py
```

The parser prints the leaderboard and checks each log against `SHA256SUMS` as it goes.
It needs only Python 3 — no dependencies.

## What is here

| Path | Contents |
|---|---|
| `logs/*.log` | Raw `llama.cpp` server logs, unedited, one per agent run. 3.6 MB total. |
| `reports/*.md` | Full written measurement protocols for the synthetic sweeps and the R9700 production run. |
| `csv/*` | Per-task measurement tables and depth-sweep runs behind the R9700 report. |
| `SHA256SUMS` | Checksum of every file above. |

The logs are `llama-server` telemetry only — `print_timing` slot lines, load and
config output. They carry no prompt text and no response text, so there is nothing
in them to redact.

## Agent runs: figure to log

Decode is the median over responses of **≥ 200 tokens**; prefill the median over
prompts of **≥ 500 tokens**. Both floors are enforced in `scripts/parse_logs.py` and
apply to every figure below. GPU time is decode plus prefill as timed by the server.

| Run | Log | Decode median | n | Prefill median | Tokens | GPU time |
|---|---|--:|--:|--:|--:|--:|
| Qwen3.8-27B UD-Q4_K_XL · R9700 · Moorhuhn | [`qwen38-27b-q4xl-moorhuhn-r9700.log`](logs/qwen38-27b-q4xl-moorhuhn-r9700.log) | 33.69 t/s | 82 | 266.95 t/s | 332,405 | 188.9 min |
| Qwen3.6-27B UD-Q6_K_XL · R9700 · Moorhuhn | [`qwen36-27b-q6-moorhuhn-r9700.log`](logs/qwen36-27b-q6-moorhuhn-r9700.log) | 33.45 t/s | 221 | 210.04 t/s | 175,743 | 139.1 min |
| Qwen3.8-27B UD-Q6_K_M · R9700 · Clair Obscur | [`qwen38-27b-q6-clairobscur-r9700.log`](logs/qwen38-27b-q6-clairobscur-r9700.log) | 26.30 t/s | 30 | 167.98 t/s | 118,919 | 114.5 min |
| Qwen3.8-Flash-Next UD-Q4_K_XL · AI MAX 395 · Moorhuhn | [`qwen38-flashnext-moorhuhn-halo.log`](logs/qwen38-flashnext-moorhuhn-halo.log) | 21.82 t/s | 98 | 113.98 t/s | 285,339 | 285.6 min |
| Qwen3.8-Flash-Next UD-Q4_K_XL · AI MAX 395 · Clair Obscur | [`qwen38-flashnext-clairobscur-halo.log`](logs/qwen38-flashnext-clairobscur-halo.log) | 10.93 t/s | 92 | 123.65 t/s | 236,460 | 368.0 min |
| DeepSeek-V4-Flash-0731 UD-IQ3_XXS · AI MAX 395 · Clair Obscur | [`deepseek-v4-flash-clairobscur-halo.log`](logs/deepseek-v4-flash-clairobscur-halo.log) | 7.02 t/s | 98 | 17.59 t/s | 150,800 | 500.3 min |

Totals: **621 responses**, **1,299,666 tokens**, **26.6 h of GPU time** (21.0 h decode
plus 5.6 h prefill).

The log filenames use `-halo` for the AMD Ryzen AI Max+ 395 bench; `data/runs.json`
still keys those runs `…-evox2`, because the website filters on that id. Each run in
`runs.json` carries an `evidence` field naming its log and that log's SHA-256, so the
mapping is explicit rather than inferred from the filename.

## Findings: claim to source

| Claim in `README.md` | Source |
|---|---|
| Laguna draft depth: 8.1 t/s at `n_max 15`, 20.4 baseline, 27.9 at `n_max 3` | [`laguna-…-benchmark.md`](reports/laguna-s21-strix-halo-vulkan-benchmark.md) §5.3, analysis §6.2 |
| Qwen3.5 draft depth: 20.55 baseline, 31.80 at `n_max 2`, 27.68 at Unsloth's `6` | [`qwen35-…-benchmark.md`](reports/qwen35-122b-a10b-strix-halo-vulkan-benchmark.md) §5.3 |
| Draft acceptance 0.866 (Qwen3.5) versus 0.559 (Laguna) | same two reports, §5.3 of each |
| `presence_penalty 0.0` runs to 32,768 tokens without terminating; 1.5 finishes in 7,680 | [`qwen35-…-benchmark.md`](reports/qwen35-122b-a10b-strix-halo-vulkan-benchmark.md) §5.4, controlled A/B table |
| Enlarging the UMA carve-out does not help | [`laguna-…-benchmark.md`](reports/laguna-s21-strix-halo-vulkan-benchmark.md) §6.3 |
| Prefill 498.3 → 118.0 t/s from 8 K to 164 K; 16.6 min for a 180,396-token prompt | [`qwen38-27b-rdna4-quant-eval.md`](reports/qwen38-27b-rdna4-quant-eval.md) §"Prefill-Momentanrate" |
| Depth decay tracks mean accepted length (r = +0.804) over acceptance (r = +0.464) | [`qwen38-27b-rdna4-quant-eval.md`](reports/qwen38-27b-rdna4-quant-eval.md) §"Spekulation" |
| Synthetic pp512 245.71 / 309.6 t/s and tuned decode 31.80 / 27.90 t/s | the two Strix Halo reports, executive summary of each |
| Decode by context depth, 512 → 163,840 tokens | [`csv/`](csv/) depth-sweep runs plus the Flash-Next research logs |
| Prompt of 180,396 tokens on the R9700 | `qwen38-27b-q6-clairobscur-r9700.log`, largest `prompt eval time` entry |
| Self-repair counts (37 across four runs) | counted by hand in the run project folders; **not** log-derived — see below |

## What is *not* evidence-backed

Stated here so it cannot be mistaken for measurement:

- **Quality rubric scores.** Provisional throughout, assigned by a human. No protocol
  is published yet, so treat them as an opinion, not a result.
- **Self-repair counts.** Counted by reading the `fix_*.cjs` scripts left in each run's
  project folder. Reproducible by looking, but not machine-derived.
- **Energy.** Not measured at all. No wall meter, no `amdsmi` sampling.
- **Street prices.** Retail observation, not a measurement.
- **The two synthetic runs** (Qwen3.5-122B-A10B, Laguna S 2.1) have no agent log. Their
  numbers come from `llama-bench` sweeps and are reported in a separate class, because
  where both styles exist for one model the synthetic figure ran about 2× the agentic one.

## Licence

Measurement data CC-BY-4.0. Quote it, and please quote the measurement style with it.
