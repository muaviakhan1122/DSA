import { TEXT_MODELS, GROQ_API_KEY } from './config.js';
import dotenv from 'dotenv';

dotenv.config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Universal API Client for Groq Cloud (LLaMA 3)
 * Handles text, ASCII visuals, quizzes, and concept checking via Groq's high-speed LPUs.
 */
export async function generateContentWithFallback(prompt, systemInstruction, temperature = 0.7, isVisualRequest = false, onChunk) {
  if (!GROQ_API_KEY) {
    throw new Error('[API Client] GROQ_API_KEY is missing from environment variables.');
  }

  let finalError = null;

  for (let i = 0; i < TEXT_MODELS.length; i++) {
    const currentModel = TEXT_MODELS[i];
    let attempts = 0;
    const maxAttempts = 2;
    let backoffDelay = 1500;

    while (attempts < maxAttempts) {
      try {
        console.log(`[Groq Cloud] Executing request using model: ${currentModel}`);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: prompt }
            ],
            temperature: temperature,
            stream: !!onChunk // Stream if frontend provided a callback
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        // Streaming Response Handler
        if (onChunk) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                    const textChunk = parsed.choices[0].delta.content;
                    fullText += textChunk;
                    onChunk(textChunk);
                  }
                } catch (e) { } // Ignore split JSON buffers
              }
            }
          }
          if (fullText.trim().length > 0) return fullText;
        } 
        
        // Standard Static Response Handler (For Quizzes/Grading)
        else {
          const data = await response.json();
          if (data.choices && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content;
          }
        }

      } catch (modelError) {
        attempts++;
        console.warn(`[Groq Cloud] Warning: ${currentModel} failed (Attempt ${attempts}/${maxAttempts}). Error: ${modelError.message}`);
        finalError = modelError;
        
        if (attempts < maxAttempts) {
          await sleep(backoffDelay);
          backoffDelay *= 2;
        }
      }
    }

    if (i < TEXT_MODELS.length - 1) {
      await sleep(2000);
    }
  }

  throw new Error(`[Groq Cloud] CRITICAL: All LLaMA models failed. Last error: ${finalError?.message}`);
}