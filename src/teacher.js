import { generateContentWithFallback } from './apiClient.js';
import { SYSTEM_PROMPTS } from './config.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Teaches a topic by compiling slide materials and YouTube transcripts,
 * then streaming complete lesson layouts in real-time.
 * @param {string} topic - DSA Topic
 * @param {string} slideContext - Text content from local PDFs
 * @param {string} youtubeTranscript - Transcribed video captions
 * @param {function} onChunk - Direct callback to write chunks to the Express stream
 */
export async function teachTopic(topic, slideContext = '', youtubeTranscript = '', onChunk) {
  const textPrompt = `
Topic to Teach: ${topic}

--- ATTACHED COURSE SLIDES ---
${slideContext || 'No slides provided for this topic. Compensate with standard curriculum details.'}

--- ATTACHED YOUTUBE VIDEO TRANSCRIPT ---
${youtubeTranscript || 'No video transcript provided for this topic.'}

Thoroughly explain this topic. Ensure you cross-reference any definitions from slides and key explanations highlighted in the video transcript.
`;

  console.log(`[Teacher] Initiating real-time streaming lesson for: ${topic}...`);
  
  // 1. Stream the lesson main title first
  onChunk(`# ${topic} Study Portal\n\n`);
  
  // 2. Stream the core concept lecture notes
  await generateContentWithFallback(
    textPrompt,
    SYSTEM_PROMPTS.teacher,
    0.7,
    false, // Text request
    onChunk // Pipe chunks live
  );

  // 3. Pause for 2 seconds (Cool-down period to let the connection rest)
  console.log(`[Teacher] Text segment finished. Pausing 2s before diagram generation...`);
  await sleep(2000);

  // 4. Stream diagram markdown container
  onChunk("\n\n---\n\n## Visual Representation & Structural Layout\n\n\`\`\`text\n");

  // 5. Stream the visual model contents
  console.log(`[Teacher] Streaming visual diagram layout for ${topic}...`);
  const visualPrompt = `Create a clean, highly structured ASCII diagram illustrating the logical layout or operation execution flow for: "${topic}".`;
  
  try {
    await generateContentWithFallback(
      visualPrompt,
      SYSTEM_PROMPTS.visuals,
      0.4,
      true, // Visual request: prioritizes gemini-2.5-flash-image
      onChunk
    );
  } catch (visualError) {
    console.warn('[Teacher] Failed to stream visual diagram layout.');
    onChunk(`[Visual diagram not available for this topic. Error: ${visualError.message}]`);
  }

  // 6. Close ASCII code block markdown
  onChunk("\n\`\`\`\n");
}