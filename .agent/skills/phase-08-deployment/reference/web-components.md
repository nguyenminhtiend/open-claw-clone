# Web UI Components Reference

Built with Lit web components. Target bundle size < 50KB. Dark mode by default with system-UI fonts.

| Component           | File                               | Purpose                                                                                      |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `oc-app`            | `src/app.ts`                       | Main app shell — top nav, sidebar, client-side router                                        |
| `oc-chat-view`      | `src/components/chat-view.ts`      | Chat interface — message list, input box, token-by-token streaming                           |
| `oc-session-list`   | `src/components/session-list.ts`   | Session browser — list, select, delete sessions                                              |
| `oc-status-bar`     | `src/components/status-bar.ts`     | Gateway status dashboard — uptime, connected channels, session count                         |
| `oc-config-panel`   | `src/components/config-panel.ts`   | Config viewer — displays current config (API keys masked)                                    |
| `oc-message-bubble` | `src/components/message-bubble.ts` | Individual message display — user/agent bubble, tool call inline display, markdown rendering |

## Routing

| Path        | Component         | Description       |
| ----------- | ----------------- | ----------------- |
| `/`         | `oc-chat-view`    | Default chat view |
| `/sessions` | `oc-session-list` | Session browser   |
| `/status`   | `oc-status-bar`   | Gateway status    |
| `/config`   | `oc-config-panel` | Config viewer     |

## WebSocket Integration

Each component connects to the Gateway at `ws://localhost:18789` using JSON-RPC.
Use a shared `GatewayService` singleton (`src/services/gateway.ts`) to avoid multiple connections.
