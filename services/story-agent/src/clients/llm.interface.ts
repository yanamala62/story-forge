export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMChatOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  jsonMode?: boolean;
}

export interface ILLMClient {
  chat(model: string, messages: LLMMessage[], options?: LLMChatOptions): Promise<string>;
  chatJSON<T>(model: string, messages: LLMMessage[], options?: LLMChatOptions): Promise<T>;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<string[]>;
}
