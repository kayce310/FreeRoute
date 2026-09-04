import type { Capability, FreeTierClass } from './contracts.js';

export interface ProviderPreset {
  id: string;
  name: string;
  adapterType: 'openai-compatible' | 'gemini';
  baseUrl: string;
  apiKeyUrl: string;
  website: string;
  category: 'free' | 'freemium' | 'local';
  descriptionEn: string;
  descriptionVi: string;
  keyInstructionsEn: string;
  keyInstructionsVi: string;
  seedModels: Array<{
    modelId: string;
    capabilities: Capability[];
    freeTier: FreeTierClass;
    priority?: number;
  }>;
}

/**
 * Curated provider catalog synthesized from 9router, OmniRoute, and FreeLLMAPI.
 * Contains free tier endpoints, direct key creation links, and verified free models.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    adapterType: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    website: 'https://openrouter.ai',
    category: 'free',
    descriptionEn: 'Aggregator with dozens of recurring zero-credit free models (:free suffix).',
    descriptionVi: 'Cổng tổng hợp với hàng chục model miễn phí 0đ định kỳ (hậu tố :free).',
    keyInstructionsEn: 'Create a free account, generate an API key with $0 balance.',
    keyInstructionsVi: 'Tạo tài khoản miễn phí, tạo API key không cần nạp tiền.',
    seedModels: [
      { modelId: 'google/gemini-2.0-flash-exp:free', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'free_verified', priority: 100 },
      { modelId: 'deepseek/deepseek-r1:free', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'meta-llama/llama-3.3-70b-instruct:free', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'qwen/qwen-2.5-coder-32b-instruct:free', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'mistralai/mistral-small-24b-instruct-2501:free', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 85 },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    adapterType: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyUrl: 'https://console.groq.com/keys',
    website: 'https://groq.com',
    category: 'free',
    descriptionEn: 'Ultra-fast LPU inference (500+ tok/s) with generous recurring free limits.',
    descriptionVi: 'Tốc độ siêu nhanh với chip LPU (500+ tok/s), hạn ngạch miễn phí dồi dào.',
    keyInstructionsEn: 'Sign in to Groq Console and create an API Key (no credit card needed).',
    keyInstructionsVi: 'Đăng nhập Groq Console và tạo API Key (không cần thẻ tín dụng).',
    seedModels: [
      { modelId: 'llama-3.3-70b-versatile', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'llama-3.1-8b-instant', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'mixtral-8x7b-32768', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 80 },
      { modelId: 'qwen/qwen3-32b', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 85 },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    adapterType: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    website: 'https://aistudio.google.com',
    category: 'free',
    descriptionEn: 'Official Google AI Studio with free 15 RPM / 1M TPM for Gemini 2.0 Flash.',
    descriptionVi: 'Google AI Studio chính thức miễn phí 15 RPM / 1M TPM cho Gemini 2.0 Flash.',
    keyInstructionsEn: 'Sign in with Google Account on AI Studio, click "Create API key".',
    keyInstructionsVi: 'Đăng nhập tài khoản Google tại AI Studio, bấm "Create API key".',
    seedModels: [
      { modelId: 'gemini-2.0-flash', capabilities: ['chat', 'streaming', 'tools', 'vision', 'structured-output'], freeTier: 'free_verified', priority: 100 },
      { modelId: 'gemini-2.0-flash-lite-preview-02-05', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'gemini-1.5-flash', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'free_verified', priority: 85 },
      { modelId: 'gemini-1.5-pro', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'free_verified', priority: 80 },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    adapterType: 'openai-compatible',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyUrl: 'https://cloud.cerebras.ai/platform',
    website: 'https://www.cerebras.ai',
    category: 'free',
    descriptionEn: 'World-record speed inference (1800+ tok/s) with free developer tier.',
    descriptionVi: 'Tốc độ kỷ lục thế giới (1800+ tok/s) với gói miễn phí cho lập trình viên.',
    keyInstructionsEn: 'Sign up on Cerebras Cloud, verify email, and generate an API key.',
    keyInstructionsVi: 'Đăng ký trên Cerebras Cloud, xác thực email và tạo API key.',
    seedModels: [
      { modelId: 'llama-3.3-70b', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
      { modelId: 'llama-3.1-8b', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
      { modelId: 'qwen-3-32b', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 85 },
    ],
  },
  {
    id: 'github',
    name: 'GitHub Models',
    adapterType: 'openai-compatible',
    baseUrl: 'https://models.github.ai/inference',
    apiKeyUrl: 'https://github.com/settings/tokens',
    website: 'https://github.com/marketplace/models',
    category: 'free',
    descriptionEn: 'Free Azure AI / OpenAI access (GPT-4o, Llama 3.3) for GitHub accounts.',
    descriptionVi: 'Truy cập GPT-4o, Llama 3.3 miễn phí qua GitHub Personal Access Token.',
    keyInstructionsEn: 'Generate a classic GitHub token (no specific scopes required for Models).',
    keyInstructionsVi: 'Tạo GitHub Personal Access Token (không cần chọn quyền đặc biệt nào).',
    seedModels: [
      { modelId: 'gpt-4o-mini', capabilities: ['chat', 'streaming', 'tools', 'vision', 'structured-output'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'gpt-4o', capabilities: ['chat', 'streaming', 'tools', 'vision', 'structured-output'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'Meta-Llama-3.1-70B-Instruct', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    adapterType: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    website: 'https://mistral.ai',
    category: 'free',
    descriptionEn: 'Official European frontier AI with free Experimentation tier for Codestral.',
    descriptionVi: 'Mô hình lập trình Codestral hàng đầu châu Âu với gói thử nghiệm miễn phí.',
    keyInstructionsEn: 'Register on Mistral Console and create an API Key under Experimentation.',
    keyInstructionsVi: 'Đăng ký tại Mistral Console và tạo key trong gói Experimentation.',
    seedModels: [
      { modelId: 'codestral-latest', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'mistral-small-latest', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'open-mistral-nemo', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 80 },
    ],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    adapterType: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    website: 'https://siliconflow.cn',
    category: 'free',
    descriptionEn: 'Offers permanent free access to DeepSeek-R1, DeepSeek-V3, and Qwen models.',
    descriptionVi: 'Cung cấp miễn phí vĩnh viễn các dòng DeepSeek-R1, DeepSeek-V3 và Qwen.',
    keyInstructionsEn: 'Register with email, phone or GitHub, create an API key in Account.',
    keyInstructionsVi: 'Đăng ký tài khoản và tạo API key trong mục Account.',
    seedModels: [
      { modelId: 'deepseek-ai/DeepSeek-R1', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'deepseek-ai/DeepSeek-V3', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'Qwen/Qwen2.5-7B-Instruct', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 85 },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    adapterType: 'openai-compatible',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyUrl: 'https://huggingface.co/settings/tokens',
    website: 'https://huggingface.co',
    category: 'free',
    descriptionEn: 'Serverless Inference Router with monthly free community credits.',
    descriptionVi: 'Cổng Inference Serverless miễn phí định kỳ cho cộng đồng nguồn mở.',
    keyInstructionsEn: 'Create a free Access Token (Read role) in your Hugging Face Settings.',
    keyInstructionsVi: 'Tạo Access Token quyền Read trong Hugging Face Settings.',
    seedModels: [
      { modelId: 'meta-llama/Llama-3.3-70B-Instruct', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 88 },
      { modelId: 'deepseek-ai/DeepSeek-R1', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'Qwen/Qwen2.5-72B-Instruct', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    adapterType: 'openai-compatible',
    baseUrl: 'https://api.cohere.com/v2',
    apiKeyUrl: 'https://dashboard.cohere.com/api-keys',
    website: 'https://cohere.com',
    category: 'freemium',
    descriptionEn: 'Enterprise RAG and reasoning models (Command R+) with trial key.',
    descriptionVi: 'Mô hình tối ưu RAG doanh nghiệp (Command R+) với key thử nghiệm miễn phí.',
    keyInstructionsEn: 'Sign up at Cohere Dashboard and generate a Trial Key.',
    keyInstructionsVi: 'Đăng ký tại Cohere Dashboard và lấy Trial Key.',
    seedModels: [
      { modelId: 'command-r-plus', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_unverified', priority: 85 },
      { modelId: 'command-r', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_unverified', priority: 80 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    adapterType: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKeyUrl: 'http://127.0.0.1:11434',
    website: 'https://ollama.com',
    category: 'local',
    descriptionEn: 'Runs locally on your GPU/CPU. Completely free, private, and unlimited.',
    descriptionVi: 'Chạy trực tiếp trên máy của bạn. Hoàn toàn miễn phí, riêng tư, không giới hạn.',
    keyInstructionsEn: 'Install Ollama locally, run "ollama serve". Any dummy key works.',
    keyInstructionsVi: 'Cài Ollama trên máy, chạy "ollama serve". Nhập key bất kỳ (vd: ollama).',
    seedModels: [
      { modelId: 'llama3.3', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'deepseek-r1', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'qwen2.5-coder', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
    ],
  },
];
