# Project Backlog

## Open Work

- [ ] Explore always-available outbound Telegram tools for queued artifacts and controls.
  - Priority: Low.
  - Idea: Provide tools such as `telegram_attach_file` and `telegram_attach_button` that can be called outside an active Telegram turn, using the paired chat/session as the delivery target when safe.
  - Exit: Design note defines active-turn versus ambient delivery semantics, safety constraints, failure modes, and whether the current `telegram_attach` contract should stay turn-scoped or gain an ambient companion.

- [ ] Multi-session concurrency (decided: cap 2 live, sessions else suspended).
  - Priority: Low — revisit when owner hits "want a long job to keep running while chatting" a 2nd time.
  - Measured 2026-11-07 (v0.12.1, `2c40ec5`): one `pi` process = 423 MB RSS / 684 MB peak,
    excluding mempalace-mcp + codegraph-mcp children. Host: 15 GB RAM, 8 GB available, 8 CPU,
    swap 3/3 GB already 100% used.
  - Hard blockers, not preferences:
    1. Telegram allows one `getUpdates` consumer per bot token — two pollers = 409 conflict.
       Concurrency therefore requires rewriting to **one router owning the poller + N workers**;
       spawning extra `pi` processes is not viable.
    2. Extension hooks (`agent_end`, queue, steering) live inside each `pi` process. There is no
       IPC today, so `/stop` / steer / pause on a background session needs a control channel
       (unix socket or signal file) before any of this is honest.
    3. 3 live sessions ≈ 2–2.5 GB with MCP children → memory pressure plus provider bursts
       (Kilo's 200 req/h/IP and other free tiers do not survive 3 concurrent tool loops).
  - Design constraints if built:
    - `maxLiveSessions` config (default 2), never hardcoded; advisory `MemoryMax=` per worker.
    - Suspended sessions cost nothing (they are just `.jsonl` on disk; largest today = 638 KB),
      so `/sessions` should be unlimited and resume lazily.
    - "Pause" must mean *finish the current turn, persist, release the process* — not SIGSTOP
      (which pins RAM and breaks provider timeouts). `/sessions` + `/resume` already implement
      this; only naming is missing.
  - Exit: a design note covering router/worker split, control-channel protocol, per-session queue
    isolation, aggregate `/status` cost, and a measured memory budget for cap=2 and cap=3.

## Done / inventory

- [x] Free-model coverage from the local OpenCode install (2026-11-07, user config only, no code change).
  - `enabledModels` now 58 (was 33); **40 free** across 5 providers: `opencode-zen` 11 (via the
    local shim on :4098), `openrouter` 12, `kilo` 10, `ovh` 6, `pollinations` 1.
  - Added 13 provider entries + pings so no dead alias ships: kilo `dots-3-note-preview`,
    `lfm-3-1.7b`, `nemotron-3-nano-omni`, `openrouter/free`, `reflection/beam-free`;
    openrouter `gemma-4-26b`, `lfm-2.5-2.6b`, `lfm-3-1.7b`, `openrouter/free`;
    opencode-zen `crouton-alpha`, `iceman`, `inkling-2-small`.
  - Latest DeepSeek V4.1 Flash build **1017** wired as `openrouter/deepseek/deepseek-v4.1-flash-1017`
    ($6/M in · $0.50/M out, 1M ctx) — the Kilo copy returns 401 on the anonymous key, so only the
    OpenRouter route is registered. Free `opencode-zen/deepseek-v4.1-flash-free` stays the $0 option.
  - Verified end-to-end with `pi -p "PONG" --model …` (deepseek-1017, reflection/beam, nemotron-nano).
    Gemini 26B free was 429 `upstream_shared_pool` at test time (temporary, kept).
  - Needs one `pi-telegram` restart to show up in the `/model` menu (enabledModels is read at boot).
  - Host unblocking note: swap raised 4 GB → 15 GB (`/swapfile2`, 12 GB, pri=10, in `/etc/fstab`),
    `vm.swappiness=20` persisted in `/etc/sysctl.d/99-swappiness.conf` — the old 4 GB file was 85% full
    while several build/test jobs ran, which made every turn look "slow".
