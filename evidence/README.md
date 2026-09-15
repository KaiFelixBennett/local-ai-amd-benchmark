# Evidence

Every speed figure of an agent run in this repository is derived from a file in this
directory, and the two scripts that derive them read these files directly. If a number in
the top level [`README.md`](../README.md) disagrees with what the scripts read out of the
logs, the logs win.

## Verify it yourself

```bash
# 1. confirm the raw files are the ones the numbers came from
cd evidence && sha256sum -c SHA256SUMS && cd ..

# 2. re-derive every agent run figure from the logs
python scripts/parse_logs.py

# 3. cross-check data/runs.json against the same logs, independently of the parser
python scripts/verify_runs.py
```

Both need only Python 3. `parse_logs.py` checks each log against `SHA256SUMS` as it goes.

## What is here

| Path | Contents |
|---|---|
| `logs/*.log` | Seven raw server logs, unedited, one per agent run: six from `llama.cpp`, one from Halogen written through a logging proxy. |
| `reports/*.md` | Six measurement protocols: the two Strix Halo sweeps (Laguna S 2.1, Qwen3.5-122B-A10B), the R9700 quant evaluation, the R9700 production run, the R9700 decode depth comparison and the Qwen3.8-Flash-Next depth curve. |
| `csv/*` | Ten files behind those reports: per task rows, `llama-bench` depth sweeps and their logs. |
| `prompts/*.txt` | The two prompts every game came from, exactly as the models received them. |
| `chats/*.md` | The chat transcript of the one run that has no server log. |
| `vision/*.json` | Model answers to the image recognition test. The answer keys are not published. |
| `SHA256SUMS` | Checksums of the 23 files under `logs/`, `reports/` and `csv/`. |

The logs are `llama-server` telemetry: `print_timing` slot lines, load and config output, and
the header the start script wrote above them. They carry no prompt text and no response text.
Every line starts with the time elapsed since the server started, so working windows and
pauses can be read from the log as well.

The Halogen log looks different. A proxy between VS Code and the server writes one line per
event with the wall clock time in front, the server adds one `serve_api: mtp` line per response
with tokens, time, rate, prompt size, cached part and prefill time, and the startup messages
stand at the top. It too carries no prompt text and no response text, only counts.

## Agent runs: figure to log

| Run | Log | Decode median | n | Prefill median | Tokens, all responses | GPU time |
|---|---|--:|--:|--:|--:|--:|
| Qwen3.8-27B UD-Q4_K_XL · R9700 · Moorhuhn | [`qwen38-27b-q4xl-moorhuhn-r9700.log`](logs/qwen38-27b-q4xl-moorhuhn-r9700.log) | 33.69 t/s | 82 | 234.86 t/s | 336,107 | 188.9 min |
| Qwen3.6-27B UD-Q6_K_XL · R9700 · Moorhuhn | [`qwen36-27b-q6-moorhuhn-r9700.log`](logs/qwen36-27b-q6-moorhuhn-r9700.log) | 33.45 t/s | 221 | 152.71 t/s | 196,543 | 139.1 min |
| Qwen3.8-27B UD-Q6_K_M · R9700 · Clair Obscur | [`qwen38-27b-q6-clairobscur-r9700.log`](logs/qwen38-27b-q6-clairobscur-r9700.log) | 26.30 t/s | 30 | 159.40 t/s | 119,627 | 114.5 min |
| Qwen3.8-Flash-Next UD-Q4_K_XL · AI MAX 395 · Moorhuhn | [`qwen38-flashnext-moorhuhn-evox2.log`](logs/qwen38-flashnext-moorhuhn-evox2.log) | 21.76 t/s | 346 | 77.63 t/s | 786,506 | 798.8 min |
| Qwen3.8-Flash-Next W4B · Halogen · AI MAX 395 · Moorhuhn | [`qwen38-flashnext-moorhuhn-halogen-evox2.log`](logs/qwen38-flashnext-moorhuhn-halogen-evox2.log) | 38.28 t/s | 652 | 347.85 t/s<br>1,120.69 t/s from 8,192 new tokens | 1,177,886 | 634.9 min |
| Qwen3.8-Flash-Next UD-Q4_K_XL · AI MAX 395 · Clair Obscur | [`qwen38-flashnext-clairobscur-halo.log`](logs/qwen38-flashnext-clairobscur-halo.log) | 10.93 t/s | 92 | 109.74 t/s | 238,371 | 368.0 min |
| DeepSeek-V4-Flash-0731 UD-IQ3_XXS · AI MAX 395 · Clair Obscur | [`deepseek-v4-flash-clairobscur-halo.log`](logs/deepseek-v4-flash-clairobscur-halo.log) | 7.02 t/s | 98 | 15.24 t/s | 158,469 | 500.3 min |

