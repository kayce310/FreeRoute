## File: D:/FreeRoute/src/providers/gemini.ts
```typescript
1	import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
     2	import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type NormalizedChatStreamEvent, type ToolCall } from '../inference.js';
     3	import type { TokenUsage } from '../contracts.js';
     4	import { translateGeminiRequest } from '../translators/gemini-translator.js';
     5	
     6	interface GeminiModel { name?: string; supportedGenerationMethods?: string[]; }
     7	interface GeminiList { models?: GeminiModel[]; nextPageToken?: string; }
     8	interface GeminiResponse {
     9	  responseId?: string;
    10	  modelVersion?: string;
    11	  candidates?: Array<{
    12	    content?: { parts?: Array<{ text?: string; thought?: string; functionCall?: { name: string; args?: Record<string, unknown> } }>; };
    13	  }>;
    14	  usageMetadata?: {
    15	    promptTokenCount?: number;
    16	    candidatesTokenCount?: number;
    17	    totalTokenCount?: number;
    18	  };
    19	}
    20	
    21	export interface GeminiAdapterOptions {
    22	  baseUrl?: string;
    23	  getCredential: (credentialId: string) => Promise<string | undefined>;
    24	  fetch?: typeof globalThis.fetch;
    25	}
    26	
    27	/** Native Gemini REST adapter. Handles text and tool-capable chat. */
    28	export class GeminiAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
    29	  readonly providerId = 'gemini';
    30	  private readonly baseUrl: string;
    31	  private readonly getCredential: GeminiAdapterOptions['getCredential'];
    32	  private readonly fetcher: typeof globalThis.fetch;
    33	
    34	  constructor(options: GeminiAdapterOptions) {
    35	    this.baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    36	    this.getCredential = options.getCredential;
    37	    this.fetcher = options.fetch ?? globalThis.fetch;
    38	  }
    39	
    40	  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    41	    const models: GeminiModel[] = [];
    42	    let pageToken: string | undefined;
    43	    do {
    44	      const url = new URL(`${this.baseUrl}/models`);
    45	      if (pageToken) url.searchParams.set('pageToken', pageToken);
    46	      const response = await this.fetcher(url, { headers: await this.headers(credentialId) });
    47	      if (!response.ok) throw await providerError(response);
    48	      const body = await response.json() as GeminiList;
    49	      models.push(...(body.models ?? []));
    50	      pageToken = body.nextPageToken;
    51	    } while (pageToken);
    52	    return models
    53	      .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
    54	      .map((model) => {
    55	        const id = model.name!.replace(/^models\//, '');
    56	        const isTtsOrAudio = id.includes('tts') || id.includes('audio');
    57	        const caps: import('../contracts.js').Capability[] = ['chat', 'streaming'];
    58	        if (!isTtsOrAudio) {
    59	          caps.push('tools', 'vision');
    60	        }
    61	        return {
    62	          modelId: id,
    63	          capabilities: caps,
    64	          freeTier: 'free_unverified' as const,
    65	        };
    66	      });
    67	  }
    68	
    69	  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): Promise<{ id: string; model: string; content: string; thought?: string; toolCalls?: ToolCall[]; usage?: TokenUsage }> {
    70	    let response: Response;
    71	    try {
    72	      const headers = await this.headers(input.credentialId);
    73	      response = await this.fetcher(this.url(input.modelId, 'generateContent'), {
    74	        method: 'POST',
    75	        headers: { ...headers, 'content-type': 'application/json' },
    76	        signal: AbortSignal.timeout(15000),
    77	        body: JSON.stringify(translateGeminiRequest(input.request)),
    78	      });
    79	    } catch (err: unknown) {
    80	      if (err instanceof ProviderInvocationError) throw err;
    81	      const msg = err instanceof Error ? err.message : 'network fetch failed';
    82	      throw new ProviderInvocationError(`Gemini connection error: ${msg}`, { kind: 'temporary', scope: 'provider', retryable: true, fallbackAllowed: true });
    83	    }
    84	
    85	    if (!response.ok) {
    86	      if (response.status === 404 && (input.modelId === 'gemini-2.5-flash' || input.modelId === 'gemini-2.0-flash')) {
    87	        const errorText = await response.clone().text().catch(() => '');
    88	        if (errorText.includes('gemini-3.6-flash') || errorText.includes('no longer available to new users')) {
    89	          return this.chat({ ...input, modelId: 'gemini-3.6-flash' });
    90	        }
    91	      }
    92	      throw await providerError(response);
    93	    }
    94	    const body = await response.json() as GeminiResponse;
    95	    const content = textFrom(body);
    96	    const thought = body.candidates?.[0]?.content?.parts?.find(p => 'thought' in p)?.thought;
    97	    const toolCalls = toolCallsFrom(body);
    98	    if (!content && !toolCalls.length && !thought) throw new ProviderInvocationError('Gemini returned no assistant content', { kind: 'temporary' });
    99	    return { id: body.responseId ?? crypto.randomUUID(), model: body.modelVersion ?? input.modelId, content: content ?? '', thought, toolCalls: toolCalls.length ? toolCalls : undefined, usage: usageFrom(body.usageMetadata) };
   100	  }
   101	
   102	  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): AsyncGenerator<NormalizedChatStreamEvent, void, unknown> {
   103	    const url = new URL(this.url(input.modelId, 'streamGenerateContent'));
   104	    url.searchParams.set('alt', 'sse');
   105	    let response: Response;
   106	    try {
   107	      const headers = await this.headers(input.credentialId);
   108	      response = await this.fetcher(url, {
   109	        method: 'POST',
   110	        headers: { ...headers, 'content-type': 'application/json' },
   111	        signal: AbortSignal.timeout(15000),
   112	        body: JSON.stringify(translateGeminiRequest(input.request)),
   113	      });
   114	    } catch (err: unknown) {
   115	      if (err instanceof ProviderInvocationError) throw err;
   116	      const msg = err instanceof Error ? err.message : 'network fetch failed';
   117	      throw new ProviderInvocationError(`Gemini streaming connection error: ${msg}`, { kind: 'temporary', scope: 'provider', retryable: true, fallbackAllowed: true });
   118	    }
   119	
   120	    if (!response.ok) {
   121	      if (response.status === 404 && (input.modelId === 'gemini-2.5-flash' || input.modelId === 'gemini-2.0-flash')) {
   122	        const errorText = await response.clone().text().catch(() => '');
   123	        if (errorText.includes('gemini-3.6-flash') || errorText.includes('no longer available to new users')) {
   124	          yield* this.streamChat({ ...input, modelId: 'gemini-3.6-flash' });
   125	          return;
   126	        }
   127	      }
   128	      throw await providerError(response);
   129	    }
   130	    if (!response.body) throw new ProviderInvocationError('Gemini returned no streaming response body', { kind: 'temporary' });
   131	    const decoder = new TextDecoder();
   132	    let pending = '';
   133	    for await (const bytes of response.body) {
   134	      pending += decoder.decode(bytes, { stream: true });
   135	      const lines = pending.split(/\r?\n/);
   136	      pending = lines.pop() ?? '';
   137	      for (const line of lines) {
   138	        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
   139	        if (!data) continue;
   140	        try {
   141	          const chunk = JSON.parse(data) as GeminiResponse;
   142	          const text = textFrom(chunk);
   143	          const thought = (chunk.candidates?.[0]?.content?.parts ?? [])
   144	            .find(part => 'thought' in part && typeof part.thought === 'string') as any;
   145	          const toolCalls = (chunk.candidates?.[0]?.content?.parts ?? [])
   146	            .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
   147	            .map((part) => ({
   148	            id: crypto.randomUUID(),
   149	            type: 'function' as const,
   150	            function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
   151	          }));
   152	          yield { 
   153	            id: chunk.responseId ?? crypto.randomUUID(), 
   154	            model: chunk.modelVersion ?? input.modelId, 
   155	            delta: text, 
   156	            thought: thought?.thought,
   157	            toolCalls: toolCalls.length ? toolCalls : undefined, 
   158	            usage: usageFrom(chunk.usageMetadata) 
   159	          };
   160	        } catch { /* Ignore non-data SSE lines. */ }
   161	      }
   162	    }
   163	
   164	    // Flush remaining buffered SSE data on stream end
   165	    if (pending.trim().startsWith("data:")) {
   166	      try {
   167	        const chunk = JSON.parse(pending.trim().slice(5).trim()) as GeminiResponse;
   168	        const text = textFrom(chunk);
   169	        yield {
   170	          id: chunk.responseId ?? crypto.randomUUID(),
   171	          model: chunk.modelVersion ?? input.modelId,
   172	          delta: text || "",
   173	          thought: (chunk.candidates?.[0]?.content?.parts ?? []).find(p => "thought" in p && typeof p.thought === "string")?.thought,
   174	          toolCalls: toolCallsFrom(chunk),
   175	          usage: usageFrom(chunk.usageMetadata)
   176	        };
   177	      } catch { /* ignore malformed final chunk */ }
   178	    }
   179	  }
   180	
   181	  private url(modelId: string, method: string): string {
   182	    return `${this.baseUrl}/models/${encodeURIComponent(modelId.replace(/^models\//, ''))}:${method}`;
   183	  }
   184	
   185	  private async headers(credentialId: string): Promise<Record<string, string>> {
   186	    const secret = await this.getCredential(credentialId);
   187	    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
   188	    return { 'x-goog-api-key': secret };
   189	  }
   190	}
   191	
   192	// Removed old toGeminiRequest and helper functions since they are now in translators/gemini-translator.ts
   193	
   194	function textFrom(response: GeminiResponse): string | undefined {
   195	  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || undefined;
   196	}
   197	
   198	function toolCallsFrom(response: GeminiResponse): ToolCall[] {
   199	  return (response.candidates?.[0]?.content?.parts ?? [])
   200	    .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
   201	    .map((part) => ({
   202	      id: crypto.randomUUID(),
   203	      type: 'function',
   204	      function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
   205	    }));
   206	}
   207	
   208	function usageFrom(metadata: GeminiResponse['usageMetadata']): TokenUsage | undefined {
   209	  if (!metadata) return undefined;
   210	  const promptTokens = metadata.promptTokenCount ?? 0;
   211	  const completionTokens = metadata.candidatesTokenCount ?? 0;
   212	  return { promptTokens, completionTokens, totalTokens: metadata.totalTokenCount ?? (promptTokens + completionTokens) };
   213	}
   214	
   215	function isContextOverflowError(status: number, text: string): boolean {
   216	  if (status !== 400 && status !== 413) return false;
   217	  const lower = text.toLowerCase();
   218	  return lower.includes('context length') || lower.includes('token limit') || lower.includes('too many tokens') || lower.includes('prompt is too long');
   219	}
   220	
   221	async function providerError(response: Response): Promise<ProviderInvocationError> {
   222	  const rawBody = await response.text().catch(() => '');
   223	  let extractedMessage = '';
   224	  try {
   225	    const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string; message?: string };
   226	    extractedMessage = (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) || parsed.message || '';
   227	  } catch { extractedMessage = rawBody.slice(0, 300); }
   228	
   229	  const isOverflow = isContextOverflowError(response.status, rawBody);
   230	  let kind: import('../contracts.js').RouteFailureKind = 'permanent';
   231	  if (isOverflow) kind = 'context_overflow';
   232	  else if (response.status === 401 || response.status === 403) kind = 'authentication';
   233	  else if (response.status === 429) kind = 'rate_limit';
   234	  else if (response.status === 408 || response.status >= 500) kind = 'temporary';
   235	  else if (response.status === 404 || response.status === 400) kind = 'unsupported';
   236	  
   237	  return new ProviderInvocationError(`Gemini request failed: ${extractedMessage}`, { kind, scope: 'key', fallbackAllowed: kind !== 'unsupported', retryable: kind === 'temporary' || kind === 'rate_limit' });
   238	}
