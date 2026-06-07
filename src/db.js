import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TOPICS } from './config.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dsa_tutor';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('[Database] Connected to MongoDB.'))
  .catch(err => console.error('[Database] Connection error:', err));

// Grade Schema for Concept Checks (Step 5)
const ConceptCheckSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, // Grade out of 10
  gradedAt: { type: Date, default: Date.now }
});

// Grade Schema for Quizzes (Step 6)
const QuizGradeSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, // Percentage score (0 - 100)
  gradedAt: { type: Date, default: Date.now }
});

// Grade Schema for Assignments (Step 7)
const AssignmentGradeSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, // Grade out of 100
  comments: String,
  gradedAt: { type: Date, default: Date.now }
});

// Message Schema for Chat History
const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // "user" or "ai"
  text: { type: String, required: true }
});

// Saved Chat History Schema (Step 2 Update)
const SavedChatSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  title: { type: String, required: true },
  messages: [MessageSchema],
  savedAt: { type: Date, default: Date.now }
});

// Main Student Document Schema
const StudentSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  conceptChecks: [ConceptCheckSchema],
  quizGrades: [QuizGradeSchema],
  assignmentGrades: [AssignmentGradeSchema],
  savedChats: [SavedChatSchema], // Array for multiple saved chat conversation threads
  createdAt: { type: Date, default: Date.now }
});

export const Student = mongoose.model('Student', StudentSchema);

/**
 * Calculates dynamic topic mastery in real-time based on weighted grades.
 * Defaults to 0% if no grades are logged.
 * @param {string} email - Student email
 */
export async function calculateRealTimeMastery(email) {
  let student = await Student.findOne({ email });
  if (!student) {
    student = await Student.create({ email });
  }

  const profile = {};

  TOPICS.forEach(topic => {
    const concepts = student.conceptChecks.filter(c => c.topic === topic);
    const avgConcept = concepts.length > 0 
      ? (concepts.reduce((sum, c) => sum + c.score, 0) / concepts.length) * 10
      : null;

    const quizzes = student.quizGrades.filter(q => q.topic === topic);
    const avgQuiz = quizzes.length > 0
      ? quizzes.reduce((sum, q) => sum + q.score, 0) / quizzes.length
      : null;

    const assignments = student.assignmentGrades.filter(a => a.topic === topic);
    const avgAssignment = assignments.length > 0
      ? assignments.reduce((sum, a) => sum + a.score, 0) / assignments.length
      : null;

    const activeWeights = [];
    let totalScore = 0;

    if (avgConcept !== null) {
      activeWeights.push(0.3);
      totalScore += avgConcept * 0.3;
    }
    if (avgQuiz !== null) {
      activeWeights.push(0.3);
      totalScore += avgQuiz * 0.3;
    }
    if (avgAssignment !== null) {
      activeWeights.push(0.4);
      totalScore += avgAssignment * 0.4;
    }

    if (activeWeights.length > 0) {
      const sumWeights = activeWeights.reduce((a, b) => a + b, 0);
      profile[topic] = Math.round(totalScore / sumWeights);
    } else {
      profile[topic] = 0; // Baseline starting score
    }
  });

  return profile;
}