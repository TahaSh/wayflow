// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Chat Orchestrator
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
export { type ChatHandlerOptions, createChatHandler } from './chat-handler'
export type {
  CreateLLMHandlerOptions,
  ModelHandler,
  ModelTarget,
} from './dispatch'
export { createLLMHandler } from './dispatch'
export type { CreateImageGenerationHandlerOptions } from './image-dispatch'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Image Dispatch
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
export { createImageGenerationHandler } from './image-dispatch'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Image Provider Contract
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
export type {
  ImageGenRequest,
  ImageGenResult,
  ImageProvider,
  ImageRef,
} from './image-provider'
export type { MockImageProviderOptions, MockProviderOptions } from './mock'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Mock Providers (zero-network, for docs / preview embeds)
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
export { createMockImageProvider, createMockProvider } from './mock'
export type {
  ChatContent,
  ChatContentPart,
  ChatEvent,
  ChatMessage,
  ChatRole,
  ChatTool,
  ChatToolCall,
  LLMProvider,
} from './provider'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Provider Contract
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
export type { JsonSchema } from './schema'
