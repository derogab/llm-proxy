# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Build all outputs (CJS, ESM, and types)
npm run build:cjs    # Build CommonJS output only
npm run build:esm    # Build ESM output only
npm run build:types  # Build type declarations only
```

## Test Commands

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

Tests are written using Vitest and cover:
- Provider selection logic (OpenAI, Cloudflare, Ollama priority)
- Error handling for all providers
- Message format conversion for Llama.cpp
- API request formatting

## Architecture

This is a TypeScript npm package (`@derogab/llm-proxy`) that provides a unified interface for multiple LLM providers. The entire implementation is in a single file: `src/index.ts`.

### Provider Selection

The `generate()` function automatically selects a provider based on environment variables in this priority order:
1. **OpenAI** - if `OPENAI_API_KEY` is set
2. **Cloudflare AI** - if `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_KEY`, and `CLOUDFLARE_MODEL` are all set
3. **Ollama** - if `OLLAMA_URI` is set
4. **Llama.cpp** - if `LLAMA_CPP_MODEL_PATH` is set

### Build Output

The package builds to three output formats:
- `dist/cjs/` - CommonJS (for `require()`)
- `dist/esm/` - ES Modules (for `import`)
- `dist/types/` - TypeScript declarations
