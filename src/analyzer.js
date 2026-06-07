import { generateContentWithFallback } from './apiClient.js';
import { SYSTEM_PROMPTS } from './config.js';

// Step 7: Assignment Analyzer
export async function analyzeAssignments(assignmentContext) {
  if (!assignmentContext) {
    return 'No assignments found to analyze. Please place assignment files in data/assignments/.';
  }

  const prompt = `
The following is the text content extracted from the student's assignments:
${assignmentContext}

Analyze these assignments and provide:
1. Core Concepts Tested: Key algorithms or data structures targeted.
2. Frequently Repeated Patterns: Common implementation styles or problem-solving structures.
3. Likely Exam Questions & Probability: Predict specific question formats that could appear in exams based on these assignments (e.g., "Probability: High").
`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.predictor,
      0.6
    );
    return responseText;
  } catch (error) {
    console.error('Error analyzing assignments:', error);
    return 'Unable to complete assignment analysis.';
  }
}

// Step 9: Sir Predictor
export async function predictExamTopics(slides, assignments, quizzes) {
  const prompt = `
Review the available course materials to predict the final exam focus:

--- Raw Slide Contents ---
${slides || 'No slides loaded.'}

--- Assignment Records ---
${assignments || 'No assignments loaded.'}

--- Past Quiz Material ---
${quizzes || 'No quizzes loaded.'}

Based strictly on the emphasis, patterns, and structure of these documents:
List the Top 5 High-Probability Questions/Topics likely to appear in the final exam.
For each, provide a brief reasoning explaining why it is prioritized.
`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.predictor,
      0.5
    );
    return responseText;
  } catch (error) {
    console.error('Error executing exam prediction:', error);
    return 'Unable to generate exam prediction.';
  }
}

// Step 9: Exam Simulator
export async function simulateFinalExam(slides, assignments, quizzes) {
  const prompt = `
Generate a balanced final examination based on the following context:

Slides: ${slides ? 'Loaded' : 'Not Loaded'}
Assignments: ${assignments ? 'Loaded' : 'Not Loaded'}
Quizzes: ${quizzes ? 'Loaded' : 'Not Loaded'}

Create an exam with three clear parts:
- Section A: 5 MCQs (focused on time complexity and logic)
- Section B: 3 Short Questions (conceptual derivations)
- Section C: 2 Long Questions (code tracing, design, or visual simulation like rotations/tree balancing)

Present the exam clearly. Place the complete answer key at the very bottom of the response, separated by a clean marker.
`;

  try {
    const responseText = await generateContentWithFallback(
      prompt,
      SYSTEM_PROMPTS.predictor,
      0.7
    );
    return responseText;
  } catch (error) {
    console.error('Error simulating final exam:', error);
    return 'Unable to generate mock exam.';
  }
}