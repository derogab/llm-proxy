/**
 * Llama.cpp Integration Tests
 *
 * This file runs as a standalone Node.js script (not via Vitest) because
 * the source code uses `new Function()` for dynamic imports which Vitest
 * cannot intercept.
 *
 * Run with: npx tsx src/llama-cpp.integration.test.mts
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveModelFile } from 'node-llama-cpp';
import type { Message } from 'ollama';

const MODELS_DIR = join(tmpdir(), 'llm-proxy-test-models');

// Store original env
const originalEnv = { ...process.env };

async function downloadModel(): Promise<string> {
  console.log('Downloading model using node-llama-cpp...');

  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
  }

  // Download TinyLlama - a very small model (~600MB) that's publicly available
  const downloadedPath = await resolveModelFile(
    'hf:TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    MODELS_DIR
  );

  console.log(`Model downloaded to: ${downloadedPath}`);
  return downloadedPath;
}

async function test(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function runTests() {
  console.log('\n=== Llama.cpp Integration Tests ===\n');

  // Setup
  const modelPath = await downloadModel();

  // Clear all provider env vars
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_AUTH_KEY;
  delete process.env.CLOUDFLARE_MODEL;
  delete process.env.OLLAMA_URI;
  delete process.env.OLLAMA_MODEL;

  // Set Llama.cpp model path
  process.env.LLAMA_CPP_MODEL_PATH = modelPath;

  const results: boolean[] = [];

  // Test 1: Basic generation
  results.push(await test('should generate a response using Llama.cpp with a real model', async () => {
    const { generate } = await import('./index.js');

    const messages: Message[] = [
      { role: 'user', content: 'Say hello in exactly 3 words.' }
    ];

    const result = await generate(messages);

    if (result.role !== 'assistant') throw new Error(`Expected role 'assistant', got '${result.role}'`);
    if (typeof result.content !== 'string') throw new Error(`Expected content to be string`);
    if (!result.content || result.content.length === 0) throw new Error(`Expected non-empty content`);
  }));

  // Test 2: Multi-turn conversation
  results.push(await test('should handle multi-turn conversation with chat history', async () => {
    const { generate } = await import('./index.js');

    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant that gives very brief responses.' },
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'And 3+3?' }
    ];

    const result = await generate(messages);

    if (result.role !== 'assistant') throw new Error(`Expected role 'assistant', got '${result.role}'`);
    if (typeof result.content !== 'string') throw new Error(`Expected content to be string`);
    if (!result.content || result.content.length === 0) throw new Error(`Expected non-empty content`);
  }));

  // Test 3: System message
  results.push(await test('should handle system message properly', async () => {
    const { generate } = await import('./index.js');

    const messages: Message[] = [
      { role: 'system', content: 'Always respond with exactly one word.' },
      { role: 'user', content: 'What color is the sky?' }
    ];

    const result = await generate(messages);

    if (result.role !== 'assistant') throw new Error(`Expected role 'assistant', got '${result.role}'`);
    if (typeof result.content !== 'string') throw new Error(`Expected content to be string`);
    if (!result.content || result.content.length === 0) throw new Error(`Expected non-empty content`);
  }));

  // Test 4: Error handling for non-existent model
  results.push(await test('should throw error for non-existent model path', async () => {
    process.env.LLAMA_CPP_MODEL_PATH = '/path/to/nonexistent/model.gguf';

    const { generate } = await import('./index.js');

    const messages: Message[] = [{ role: 'user', content: 'Hello' }];

    let threw = false;
    try {
      await generate(messages);
    } catch {
      threw = true;
    }

    // Restore correct model path
    process.env.LLAMA_CPP_MODEL_PATH = modelPath;

    if (!threw) throw new Error('Expected generate to throw an error');
  }));

  // Cleanup
  process.env = { ...originalEnv };

  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
