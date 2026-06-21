export { NarrationAgentService } from './narration-agent.service.js';
export type { GenerateNarrationInput, GenerateNarrationResult } from './narration-agent.service.js';
export {
  generateNarrationWithEdgeTTS,
  buildNarrationText,
  EDGE_TTS_VOICES,
} from './providers/edge-tts.provider.js';
export type { EdgeTTSVoice, EdgeTTSRequest, EdgeTTSResult } from './providers/edge-tts.provider.js';
