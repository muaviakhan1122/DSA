import { Student, calculateRealTimeMastery } from './db.js';
import { TOPICS } from './config.js';

export async function getProfile(email) {
  return await calculateRealTimeMastery(email);
}

// Append a newly graded concept check (Step 5)
export async function recordConceptCheckGrade(email, topic, score) {
  await Student.findOneAndUpdate(
    { email },
    { $push: { conceptChecks: { topic, score } } },
    { upsert: true }
  );
}

// Append an interactive quiz performance (Step 6)
export async function recordQuizGrade(email, topic, score) {
  await Student.findOneAndUpdate(
    { email },
    { $push: { quizGrades: { topic, score } } },
    { upsert: true }
  );
}

// Append a graded assignment outcome (Step 7)
export async function recordAssignmentGrade(email, topic, score, comments = '') {
  await Student.findOneAndUpdate(
    { email },
    { $push: { assignmentGrades: { topic, score, comments } } },
    { upsert: true }
  );
}

// Compiles live stats to suggest optimal focus areas
export async function getFocusRecommendation(email) {
  const profile = await calculateRealTimeMastery(email);
  const sortedTopics = Object.entries(profile).sort((a, b) => a[1] - b[1]);
  
  const weakest = sortedTopics[0];
  const strongest = sortedTopics[sortedTopics.length - 1];

  return {
    weakestTopic: weakest[0],
    weakestScore: weakest[1],
    strongestTopic: strongest[0],
    strongestScore: strongest[1],
    fullProfile: profile,
    suggestion: weakest[1] < 70
      ? `Focus on ${weakest[0]} next. It is currently your weakest area at ${weakest[1]}%.`
      : `Your scores are generally balanced. You can review ${weakest[0]} to continue maintaining progress.`
  };
}