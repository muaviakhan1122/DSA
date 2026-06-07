import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TOPICS } from './config.js';

dotenv.config();

// Aggressively check all standard Railway Mongo variables before falling back to localhost
const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dsa_tutor';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('[Database] Connected to MongoDB Cloud successfully.'))
  .catch(err => console.error('[Database] Connection error:', err));

const ConceptCheckSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, 
  gradedAt: { type: Date, default: Date.now }
});

const QuizGradeSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, 
  gradedAt: { type: Date, default: Date.now }
});

const AssignmentGradeSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  score: { type: Number, required: true }, 
  comments: String,
  gradedAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  text: { type: String, required: true }
});

const SavedChatSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  title: { type: String, required: true },
  messages: [MessageSchema],
  savedAt: { type: Date, default: Date.now }
});

const SavedLessonSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  content: { type: String, required: true }, 
  savedAt: { type: Date, default: Date.now }
});

const StudentSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  conceptChecks: [ConceptCheckSchema],
  quizGrades: [QuizGradeSchema],
  assignmentGrades: [AssignmentGradeSchema],
  savedChats: [SavedChatSchema], 
  savedLessons: [SavedLessonSchema],
  createdAt: { type: Date, default: Date.now }
});

export const Student = mongoose.model('Student', StudentSchema);

export async function calculateRealTimeMastery(email) {
  let student = await Student.findOne({ email });
  if (!student) {
    student = await Student.create({ email });
  }

  const profile = {};

  TOPICS.forEach(topic => {
    const concepts = student.conceptChecks.filter(c => c.topic === topic);
    const avgConcept = concepts.length > 0 ? (concepts.reduce((sum, c) => sum + c.score, 0) / concepts.length) * 10 : null;

    const quizzes = student.quizGrades.filter(q => q.topic === topic);
    const avgQuiz = quizzes.length > 0 ? quizzes.reduce((sum, q) => sum + q.score, 0) / quizzes.length : null;

    const assignments = student.assignmentGrades.filter(a => a.topic === topic);
    const avgAssignment = assignments.length > 0 ? assignments.reduce((sum, a) => sum + a.score, 0) / assignments.length : null;

    const activeWeights = [];
    let totalScore = 0;

    if (avgConcept !== null) { activeWeights.push(0.3); totalScore += avgConcept * 0.3; }
    if (avgQuiz !== null) { activeWeights.push(0.3); totalScore += avgQuiz * 0.3; }
    if (avgAssignment !== null) { activeWeights.push(0.4); totalScore += avgAssignment * 0.4; }

    if (activeWeights.length > 0) {
      const sumWeights = activeWeights.reduce((a, b) => a + b, 0);
      profile[topic] = Math.round(totalScore / sumWeights);
    } else {
      profile[topic] = 0; 
    }
  });

  return profile;
}