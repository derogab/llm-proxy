# llm-proxy
A simple and lightweight proxy for seamless integration with multiple LLM providers including OpenAI, Ollama, Cloudflare AI, and Llama.cpp.

## Features

- **Multi-provider support**: Switch between OpenAI, Ollama, Cloudflare AI, and Llama.cpp with environment variables.
- **TypeScript support**: Full TypeScript definitions included.
- **Simple API**: Single function interface for all providers.
- **Automatic provider detection**: Automatically selects the best available provider based on environment variables.

## Installation

```bash
npm install @derogab/llm-proxy
```

## Quick Start

```typescript
import { generate } from '@derogab/llm-proxy';

const messages = [
  { role: 'user', content: 'Hello, how are you?' }
];

const response = await generate(messages);
console.log(response.content);
```

## Configuration

The package automatically detects which LLM provider to use based on your environment variables.  
Configure one or more providers:

### Provider Selection
```bash
LLM_PROVIDER=openai # Optional, explicitly select a provider (openai, cloudflare, ollama, llama.cpp)
```

When `LLM_PROVIDER` is set, the package will use that specific provider and skip automatic detection. This is useful when you have multiple providers configured but want to force a specific one. If the required credentials for the specified provider are not configured, an error will be thrown. If not set, consider [provider priority](#provider-priority).

> **Note:** The legacy `PROVIDER` environment variable is still supported as a fallback for backward compatibility, but `LLM_PROVIDER` takes precedence when both are set.

### OpenAI
```bash
OPENAI_API_KEY=your_openai_api_key # Required
OPENAI_BASE_URL=https://api.openai.com/v1 # Optional
OPENAI_MODEL=gpt-4o-mini                  # Optional, defaults to gpt-4o-mini
```

### Cloudflare AI
```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id # Required
CLOUDFLARE_AUTH_KEY=your_auth_key # Required
CLOUDFLARE_MODEL=your_model_name # Required
```

### Ollama (Local)
```bash
OLLAMA_URI=http://localhost:11434 # Optional, defaults to http://localhost:11434
OLLAMA_MODEL=llama3.1             # Optional, defaults to llama3.1
```

### Llama.cpp (Local)
```bash
LLAMA_CPP_MODEL_PATH=/path/to/your/model.gguf # Required, path to your GGUF model file
```

## API Reference

### `generate(messages: MessageInputParam[]): Promise<MessageInputParam>`

Generates a response from the configured LLM provider.

**Parameters:**
- `messages`: Array of message objects with `role` and `content` properties

**Returns:**
- Promise that resolves to a message object with `role` and `content` properties

**Message Format:**
```typescript
type MessageInputParam = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};
```

## Provider Priority

If the `LLM_PROVIDER` environment variable is set (or the legacy `PROVIDER` as fallback), the specified provider will be used directly (valid values: `openai`, `cloudflare`, `ollama`, `llama.cpp`).

Otherwise, the package selects providers automatically in the following order:
1. **OpenAI** (if `OPENAI_API_KEY` is set)
2. **Cloudflare AI** (if `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_KEY`, and `CLOUDFLARE_MODEL` are set)
3. **Ollama** (if `OLLAMA_URI` is set)
4. **Llama.cpp** (if `LLAMA_CPP_MODEL_PATH` is set)

If no providers are configured, the function throws an error.

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build
```

## Credits
_LLM Proxy_ is made with ♥ by [derogab](https://github.com/derogab) and it's released under the [MIT license](./LICENSE).

## Contributors

<a href="https://github.com/derogab/llm-proxy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=derogab/llm-proxy" />
</a>

## Tip
If you like this project or directly benefit from it, please consider buying me a coffee:  
🔗 `bc1qd0qatgz8h62uvnr74utwncc6j5ckfz2v2g4lef`  
⚡️ `derogab@sats.mobi`  
💶 [Sponsor on GitHub](https://github.com/sponsors/derogab)

## Stargazers over time
[![Stargazers over time](https://starchart.cc/derogab/llm-proxy.svg?variant=adaptive)](https://starchart.cc/derogab/llm-proxy)
