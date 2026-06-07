import { generateContentWithFallback } from './apiClient.js';
import { SYSTEM_PROMPTS } from './config.js';

export async function getConceptCheckQuestion(topic) {
  const prompt = `Generate one conceptual, analytical question for the topic: "${topic}". 
The question should test deep understanding of "why" a structure or algorithm works, rather than simple definitions. 
Example for Binary Search: "Why is Binary Search O(log n)?"`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.evaluator,
      0.7
    );
    return responseText;
  } catch (error) {
    console.error('Error generating concept check question:', error);
    return `Could not generate concept check for ${topic}.`;
  }
}

export async function evaluateConceptResponse(topic, question, studentAnswer) {
  const prompt = `
Topic: ${topic}
Question: ${question}
Student's Answer: "${studentAnswer}"

Evaluate this answer. Your output must strictly follow this structure:
Score: [X]/10
Weakness: [Briefly point out any logical gaps or omissions in the explanation]
Feedback: [Constructive guidance on how to improve the explanation to score 10/10]
`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.evaluator,
      0.3
    );

    const scoreMatch = responseText.match(/Score:\s*(\d+)\s*\/10/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    return {
      rawFeedback: responseText,
      score: score
    };
  } catch (error) {
    console.error('Error evaluating response:', error);
    return { rawFeedback: 'Evaluation failed.', score: null };
  }
}

// Updated to enforce clean HTML outputs instead of raw Markdown
export async function generateQuiz(topic, quizType = 'mix') {
  const prompt = `
Generate a practice quiz for the topic: "${topic}".
Quiz format requested: "${quizType}" (Options: MCQs, True/False, Short Questions, Code Tracing/Output Prediction).

CRITICAL INSTRUCTION:
Do NOT use Markdown (* or #). You must output the entire quiz using clean, semantic HTML tags.
Use <h3> for headings, <p> for questions, and <ol type="a"> or <ul> for choices.
Make it look like a professional, clean university exam paper. 
Place the Answer Key at the very end wrapped inside a <div class="hidden"> tag so it doesn't show immediately.
`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.evaluator,
      0.7
    );
    return responseText;
  } catch (error) {
    console.error('Error generating quiz:', error);
    return 'Could not generate quiz at this time.';
  }
}