```

## File: D:/FreeRoute/src/providers/openai-compatible.ts
```typescript
1	import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
     2	import type { Capability, FreeTierClass, TokenUsage, RouteFailureKind, RouteFailureScope } from '../contracts.js';
     3	import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type ToolCall } from '../inference.js';
     4	import { estimatePromptTokens, estimateTokensFromText } from '../utils/token-estimator.js';
     5	
     6	export function inferModelCapabilities(modelId: string, baseCaps: Capability[] = ['chat', 'streaming']): Capability[] {
     7	  const caps = new Set<Capability>(baseCaps);
     8	  const lower = modelId.toLowerCase();
     9	
    10	  const hasTools =
    11	    lower.includes('coder') ||
    12	    lower.includes('claude') ||
    13	    lower.includes('gpt-4') ||
    14	    lower.includes('gpt-5') ||
    15	    lower.includes('chatgpt-4o') ||
    16	    lower.includes('gpt-3.5-turbo') ||
    17	    lower.includes('llama-3.3') ||
    18	    lower.includes('llama-3.1') ||
    19	    lower.includes('llama-3.2') ||
    20	    lower.includes('gemini') ||
    21	    lower.includes('qwen2.5') ||
    22	    lower.includes('qwen-2.5') ||
    23	    lower.includes('qwen3') ||
    24	    lower.includes('mistral-small') ||
    25	    lower.includes('mistral-large') ||
    26	    lower.includes('codestral') ||
    27	    lower.includes('devstral') ||
    28	    lower.includes('command-r') ||
    29	    lower.includes('deepseek-chat') ||
    30	    lower.includes('deepseek-v3');
    31	
    32	  if (hasTools) {
    33	    caps.add('tools');
    34	  }
    35	
    36	  const hasVision =
    37	    lower.includes('vision') ||
    38	    lower.includes('gemini') ||
    39	    lower.includes('gpt-4o') ||
    40	    lower.includes('gpt-4-turbo') ||
    41	    lower.includes('claude-3') ||
    42	    lower.includes('claude-sonnet') ||
    43	    lower.includes('qwen-vl') ||
    44	    lower.includes('qwen2-vl');
    45	
    46	  if (hasVision) {
    47	    caps.add('vision');
    48	  }
    49	
    50	  return [...caps];
    51	}
    52	
    53	interface OpenAIModel {
    54	  id: string;
    55	  pricing?: { prompt?: string; completion?: string };
    56	}
    57	
    58	interface OpenAIModelList {
    59	  data?: OpenAIModel[];
    60	}
    61	
    62	type OpenAIMessageContent = string | Array<{ text?: string }> | undefined;
    63	
    64	interface OpenAIUsage {
    65	  prompt_tokens?: number;
    66	  completion_tokens?: number;
    67	  total_tokens?: number;
    68	}
    69	
    70	interface OpenAIChatCompletion {
    71	  id?: string;
    72	  model?: string;
    73	  choices?: Array<{ message?: { content?: OpenAIMessageContent; tool_calls?: ToolCall[] } }>;
    74	  usage?: OpenAIUsage;
    75	}
    76	
    77	interface OpenAIChatChunk {
    78	  id?: string;
    79	  model?: string;
    80	  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null; tool_calls?: ToolCall[] }>;
    81	  usage?: OpenAIUsage;
    82	}
    83	
    84	export interface OpenAICompatibleAdapterOptions {
    85	  providerId: string;
    86	  baseUrl: string;
    87	  getCredential: (credentialId: string) => Promise<string | undefined>;
    88	  fetch?: typeof globalThis.fetch;
    89	  /** Use when an official catalog has no price metadata but the tier is known separately. */
    90	  classifyModel?: (model: OpenAIModel) => FreeTierClass;
    91	}
    92	
    93	/**
    94	 * Generic adapter for official OpenAI-compatible APIs. For OpenRouter, pricing
    95	 * metadata is used to classify zero-cost models as verified free candidates.
    96	 */
    97	export class OpenAICompatibleAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
    98	  readonly providerId: string;
    99	  private readonly baseUrl: string;
   100	  private readonly getCredential: OpenAICompatibleAdapterOptions['getCredential'];
   101	  private readonly fetcher: typeof globalThis.fetch;
   102	  private readonly classifyModel: (model: OpenAIModel) => FreeTierClass;
   103	
   104	  constructor(options: OpenAICompatibleAdapterOptions) {
   105	    this.providerId = options.providerId;
   106	    this.baseUrl = options.baseUrl.replace(/\/$/, '');
   107	    this.getCredential = options.getCredential;
   108	    this.fetcher = options.fetch ?? globalThis.fetch;
   109	    this.classifyModel = options.classifyModel ?? ((model) => isZeroPrice(model.pricing) ? 'free_verified' : 'paid');
   110	  }
   111	
   112	  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
   113	    const response = await this.fetcher(`${this.baseUrl}/models`, { headers: await this.headers(credentialId) });
   114	    if (!response.ok) throw await providerError(response);
   115	    const body = await response.json() as OpenAIModelList;
   116	    return (body.data ?? []).map((model) => ({
   117	      modelId: model.id,
   118	      capabilities: inferModelCapabilities(model.id),
   119	      freeTier: this.classifyModel(model),
   120	    }));
   121	  }
   122	
   123	  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
   124	    let response: Response;
   125	    try {
   126	      const headers = await this.headers(input.credentialId);
   127	      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
   128	        method: 'POST',
   129	        headers: { ...headers, 'content-type': 'application/json' },
   130	        signal: AbortSignal.timeout(15000),
   131	        body: JSON.stringify({
   132	          model: input.modelId,
   133	          messages: input.request.messages,
   134	          temperature: input.request.temperature,
   135	          ...(input.request.tools?.length ? { tools: input.request.tools } : {}),
   136	          stream: false,
   137	          ...(input.request.responseFormat ? { response_format: input.request.responseFormat } : {}),
   138	        }),
   139	      });
   140	    } catch (err: unknown) {
   141	      if (err instanceof ProviderInvocationError) throw err;
   142	      const msg = err instanceof Error ? err.message : 'network fetch failed';
   143	      throw new ProviderInvocationError(`upstream connection error to ${this.providerId}: ${msg}`, {
   144	        kind: 'temporary',
   145	        scope: 'provider',
   146	        retryable: true,
   147	        fallbackAllowed: true,
   148	      });
   149	    }
   150	
   151	    if (!response.ok) throw await providerError(response);
   152	    const body = await response.json() as OpenAIChatCompletion;
   153	    const content = contentToText(body.choices?.[0]?.message?.content);
   154	    const toolCalls = body.choices?.[0]?.message?.tool_calls;
   155	    if (!content && !toolCalls?.length) throw new ProviderInvocationError('upstream returned no assistant content', { kind: 'temporary' });
   156	    const usage: TokenUsage | undefined = body.usage ? {
   157	      promptTokens: body.usage.prompt_tokens ?? 0,
   158	      completionTokens: body.usage.completion_tokens ?? 0,
   159	      totalTokens: body.usage.total_tokens ?? ((body.usage.prompt_tokens ?? 0) + (body.usage.completion_tokens ?? 0)),
   160	    } : {
   161	      promptTokens: estimatePromptTokens(input.request.messages),
   162	      completionTokens: estimateTokensFromText(content ?? ''),
   163	      totalTokens: estimatePromptTokens(input.request.messages) + estimateTokensFromText(content ?? ''),
   164	    };
   165	    return { id: body.id ?? crypto.randomUUID(), model: body.model ?? input.modelId, content: content ?? '', ...(toolCalls?.length ? { toolCalls } : {}), quota: quotaFromHeaders(response.headers), usage };
   166	  }
   167	
   168	  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
   169	    let response: Response;
   170	    try {
   171	      const headers = await this.headers(input.credentialId);
   172	      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
   173	        method: 'POST',
   174	        headers: { ...headers, 'content-type': 'application/json' },
   175	        signal: AbortSignal.timeout(15000),
   176	        body: JSON.stringify({ model: input.modelId, messages: input.request.messages, temperature: input.request.temperature, stream: true, stream_options: { include_usage: true }, tools: input.request.tools, ...(input.request.responseFormat ? { response_format: input.request.responseFormat } : {}) }),
   177	      });
   178	    } catch (err: unknown) {
   179	      if (err instanceof ProviderInvocationError) throw err;
   180	      const msg = err instanceof Error ? err.message : 'network fetch failed';
   181	      throw new ProviderInvocationError(`upstream streaming connection error to ${this.providerId}: ${msg}`, {
   182	        kind: 'temporary',
   183	        scope: 'provider',
   184	        retryable: true,
   185	        fallbackAllowed: true,
   186	      });
   187	    }
   188	
   189	    if (!response.ok) throw await providerError(response);
   190	    if (!response.body) throw new ProviderInvocationError('upstream returned no streaming response body', {
   191	      kind: 'temporary',
   192	      scope: 'provider',
   193	      retryable: true,
   194	      fallbackAllowed: true,
   195	    });
   196	    const decoder = new TextDecoder();
   197	    let pending = '';
   198	    let streamUsage: TokenUsage | undefined;
   199	    let lastChunkId: string | undefined;
   200	    for await (const bytes of response.body) {
   201	      pending += decoder.decode(bytes, { stream: true });
   202	      const lines = pending.split(/\r?\n/);
   203	      pending = lines.pop() ?? '';
   204	    for (const line of lines) {
   205	      const data = line.startsWith('data:') ? line.slice(5).trim() : undefined;
   206	      if (!data || data === '[DONE]') continue;
   207	      let chunk: any;
   208	      try { chunk = JSON.parse(data); } catch { continue; }
   209	      if (chunk.id) lastChunkId = chunk.id;
   210	
   211	      // Extract reasoning/thought
   212	      const choice = chunk.choices?.[0];
   213	      const thought = choice?.delta?.reasoning_content || chunk.choices?.[0]?.delta?.thought;
   214	
   215	      // Capture usage chunk
   216	      if (chunk.usage) {
   217	        streamUsage = {
   218	          promptTokens: chunk.usage.prompt_tokens ?? 0,
   219	          completionTokens: chunk.usage.completion_tokens ?? 0,
   220	          totalTokens: chunk.usage.total_tokens ?? ((chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0)),
   221	        };
   222	      }
   223	      
   224	      if (!choice && !chunk.usage) continue;
   225	      yield {
   226	        id: chunk.id ?? crypto.randomUUID(),
   227	        model: chunk.model ?? input.modelId,
   228	        delta: choice?.delta?.content,
   229	        thought: thought,
   230	        finishReason: choice?.finish_reason,
   231	        toolCalls: choice?.tool_calls,
   232	      };
   233	    }
   234	    }
   235	    pending += decoder.decode();
   236	    const finalLine = pending.trim();
   237	    if (finalLine.startsWith('data:')) {
   238	      const data = finalLine.slice(5).trim();
   239	      if (data && data !== '[DONE]') {
   240	          const chunk = JSON.parse(data) as any;
   241	          if (chunk.id) lastChunkId = chunk.id;
   242	          if (chunk.usage) {
   243	            streamUsage = {
   244	              promptTokens: chunk.usage.prompt_tokens ?? 0,
   245	              completionTokens: chunk.usage.completion_tokens ?? 0,
   246	              totalTokens: chunk.usage.total_tokens ?? ((chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0)),
   247	            };
   248	          }
   249	          const choice = chunk.choices?.[0];
   250	          if (choice || chunk.usage) {
   251	            yield {
   252	              id: chunk.id ?? crypto.randomUUID(),
   253	              model: chunk.model ?? input.modelId,
   254	              delta: choice?.delta?.content,
   255	              thought: choice?.delta?.reasoning_content || choice?.delta?.thought,
   256	              finishReason: choice?.finish_reason,
   257	              toolCalls: choice?.tool_calls,
   258	              usage: streamUsage,
   259	            };
   260	          }
   261	      }
   262	    }
   263	    // Yield a final usage-only event so inference.ts can capture exact token counts
   264	    if (streamUsage) {
   265	      yield {
   266	        id: lastChunkId ?? crypto.randomUUID(),
   267	        model: input.modelId,
   268	        usage: streamUsage,
   269	      };
   270	    }
   271	  }
   272	
   273	  private async headers(credentialId: string): Promise<Record<string, string>> {
   274	    const secret = await this.getCredential(credentialId);
   275	    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
   276	    return { authorization: *** ${secret}` };
   277	  }
   278	}
   279	
   280	function quotaFromHeaders(headers: Headers): import('../inference.js').QuotaObservation | undefined {
   281	  const remainingRequests = positiveNumber(headers.get('x-ratelimit-remaining-requests'));
   282	  const remainingTokens = positiveNumber(headers.get('x-ratelimit-remaining-tokens'));
   283	  const resetAt = resetTime(headers.get('x-ratelimit-reset-requests') ?? headers.get('retry-after'));
   284	  return remainingRequests === undefined && remainingTokens === undefined && !resetAt ? undefined : { remainingRequests, remainingTokens, resetAt };
   285	}
   286	
   287	function positiveNumber(value: string | null): number | undefined {
   288	  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return undefined;
   289	  return Number(value);
   290	}
   291	
   292	function resetTime(value: string | null): Date | undefined {
   293	  if (!value) return undefined;
   294	  if (/^\d+$/.test(value)) return new Date(Date.now() + Number(value) * 1_000);
   295	  const date = new Date(value);
   296	  return Number.isNaN(date.getTime()) ? undefined : date;
   297	}
   298	
   299	function isZeroPrice(pricing: OpenAIModel['pricing']): boolean {
   300	  return pricing?.prompt === '0' && pricing?.completion === '0';
   301	}
   302	
   303	function contentToText(content: OpenAIMessageContent): string | undefined {
   304	  if (typeof content === 'string') return content;
   305	  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('') || undefined;
   306	  return undefined;
   307	}
   308	
   309	function isContextOverflowError(status: number, text: string): boolean {
   310	  if (status !== 400 && status !== 413) return false;
   311	  const lower = text.toLowerCase();
   312	  return lower.includes('context length')
   313	    || lower.includes('maximum context length')
   314	    || lower.includes('context_length_exceeded')
   315	    || lower.includes('token limit')
   316	    || lower.includes('tokens limit')
   317	    || lower.includes('too many tokens')
   318	    || lower.includes('prompt is too long')
   319	    || lower.includes('string too long')
   320	    || lower.includes('exceeds the context window')
   321	    || lower.includes('please reduce the length')
   322	    || lower.includes('input is too long')
   323	    || lower.includes('request too large')
   324	    || lower.includes('payload too large');
   325	}
   326	
   327	async function providerError(response: Response): Promise<ProviderInvocationError> {
   328	  const retryAfter = response.headers.get('retry-after');
   329	  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined;
   330	  const rawBody = await response.text().catch(() => '');
   331	  let extractedMessage = '';
   332	  try {
   333	    const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string; message?: string };
   334	    extractedMessage = (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) || parsed.message || '';
   335	  } catch {
   336	    extractedMessage = rawBody.slice(0, 300);
   337	  }
   338	
   339	  const isOverflow = isContextOverflowError(response.status, rawBody);
   340	  let kind: RouteFailureKind;
   341	  let scope: RouteFailureScope;
   342	  let fallbackAllowed = true;
   343	  let retryable = false;
   344	
   345	  if (isOverflow) {
   346	    kind = 'context_overflow';
   347	    scope = 'model';
   348	    retryable = true;
   349	    fallbackAllowed = true;
   350	  } else if (response.status === 401 || response.status === 403) {
   351	    kind = 'authentication';
   352	    scope = 'key';
   353	    retryable = false;
   354	    fallbackAllowed = true;
   355	  } else if (response.status === 402) {
   356	    kind = 'quota_exhausted';
   357	    scope = 'key';
   358	    retryable = true;
   359	    fallbackAllowed = true;
   360	  } else if (response.status === 429) {
   361	    kind = 'rate_limit';
   362	    scope = 'key';
   363	    retryable = true;
   364	    fallbackAllowed = true;
   365	  } else if (response.status === 408 || response.status >= 500) {
   366	    kind = 'temporary';
   367	    scope = 'provider';
   368	    retryable = true;
   369	    fallbackAllowed = true;
   370	  } else if (response.status === 404 || response.status === 400) {
   371	    kind = 'unsupported';
   372	    scope = 'request';
   373	    retryable = false;
   374	    fallbackAllowed = false;
   375	  } else {
   376	    kind = 'permanent';
   377	    scope = 'provider';
   378	    retryable = false;
   379	    fallbackAllowed = false;
   380	  }
   381	
   382	  const errPrefix = `upstream request failed with HTTP ${response.status}`;
   383	  const fullMessage = extractedMessage ? `${errPrefix}: ${extractedMessage}` : errPrefix;
   384	  return new ProviderInvocationError(fullMessage, {
   385	    kind,
   386	    scope,
   387	    fallbackAllowed,
   388	    retryable,
   389	    sourceStatus: response.status,
   390	    retryAfterMs,
   391	    message: extractedMessage,
   392	  });
   393	}
```

## File: D:/FreeRoute/src/providers/anthropic.ts
```typescript
1	import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
     2	import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type NormalizedChatStreamEvent } from '../inference.js';
     3	import type { TokenUsage } from '../contracts.js';
     4	import { translateAnthropicRequest } from '../translators/anthropic-translator.js';
     5	
     6	interface AnthropicAdapterOptions {
     7	  baseUrl?: string;
     8	  getCredential: (credentialId: string) => Promise<string | undefined>;
     9	  fetch?: typeof globalThis.fetch;
    10	}
    11	
    12	export class AnthropicAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
    13	  readonly providerId = 'anthropic';
    14	  private readonly baseUrl: string;
    15	  private readonly getCredential: AnthropicAdapterOptions['getCredential'];
    16	  private readonly fetcher: typeof globalThis.fetch;
    17	
    18	  constructor(options: AnthropicAdapterOptions) {
    19	    this.baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    20	    this.getCredential = options.getCredential;
    21	    this.fetcher = options.fetch ?? globalThis.fetch;
    22	  }
    23	
    24	  async discoverModels(_credentialId: string): Promise<DiscoveredModel[]> {
    25	    // Anthropic doesn't have a model discovery API, using a static list for integration
    26	    return [
    27	      { modelId: 'claude-3-5-sonnet-latest', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'paid', priority: 0 },
    28	      { modelId: 'claude-3-5-haiku-latest', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'paid', priority: 0 },
    29	    ];
    30	  }
    31	
    32	  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    33	    const response = await this.fetcher(`${this.baseUrl}/v1/messages`, {
    34	      method: 'POST',
    35	      headers: await this.headers(input.credentialId, input.modelId),
    36	      body: JSON.stringify({
    37	        ...translateAnthropicRequest(input.request),
    38	        model: input.modelId,
    39	        max_tokens: 4096,
    40	      }),
    41	    });
    42	
    43	    if (!response.ok) throw await providerError(response);
    44	    const body = await response.json() as any;
    45	    const content = body.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    46	    const thought = body.content.find((b: any) => b.type === 'thinking')?.thinking;
    47	    const toolCalls = body.content
    48	      .filter((b: any) => b.type === 'tool_use')
    49	      .map((b: any) => ({
    50	        id: b.id,
    51	        type: 'function' as const,
    52	        function: { name: b.name, arguments: JSON.stringify(b.input) },
    53	      }));
    54	
    55	    return {
    56	      id: body.id,
    57	      model: body.model,
    58	      content,
    59	      thought,
    60	      toolCalls: toolCalls.length ? toolCalls : undefined,
    61	      usage: {
    62	        promptTokens: body.usage.input_tokens,
    63	        completionTokens: body.usage.output_tokens,
    64	        totalTokens: body.usage.input_tokens + body.usage.output_tokens,
    65	      }
    66	    };
    67	  }
    68	
    69	  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): AsyncIterable<NormalizedChatStreamEvent> {
    70	    const response = await this.fetcher(`${this.baseUrl}/v1/messages`, {
    71	      method: 'POST',
    72	      headers: { ...(await this.headers(input.credentialId, input.modelId)), 'anthropic-version': '2023-06-01' },
    73	      body: JSON.stringify({
    74	        ...translateAnthropicRequest(input.request),
    75	        model: input.modelId,
    76	        max_tokens: 4096,
    77	        stream: true,
    78	      }),
    79	    });
    80	
    81	    if (!response.ok) throw await providerError(response);
    82	    if (!response.body) throw new ProviderInvocationError('no stream body', { kind: 'temporary' });
    83	    
    84	    const reader = response.body.getReader();
    85	    const decoder = new TextDecoder();
    86	    let pending = '';
    87	    
    88	    while (true) {
    89	      const { done, value } = await reader.read();
    90	      if (done) break;
    91	      pending += decoder.decode(value, { stream: true });
    92	      const lines = pending.split(/\r?\n/);
    93	      pending = lines.pop() ?? '';
    94	      
    95	      for (const line of lines) {
    96	        if (!line.startsWith('data:')) continue;
    97	        const data = JSON.parse(line.slice(5));
    98	        
    99	        if (data.type === 'content_block_delta') {
   100	          if (data.delta.type === 'text_delta') {
   101	            yield { id: data.index, model: input.modelId, delta: data.delta.text };
   102	          }
   103	        } else if (data.type === 'message_delta') {
   104	          if (data.usage) {
   105	            yield { id: 'usage', model: input.modelId, usage: { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens, totalTokens: data.usage.input_tokens + data.usage.output_tokens } };
   106	          }
   107	        }
   108	      }
   109	    }
   110	  }
   111	
   112	  private async headers(credentialId: string, modelId: string): Promise<Record<string, string>> {
   113	    const secret = await this.getCredential(credentialId);
   114	    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
   115	    return { 
   116	      'x-api-key': secret,
   117	      'anthropic-version': '2023-06-01',
   118	      'content-type': 'application/json',
   119	      'anthropic-dangerous-direct-browser-access': 'true' // For local dev
   120	    };
   121	  }
   122	}
   123	
   124	async function providerError(response: Response): Promise<ProviderInvocationError> {
   125	  const rawBody = await response.text().catch(() => '');
   126	  let msg = rawBody;
   127	  try { msg = JSON.parse(rawBody).error.message; } catch {}
   128	  
   129	  let kind: import('../contracts.js').RouteFailureKind = 'permanent';
   130	  if (response.status === 401 || response.status === 403) kind = 'authentication';
   131	  else if (response.status === 429) kind = 'rate_limit';
   132	  else if (response.status >= 500) kind = 'temporary';
   133	  
   134	  return new ProviderInvocationError(`Anthropic error ${response.status}: ${msg}`, { kind, scope: 'provider' });
   135	}
```

