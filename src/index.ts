// Dependencies.
import axios from 'axios';
import * as dotenv from 'dotenv';
import { Ollama } from 'ollama';
import OpenAI from 'openai';

// Types.
import type { ChatCompletionMessageParam } from 'openai/resources';
import type { Message } from 'ollama';

export type CloudflareMessage = {
  role: string;
  content: string;
};

export type MessageInputParam = ChatCompletionMessageParam | Message | CloudflareMessage;

// Configs.
dotenv.config();

/**
 * Generate a response from the OpenAI API.
 * 
 * @param messages the messages to be sent to the OpenAI API.
 * @returns the response string from the OpenAI API.
 */
async function generate_openai(messages: ChatCompletionMessageParam[]): Promise<ChatCompletionMessageParam> {
  // Create a new instance of the OpenAI class.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });
  // Call the OpenAI API.
  const chatCompletion = await openai.chat.completions.create({
    messages: messages,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });
  // Return the response.
  return chatCompletion?.choices[0]?.message as ChatCompletionMessageParam;
}

/**
 * Generate a response using Ollama Local API.
 * 
 * @param messages the messages to be sent to Ollama.
 * @returns the response string.
 */
async function generate_ollama(messages: Message[]): Promise<Message> {
  // Create a new instance of the OpenAI class.
  const ollama = new Ollama({ host: process.env.OLLAMA_URI || 'http://localhost:11434' });
  // Call the Ollama API.
  const response = await ollama.chat({
    model: process.env.OLLAMA_MODEL || 'llama3.1',
    messages: messages,
  });
  // Return the response.
  return response['message'];
}

/**
 * Convert messages to chat history.
 *
 * Llama.cpp expects the chat history in a custom format.
 * Convert the default messages format to the Llama.cpp format.
 *
 * @param messages the messages to be sent to Llama.cpp.
 * @returns the same messages in the Llama.cpp format.
 */
function convert_messages_to_chat_history(messages: Message[]): any[] {
  // Init chat history.
  const chat_history: any[] = [];
  // Loop through messages.
  for (const message of messages) {
    if (message.role === 'system' || message.role === 'user') {
      chat_history.push({
        type: message.role,
        text: message.content
      });
    } else if (message.role === 'assistant') {
      chat_history.push({
        type: "model",
        response: [message.content]
      });
    }
  }
  // Return the chat history.
  return chat_history;
}

/**
 * Generate a response using Llama.cpp Local Model.
 * 
 * @param messages the messages to be sent to Llama.cpp.
 * @returns the response string.
 */
async function generate_llama_cpp(messages: Message[]): Promise<Message> {
  // Dynamically import node-llama-cpp only when needed.
  const dynamicImport = new Function('specifier', 'return import(specifier)'); // Using Function constructor to prevent TypeScript from transpiling dynamic import to require()
  const { getLlama, LlamaChatSession } = await dynamicImport('node-llama-cpp');

  // Create a new instance of the Llama.cpp class.
  const llama = await getLlama();
  // Set model to use.
  const modelPath = process.env.LLAMA_CPP_MODEL_PATH;
  if (!modelPath) {
    throw new Error('LLAMA_CPP_MODEL_PATH is not set.');
  }
  const model = await llama.loadModel({
    modelPath: modelPath,
  });
  // Import history into the context.
  const context = await model.createContext();
  const session = new LlamaChatSession({
    contextSequence: context.getSequence()
  });
  if (messages.length > 1) session.setChatHistory(convert_messages_to_chat_history(messages.slice(0, -1)));

  // Generate and return the response.
  return {
    role: 'assistant',
    content: await session.prompt(messages[messages.length - 1]?.content || ''),
  };
}

/**
 * Generate a response using Cloudflare AI API.
 * 
 * @param messages the messages to be sent to Cloudflare AI.
 * @returns the response string.
 */
async function generate_cloudflare(messages: CloudflareMessage[]): Promise<CloudflareMessage> {
  // Generate API URL based on the environment variables.
  const model_url = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID + '/ai/run/' + process.env.CLOUDFLARE_MODEL;
  // Call the Cloudflare AI API.
  const response = await axios({
    method: 'post',
    url: model_url,
    headers: {
      'Authorization': 'Bearer ' + process.env.CLOUDFLARE_AUTH_KEY,
      'Content-Type' : 'application/json',
    }, 
    data: {
      messages: messages,
    },
  });
  // Extract the response message.
  const msg = response.data.success ? response.data.result.response : '';
  // Return the response.
  return { role: 'assistant', content: msg };
}

/**
 * Generate a response using an LLM.
 *
 * @param messages the messages to be sent to the LLM.
 * @returns the response string.
 */
export async function generate(messages: MessageInputParam[]): Promise<MessageInputParam> {
  // If PROVIDER environment variable is set, use the specified provider.
  const provider = process.env.PROVIDER?.toLowerCase();

  if (provider) {
    switch (provider) {
      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('PROVIDER is set to "openai" but OPENAI_API_KEY is not configured.');
        }
        return await generate_openai(messages as ChatCompletionMessageParam[]);
      case 'cloudflare':
        if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AUTH_KEY || !process.env.CLOUDFLARE_MODEL) {
          throw new Error('PROVIDER is set to "cloudflare" but required credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AUTH_KEY, CLOUDFLARE_MODEL) are not fully configured.');
        }
        return await generate_cloudflare(messages as CloudflareMessage[]);
      case 'ollama':
        if (!process.env.OLLAMA_URI) {
          throw new Error('PROVIDER is set to "ollama" but OLLAMA_URI is not configured.');
        }
        return await generate_ollama(messages as Message[]);
      case 'llama.cpp':
        if (!process.env.LLAMA_CPP_MODEL_PATH) {
          throw new Error('PROVIDER is set to "llama.cpp" but LLAMA_CPP_MODEL_PATH is not configured.');
        }
        return await generate_llama_cpp(messages as Message[]);
      default:
        throw new Error(`Invalid PROVIDER: "${process.env.PROVIDER}". Valid options are: openai, cloudflare, ollama, llama.cpp`);
    }
  }

  // If PROVIDER is not set, use the default priority order.
  // Check what LLM to use, based on the environment variables.
  if (process.env.OPENAI_API_KEY) {
    // If openai key is available, use openai.
    return await generate_openai(messages as ChatCompletionMessageParam[]);

  } else if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AUTH_KEY && process.env.CLOUDFLARE_MODEL) {
    // If cloudflare keys are available, use cloudflare.
    return await generate_cloudflare(messages as CloudflareMessage[]);

  } else if (process.env.OLLAMA_URI) {
    // If ollama is available, use ollama.
    return await generate_ollama(messages as Message[]);

  } else if (process.env.LLAMA_CPP_MODEL_PATH) {
    // If llama_cpp is available, use llama_cpp.
    return await generate_llama_cpp(messages as Message[]);

  } else {
    // Throw an error if no LLM is available.
    throw new Error('No available LLM found.');
  }
}