Totals as `parse_logs.py` prints them: **1,521 responses** of 200 tokens or more,
**2,929,472 tokens** in those responses and **3,013,509** over all responses, **45.7 h of GPU
time** (37.3 h decode plus 8.4 h prefill).

Decode is the median over responses of **200 tokens or more**; shorter ones produce outliers of
up to 1,000,000 t/s, one token in almost zero milliseconds. Prefill is the median over **all**
prompts, without that floor. Percentiles are **nearest rank**, without interpolation. GPU time
is decode plus prefill as timed by the server. Halogen logs no prefill rate; for its run the
prefill rate is the new prompt tokens (prompt minus cached) divided by the prefill time it
reports. Its requests bring 654 new tokens in the median, and requests with 32 to 511 new
tokens took 1.46 s in the median, so its median over all 891 prompts, 347.85 t/s, describes
those small steps. `parse_logs.py` therefore also prints its prefill in six bands of new tokens
per request and the median from 8,192 new tokens up, **1,120.69 t/s** over 39 requests, 35 of
them above 1,000 t/s; `verify_runs.py` checks that median in `data/runs.json`.
`parse_logs.py` and `verify_runs.py` are written independently and must agree.

Log names end in `-halo` or `-evox2` for the AMD AI MAX 395 (AMD Halo); `data/runs.json` keys
those runs `…-evox2`. Each run there carries an `evidence` field naming its log and that log's
SHA-256, so the mapping is explicit rather than inferred from the file name.

## Findings: claim to source

