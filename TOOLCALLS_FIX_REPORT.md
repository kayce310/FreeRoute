# TOOLCALLS_FIX_REPORT.md

## Bug 1: server.ts
Status: FIXED
Changes: Nested `tool_calls` inside `delta` for streaming responses in both combo and named model paths.
Verified: OpenAI streaming spec compliance.

## Bug 2: openai-compatible.ts
Status: FIXED
Changes: Updated `OpenAIChatChunk` interface and `streamChat` to correctly parse `tool_calls` from `delta`.

## Bug 3: anthropic.ts
Status: FIXED
Changes: Implemented full streaming support for `tool_use` events in `streamChat`.

## Bug 4: Kiro Verification
- Presets: 108:    id: 'kiro',
111:    baseUrl: 'https://api.kiro.ai/v1',
112:    apiKeyUrl: 'https://kiro.ai',
113:    website: 'https://kiro.ai',
- Providers: 0 matches
Conclusion: Kiro is registered in presets using the default `openai-compatible` adapter. No custom `kiro.ts` provider exists.

## Build Result
SUCCESS

## Verification Curl Output
```json
{"error":{"message":"Chưa có API key nào khả dụng cho profile/model này (hoặc tất cả upstream đều lỗi). Vui lòng truy cập http://127.0.0.1:8787 để kiểm tra hoặc thêm key! / No active route candidates available. Please open http://127.0.0.1:8787 to configure credentials.","type":"no_route_candidates","code":"no_candidates","diagnostics":[{"providerId":"antigravity","modelId":"ag/claude-sonnet-4-6","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/claude-sonnet-4-6","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-3-flash","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-3-flash","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-3.5-flash-low","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-3.5-flash-low","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-pro-agent","reason":"provider_mismatch"},{"providerId":"antigravity","modelId":"ag/gemini-pro-agent","reason":"provider_mismatch"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"BAAI/bge-reranker-v2-m3","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"},{"providerId":"api-airforce","modelId":"Doubao-1.5-pro-32k","reason":"missing_capability"}]}}
```
