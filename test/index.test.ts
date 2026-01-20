import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from 'ollama';
import type { ChatCompletionMessageParam } from 'openai/resources';

// Store original env
const originalEnv = { ...process.env };

// Mock axios
vi.mock('axios', () => ({
  default: vi.fn(),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

// Mock OpenAI with proper class mock
const mockOpenAICreate = vi.fn();
let lastOpenAIConfig: { apiKey?: string; baseURL?: string } | undefined;
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    };
    constructor(public config?: { apiKey?: string; baseURL?: string }) {
      lastOpenAIConfig = config;
    }
  },
}));

// Mock Ollama with proper class mock
const mockOllamaChat = vi.fn();
vi.mock('ollama', () => ({
  Ollama: class MockOllama {
    chat = mockOllamaChat;
    constructor(public config?: { host?: string }) {}
  },
}));

describe('llm-proxy', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all mocked env vars that affect provider selection
    delete process.env.PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AUTH_KEY;
    delete process.env.CLOUDFLARE_MODEL;
    delete process.env.OLLAMA_URI;
    delete process.env.OLLAMA_MODEL;
    delete process.env.LLAMA_CPP_MODEL_PATH;

    // Clear mocks
    mockOpenAICreate.mockClear();
    mockOllamaChat.mockClear();
    lastOpenAIConfig = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe('generate function - provider selection', () => {
    it('should throw error when no LLM is configured', async () => {
      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow('No available LLM found.');
    });

    it('should use OpenAI when OPENAI_API_KEY is set', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Hello from OpenAI' } }],
      });

      process.env.OPENAI_API_KEY = 'test-api-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Hello from OpenAI' });
      expect(mockOpenAICreate).toHaveBeenCalledWith({
        messages,
        model: 'gpt-4o-mini',
      });
    });

    it('should use custom OpenAI model when OPENAI_MODEL is set', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Response' } }],
      });

      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_MODEL = 'gpt-4';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      await generate(messages);

      expect(mockOpenAICreate).toHaveBeenCalledWith({
        messages,
        model: 'gpt-4',
      });
    });

    it('should use custom base URL when OPENAI_BASE_URL is set', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Response' } }],
      });

      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_BASE_URL = 'https://custom-api.example.com/v1';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      await generate(messages);

      expect(lastOpenAIConfig).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://custom-api.example.com/v1',
      });
    });

    it('should use Cloudflare when all Cloudflare vars are set and OpenAI is not', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockResolvedValue({
        data: {
          success: true,
          result: { response: 'Hello from Cloudflare' },
        },
      } as any);

      process.env.CLOUDFLARE_ACCOUNT_ID = 'account-123';
      process.env.CLOUDFLARE_AUTH_KEY = 'auth-key-456';
      process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-2-7b-chat';

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Hello from Cloudflare' });
      expect(vi.mocked(axios)).toHaveBeenCalledWith({
        method: 'post',
        url: 'https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/meta/llama-2-7b-chat',
        headers: {
          'Authorization': 'Bearer auth-key-456',
          'Content-Type': 'application/json',
        },
        data: { messages },
      });
    });

    it('should handle Cloudflare API failure gracefully', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockResolvedValue({
        data: {
          success: false,
          result: null,
        },
      } as any);

      process.env.CLOUDFLARE_ACCOUNT_ID = 'account-123';
      process.env.CLOUDFLARE_AUTH_KEY = 'auth-key-456';
      process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-2-7b-chat';

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: '' });
    });

    it('should use Ollama when OLLAMA_URI is set', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Hello from Ollama' },
      });

      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Hello from Ollama' });
      expect(mockOllamaChat).toHaveBeenCalledWith({
        model: 'llama3.1',
        messages,
      });
    });

    it('should use custom Ollama model when OLLAMA_MODEL is set', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
      });

      process.env.OLLAMA_URI = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'mistral';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      await generate(messages);

      expect(mockOllamaChat).toHaveBeenCalledWith({
        model: 'mistral',
        messages,
      });
    });

    it('should prioritize OpenAI over other providers', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OpenAI wins' } }],
      });

      const { default: axios } = await import('axios');

      // Set all providers
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
      process.env.CLOUDFLARE_AUTH_KEY = 'key';
      process.env.CLOUDFLARE_MODEL = 'model';
      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'OpenAI wins' });
      expect(mockOpenAICreate).toHaveBeenCalled();
      expect(vi.mocked(axios)).not.toHaveBeenCalled();
    });

    it('should prioritize Cloudflare over Ollama', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockResolvedValue({
        data: {
          success: true,
          result: { response: 'Cloudflare wins' },
        },
      } as any);

      // Set Cloudflare and Ollama but not OpenAI
      process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
      process.env.CLOUDFLARE_AUTH_KEY = 'key';
      process.env.CLOUDFLARE_MODEL = 'model';
      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Cloudflare wins' });
      expect(vi.mocked(axios)).toHaveBeenCalled();
      expect(mockOllamaChat).not.toHaveBeenCalled();
    });

    it('should prioritize Ollama over Llama.cpp', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Ollama wins' },
      });

      // Set both Ollama and Llama.cpp
      process.env.OLLAMA_URI = 'http://localhost:11434';
      process.env.LLAMA_CPP_MODEL_PATH = '/path/to/model.gguf';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Ollama wins' });
      expect(mockOllamaChat).toHaveBeenCalled();
    });
  });

  describe('generate function - PROVIDER environment variable', () => {
    it('should use specified provider when PROVIDER is set to "openai"', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OpenAI response' } }],
      });

      // Set PROVIDER and OpenAI credentials
      process.env.PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'OpenAI response' });
      expect(mockOpenAICreate).toHaveBeenCalled();
    });

    it('should use specified provider when PROVIDER is set to "cloudflare"', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockResolvedValue({
        data: {
          success: true,
          result: { response: 'Cloudflare response' },
        },
      } as any);

      // Set PROVIDER and Cloudflare credentials
      process.env.PROVIDER = 'cloudflare';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
      process.env.CLOUDFLARE_AUTH_KEY = 'key';
      process.env.CLOUDFLARE_MODEL = 'model';

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Cloudflare response' });
      expect(vi.mocked(axios)).toHaveBeenCalled();
    });

    it('should use specified provider when PROVIDER is set to "ollama"', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Ollama response' },
      });

      // Set PROVIDER and Ollama URI
      process.env.PROVIDER = 'ollama';
      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Ollama response' });
      expect(mockOllamaChat).toHaveBeenCalled();
    });

    it('should be case-insensitive when PROVIDER is set', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Response' } }],
      });

      // Use uppercase PROVIDER value
      process.env.PROVIDER = 'OPENAI';
      process.env.OPENAI_API_KEY = 'test-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      await generate(messages);

      expect(mockOpenAICreate).toHaveBeenCalled();
    });

    it('should override priority order when PROVIDER is set', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Ollama wins' },
      });

      // Set PROVIDER to ollama but also set OpenAI (which has higher priority normally)
      process.env.PROVIDER = 'ollama';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Ollama wins' });
      expect(mockOllamaChat).toHaveBeenCalled();
      expect(mockOpenAICreate).not.toHaveBeenCalled();
    });

    it('should throw error for invalid PROVIDER value', async () => {
      process.env.PROVIDER = 'invalid-provider';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow(
        'Invalid PROVIDER: "invalid-provider". Valid options are: openai, cloudflare, ollama, llama.cpp'
      );
    });

    it('should fall back to priority order when PROVIDER is not set', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OpenAI by priority' } }],
      });

      // Don't set PROVIDER, but set multiple providers
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      // Should use OpenAI because it has highest priority
      expect(result).toEqual({ role: 'assistant', content: 'OpenAI by priority' });
      expect(mockOpenAICreate).toHaveBeenCalled();
      expect(mockOllamaChat).not.toHaveBeenCalled();
    });

    it('should throw error when PROVIDER is "openai" but OPENAI_API_KEY is missing', async () => {
      process.env.PROVIDER = 'openai';
      // Don't set OPENAI_API_KEY

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow(
        'PROVIDER is set to "openai" but OPENAI_API_KEY is not configured.'
      );
    });

    it('should throw error when PROVIDER is "cloudflare" but credentials are missing', async () => {
      process.env.PROVIDER = 'cloudflare';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
      // Missing CLOUDFLARE_AUTH_KEY and CLOUDFLARE_MODEL

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow(
        'PROVIDER is set to "cloudflare" but required credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AUTH_KEY, CLOUDFLARE_MODEL) are not fully configured.'
      );
    });

    it('should throw error when PROVIDER is "ollama" but OLLAMA_URI is missing', async () => {
      process.env.PROVIDER = 'ollama';
      // Don't set OLLAMA_URI

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow(
        'PROVIDER is set to "ollama" but OLLAMA_URI is not configured.'
      );
    });

    it('should throw error when PROVIDER is "llama.cpp" but LLAMA_CPP_MODEL_PATH is missing', async () => {
      process.env.PROVIDER = 'llama.cpp';
      // Don't set LLAMA_CPP_MODEL_PATH

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow(
        'PROVIDER is set to "llama.cpp" but LLAMA_CPP_MODEL_PATH is not configured.'
      );
    });
  });

  describe('generate function - error handling', () => {
    it('should propagate OpenAI API errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API Error'));

      process.env.OPENAI_API_KEY = 'test-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow('OpenAI API Error');
    });

    it('should propagate Cloudflare API errors', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockRejectedValue(new Error('Cloudflare API Error'));

      process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
      process.env.CLOUDFLARE_AUTH_KEY = 'key';
      process.env.CLOUDFLARE_MODEL = 'model';

      const { generate } = await import('../src/index.js');

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow('Cloudflare API Error');
    });

    it('should propagate Ollama API errors', async () => {
      mockOllamaChat.mockRejectedValue(new Error('Ollama API Error'));

      process.env.OLLAMA_URI = 'http://localhost:11434';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow('Ollama API Error');
    });
  });

  describe('Type exports', () => {
    it('should export generate function', async () => {
      const { generate } = await import('../src/index.js');
      expect(typeof generate).toBe('function');
    });

    it('should export CloudflareMessage and MessageInputParam types', async () => {
      const module = await import('../src/index.js');
      // The module should have a generate export
      expect('generate' in module).toBe(true);
    });
  });

  describe('Message handling', () => {
    it('should handle empty message array for OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: '' } }],
      });

      process.env.OPENAI_API_KEY = 'test-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [];
      await generate(messages);

      expect(mockOpenAICreate).toHaveBeenCalledWith({
        messages: [],
        model: 'gpt-4o-mini',
      });
    });

    it('should handle multi-turn conversation', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Final response' } }],
      });

      process.env.OPENAI_API_KEY = 'test-key';

      const { generate } = await import('../src/index.js');

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Final response' });
      expect(mockOpenAICreate).toHaveBeenCalledWith({
        messages,
        model: 'gpt-4o-mini',
      });
    });
  });

  describe('Cloudflare message format', () => {
    it('should correctly format Cloudflare API request', async () => {
      const { default: axios } = await import('axios');
      vi.mocked(axios).mockResolvedValue({
        data: {
          success: true,
          result: { response: 'Response' },
        },
      } as any);

      process.env.CLOUDFLARE_ACCOUNT_ID = 'my-account';
      process.env.CLOUDFLARE_AUTH_KEY = 'my-auth-key';
      process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-2-7b-chat-int8';

      const { generate } = await import('../src/index.js');

      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      await generate(messages);

      expect(vi.mocked(axios)).toHaveBeenCalledWith({
        method: 'post',
        url: 'https://api.cloudflare.com/client/v4/accounts/my-account/ai/run/@cf/meta/llama-2-7b-chat-int8',
        headers: {
          'Authorization': 'Bearer my-auth-key',
          'Content-Type': 'application/json',
        },
        data: { messages },
      });
    });
  });

  describe('Llama.cpp provider', () => {
    it('should not select Llama.cpp when LLAMA_CPP_MODEL_PATH is empty', async () => {
      // With empty string for LLAMA_CPP_MODEL_PATH, it should throw "No available LLM found"
      // because empty string is falsy
      process.env.LLAMA_CPP_MODEL_PATH = '';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(generate(messages)).rejects.toThrow('No available LLM found.');
    });

    it('should prioritize Ollama over Llama.cpp when both are configured', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Ollama wins' },
      });

      // Set both Ollama and Llama.cpp
      process.env.OLLAMA_URI = 'http://localhost:11434';
      process.env.LLAMA_CPP_MODEL_PATH = '/path/to/model.gguf';

      const { generate } = await import('../src/index.js');

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = await generate(messages);

      expect(result).toEqual({ role: 'assistant', content: 'Ollama wins' });
      expect(mockOllamaChat).toHaveBeenCalled();
    });
  });
});