| Claim in `README.md` | Source |
|---|---|
| Decode medians, percentiles, tokens and GPU time of the seven agent runs | the seven logs, read by `scripts/parse_logs.py` |
| Test files and `fix_*` repair scripts per run | count `*.test.*` and `fix_*` files in [`../benchmarks/`](../benchmarks/) |
| Finding 1: 33.69 against 33.45 t/s, 11 test files against none, 12 `fix_*` scripts | the two R9700 Moorhuhn logs; `benchmarks/qwen38-27b/moorhuhn-q4xl-xhigh/` and `benchmarks/qwen36-27b/moorhuhn-q6/` |
| Finding 2: DFlash at 20.4, 27.9 and 8.1 t/s in the sweep; 8.56 t/s at acceptance 0.000 to 0.019 in a live agent session; on and off at `n_max 15` | [`laguna-s21-strix-halo-vulkan-benchmark.md`](reports/laguna-s21-strix-halo-vulkan-benchmark.md) §5.3, §5.8.1, §6.2b |
| Finding 3: MTP from 20.55 to 31.80 t/s at acceptance 0.866; 27.68 at Unsloth's `6` | [`qwen35-122b-a10b-strix-halo-vulkan-benchmark.md`](reports/qwen35-122b-a10b-strix-halo-vulkan-benchmark.md) §5.3 |
| Finding 3: draft acceptance on all 459 responses, mean 70.7 %, mean accepted length 2.42 | the 459 `draft acceptance` lines in [`qwen38-flashnext-moorhuhn-evox2.log`](logs/qwen38-flashnext-moorhuhn-evox2.log) |
| Finding 3: 1.84 to 2.13× decode for this MTP setup, measured in isolation | the same log, line 7, written by the start script |
| Finding 4: 26.78 and 15.37 t/s by context band; r = +0.804 for mean length, +0.464 for acceptance | [`qwen38-27b-q6-clairobscur-production-run.md`](reports/qwen38-27b-q6-clairobscur-production-run.md) §1 to §3, rows in [`csv/20260828-clair-obscure-produktionslauf.csv`](csv/20260828-clair-obscure-produktionslauf.csv) |
| Finding 5: `presence_penalty 0.0` runs to 32,768 tokens without an answer, 1.5 finishes in 7,680 | Qwen3.5 report §5.4 |
| Finding 6: a larger UMA carve-out does not help | Laguna report §6.3 |
| Finding 6: 86.09 GiB GPU peak with 25.56 GiB free at ctx 262,144 | [`../docs/messdaten-inventar.md`](../docs/messdaten-inventar.md), section "Speicher" |
| Finding 7: xhigh against medium, line counts, test files and menu entries | `benchmarks/qwen38-27b/`; the medium run's [chat transcript](chats/qwen38-27b-q4xl-moorhuhn-medium-r9700.md) |
| Finding 8: image recognition scores | model answers in [`vision/`](vision/) and on the model pages; the scoring keys stay unpublished |
| Finding 9: 21.76 against 38.28 t/s; 268 of 652 scored responses next to a second request; 15 requests with HTTP 400, three silent engine stops, 25 drops in the message count | the two Flash-Next Moorhuhn logs; in [`qwen38-flashnext-moorhuhn-halogen-evox2.log`](logs/qwen38-flashnext-moorhuhn-halogen-evox2.log) the `beside other streams`, `fertig: HTTP 400`, `engine went silent` and `Anfrage` lines |
| Finding 9: 2.0 GiB reserved for the iGPU, W4B with quality overlay, halogen-flash-server 0.6.3 | the startup messages at the top of the Halogen log |
| Halogen prefill: 1,120.69 t/s from 8,192 new tokens up over 39 requests; 654 new tokens per request in the median; 1.46 s for 32 to 511 new tokens | the `serve_api` lines in [`qwen38-flashnext-moorhuhn-halogen-evox2.log`](logs/qwen38-flashnext-moorhuhn-halogen-evox2.log), read by `scripts/parse_logs.py` and checked by `scripts/verify_runs.py` |
| Prefill from 498.3 to 118.0 t/s between 8K and 164K; 16.6 min for a prompt of 180,396 tokens | production run §4; the largest `prompt eval time` in [`qwen38-27b-q6-clairobscur-r9700.log`](logs/qwen38-27b-q6-clairobscur-r9700.log) |
| Decode by depth from 512 to 163,840 tokens, with and without PR #27977 | [`qwen38-flashnext-depth-curve.md`](reports/qwen38-flashnext-depth-curve.md) §2, sweeps in [`csv/`](csv/) |
| Synthetic figures: Qwen3.5 pp512 245.71 and decode 31.80 t/s; Laguna pp512 338.68 and tg128 20.71 t/s | Qwen3.5 report §1; Laguna report §5.6.1 |
| R9700 decode by depth, Q6 against Q4 | [`qwen38-27b-decode-depth-q6-vs-q4.md`](reports/qwen38-27b-decode-depth-q6-vs-q4.md) plus the three `decode-depth-lauf1` sweeps in [`csv/`](csv/) |

## What is not backed by evidence

Stated here so it cannot be mistaken for measurement:

- **Quality rubric scores.** Four criteria of 10 points each, assigned by a person, with a
  written reason per criterion on each model page. Two scores are confirmed, the others are
  proposals. An informed opinion, not a measurement.
- **Self-corrections.** Only the 12 `fix_*` scripts of the Qwen3.6-27B Moorhuhn run can be
  counted in `benchmarks/`. The other counts in `data/runs.json` are the operator's record.
- **Runtimes without a log.** The 6 h 28 min of the medium run come from the VS Code display,
  the roughly 70 minutes of Sonnet 5 from the session, the roughly 9 h of the Qwen3.8-27B xhigh
  run from the operator's notes. Its log covers the first of two sessions only.
- **What Halogen is.** That it is made for Qwen3.8-Flash-Next on Strix Halo is how its project
  page describes it. The log confirms version, container, weights, context and memory figures,
  not the claim.
- **Energy.** Not measured at all.
- **Street prices.** Retail observation, not a measurement.
- **The synthetic runs** (Qwen3.5-122B-A10B, Laguna S 2.1) have no agent log. Their figures come
  from `llama-bench` and single `llama-server` requests and are reported as a class of their own.

## Licence

Measurement data CC-BY-4.0. Quote it, and please quote the measurement style with it.
