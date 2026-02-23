# CLI Commands Reference

All commands communicate with the Gateway via WebSocket JSON-RPC at `ws://localhost:18789`.

| Command                          | File                          | Description                                                                                                                             |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `oclaw onboard`                  | `commands/onboard.ts`         | First-time setup wizard — choose provider, enter API key, choose model, generate config, create memory files, optionally install daemon |
| `oclaw chat`                     | `commands/chat.ts`            | Interactive REPL with streaming responses, slash command support, readline interface                                                    |
| `oclaw config show`              | `commands/config/show.ts`     | Display current config (API keys redacted)                                                                                              |
| `oclaw config set <key> <value>` | `commands/config/set.ts`      | Update a config key-value pair                                                                                                          |
| `oclaw sessions list`            | `commands/sessions/list.ts`   | Show active sessions with IDs and message counts                                                                                        |
| `oclaw memory search <query>`    | `commands/memory/search.ts`   | Semantic memory search, returns top-5 results                                                                                           |
| `oclaw memory status`            | `commands/memory/status.ts`   | Memory index health — chunk count, last indexed                                                                                         |
| `oclaw channels status`          | `commands/channels/status.ts` | Show connected/disconnected/error state per channel                                                                                     |
| `oclaw plugins list`             | `commands/plugins/list.ts`    | Installed plugins with status and version                                                                                               |
| `oclaw daemon start`             | `commands/daemon/start.ts`    | Start the gateway as a background process                                                                                               |
| `oclaw daemon stop`              | `commands/daemon/stop.ts`     | Stop the background daemon                                                                                                              |
| `oclaw daemon status`            | `commands/daemon/status.ts`   | Check if daemon is running, show PID and uptime                                                                                         |
| `oclaw daemon install`           | `commands/daemon/install.ts`  | Install as launchd (macOS) or systemd (Linux) service                                                                                   |
