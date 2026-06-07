import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { BASE_DIR, DATA_DIR, SYSTEM_PROMPTS, GOOGLE_CLIENT_ID } from './config.js';
import { getFolderContent, getTopicSlides, getSlidePreviews } from './kbManager.js';
import { 
  getProfile, 
  recordConceptCheckGrade, 
  recordQuizGrade, 
  recordAssignmentGrade, 
  getFocusRecommendation 
} from './tracker.js';
import { teachTopic } from './teacher.js';
import { getConceptCheckQuestion, evaluateConceptResponse, generateQuiz } from './evaluator.js';
import { analyzeAssignments, predictExamTopics, simulateFinalExam } from './analyzer.js';
import { getYoutubeTranscriptText } from './ytManager.js';
import { generateContentWithFallback } from './apiClient.js';
import { Student } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(BASE_DIR, 'public')));
app.use('/slides', express.static(path.join(DATA_DIR, 'slides')));

app.get('/api/auth-config', (req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID });
});

const checkUolStudent = (req, res, next) => {
  const studentEmail = req.headers['x-student-email'];
  if (studentEmail && studentEmail.endsWith('@student.uol.edu.pk')) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized.' });
  }
};

app.use('/api', checkUolStudent);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/compile', async (req, res) => {
  const { code, input } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  const tempDir = path.join(BASE_DIR, 'data', 'temp');
  const tempFileId = `runner_${Date.now()}`;
  const sourcePath = path.join(tempDir, `${tempFileId}.cpp`);
  const execPath = path.join(tempDir, `${tempFileId}.out`);
  const inputPath = path.join(tempDir, `${tempFileId}.txt`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(sourcePath, code, 'utf-8');
    await fs.writeFile(inputPath, input || '', 'utf-8');

    const compileCmd = `g++ -std=c++23 -O2 "${sourcePath}" -o "${execPath}"`;

    exec(compileCmd, async (compileError, stdout, stderr) => {
      if (compileError) {
        await cleanTempFiles(sourcePath, execPath, inputPath);
        return res.json({ success: false, compile_error: stderr || compileError.message });
      }

      const runCmd = `"${execPath}" < "${inputPath}"`;
      
      exec(runCmd, { timeout: 5000, killSignal: 'SIGKILL' }, async (runError, runStdout, runStderr) => {
        await cleanTempFiles(sourcePath, execPath, inputPath);
        if (runError) {
          if (runError.killed) return res.json({ success: false, run_error: 'Execution Timeout: Program terminated after 5 seconds.' });
          return res.json({ success: false, run_error: runStderr || runError.message });
        }
        res.json({ success: true, output: runStdout });
      });
    });
  } catch (error) {
    await cleanTempFiles(sourcePath, execPath, inputPath);
    res.status(500).json({ error: `Internal Sandbox Error: ${error.message}` });
  }
});

async function cleanTempFiles(...paths) {
  for (const p of paths) {
    try { await fs.unlink(p); } catch (e) {}
  }
}

app.get('/api/profile', async (req, res) => {
  const email = req.headers['x-student-email'];
  try {
    const profile = await getProfile(email);
    const recommendation = await getFocusRecommendation(email);
    res.json({ profile, recommendation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve profile data' });
  }
});

app.get('/api/gradebook', async (req, res) => {
  const email = req.headers['x-student-email'];
  try {
    const student = await Student.findOne({ email });
    if (!student) return res.json({ conceptChecks: [], quizGrades: [], assignmentGrades: [], savedChats: [] });
    res.json({
      conceptChecks: student.conceptChecks,
      quizGrades: student.quizGrades,
      assignmentGrades: student.assignmentGrades,
      savedChats: student.savedChats.map(c => ({ id: c._id, topic: c.topic, title: c.title, savedAt: c.savedAt }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gradebook' });
  }
});

app.post('/api/save-chat', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { topic, title, messages } = req.body;
  if (!topic || !title || !messages) return res.status(400).json({ error: 'Missing parameters.' });
  try {
    await Student.findOneAndUpdate(
      { email },
      { $push: { savedChats: { topic, title, messages } } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/load-chat', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { chatId } = req.query;
  if (!chatId) return res.status(400).json({ error: 'ChatId required.' });

  try {
    const student = await Student.findOne({ email });
    const chat = student?.savedChats?.id(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    res.json({ messages: chat.messages, topic: chat.topic, title: chat.title });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat-message', async (req, res) => {
  const { topic, messages } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let conversationPrompt = `The following is an active conversation between a student and you, their expert computer science professor, regarding the topic: "${topic}".\n\n`;
    messages.forEach(m => { conversationPrompt += `${m.sender === 'user' ? 'Student' : 'Professor'}: ${m.text}\n`; });
    conversationPrompt += "Professor: ";

    await generateContentWithFallback(
      conversationPrompt, SYSTEM_PROMPTS.teacher, 0.7, false, 
      (textChunk) => { res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`); }
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.post('/api/get-topic-meta', async (req, res) => {
  const { topic } = req.body;
  try {
    let youtubeUrl = '';
    const linksPath = path.join(DATA_DIR, 'youtube_links.json');
    try {
      const fileData = await fs.readFile(linksPath, 'utf-8');
      const linksMap = JSON.parse(fileData);
      youtubeUrl = linksMap[topic] || '';
    } catch (err) {}
    res.json({ youtubeUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teach', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { topic } = req.body;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const student = await Student.findOne({ email });
    // FIX: Ensure the cached lesson actually has content (> 50 chars) to prevent loading empty DB saves
    const cachedLesson = student?.savedLessons?.find(l => l.topic === topic && l.content && l.content.length > 50);

    if (cachedLesson) {
      console.log(`[Server] Instantly replaying saved lesson history for "${topic}"...`);
      const chunks = cachedLesson.content.match(/.{1,120}/g) || [cachedLesson.content];
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        await sleep(15);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    let youtubeUrl = '';
    let youtubeTranscript = '';
    const linksPath = path.join(DATA_DIR, 'youtube_links.json');
    try {
      const fileData = await fs.readFile(linksPath, 'utf-8');
      const linksMap = JSON.parse(fileData);
      youtubeUrl = linksMap[topic] || '';
    } catch (err) {}

    let youtubeUrls = [];
    if (Array.isArray(youtubeUrl)) {
      youtubeUrls = youtubeUrl;
    } else if (youtubeUrl && youtubeUrl.trim() !== "") {
      youtubeUrls = [youtubeUrl];
    }

    for (let u = 0; u < youtubeUrls.length; u++) {
      const url = youtubeUrls[u];
      try {
        const transcript = await getYoutubeTranscriptText(url);
        youtubeTranscript += `\n--- Video Reference Part ${u + 1} (${url}) ---\n${transcript}\n`;
      } catch (ytError) {}
    }

    const slides = await getTopicSlides(topic);
    let fullGeneratedText = '';

    await teachTopic(topic, slides, youtubeTranscript, (textChunk) => {
      fullGeneratedText += textChunk;
      res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
    });

    // FIX: Only save to database if the AI successfully generated a full lesson
    if (fullGeneratedText.trim().length > 50) {
      await Student.findOneAndUpdate(
        { email },
        { $push: { savedLessons: { topic, content: fullGeneratedText } } },
        { upsert: true }
      );
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.post('/api/visuals', async (req, res) => {
  const { topic } = req.body;
  try {
    const visualPrompt = `Create a clean, highly structured ASCII diagram illustrating the logical layout or operation execution flow for: "${topic}".`;
    const diagram = await generateContentWithFallback(visualPrompt, SYSTEM_PROMPTS.visuals, 0.4, true);
    res.json({ diagram });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/slide-previews', async (req, res) => {
  const { topic } = req.query;
  try {
    const previews = await getSlidePreviews(topic);
    const priorityPreview = previews.slice(0, 1);
    const validatedPreviews = await Promise.all(priorityPreview.map(async p => {
      const filePath = path.join(DATA_DIR, 'slides', p.source);
      let exists = false;
      try { await fs.access(filePath); exists = true; } catch (e) { exists = false; }
      return { ...p, fileExists: exists };
    }));
    res.json({ previews: validatedPreviews });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/concept-check', async (req, res) => {
  const { topic } = req.body;
  try {
    const question = await getConceptCheckQuestion(topic);
    res.json({ question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/concept-evaluate', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { topic, question, answer } = req.body;
  try {
    const evaluation = await evaluateConceptResponse(topic, question, answer);
    if (evaluation.score !== null) {
      await recordConceptCheckGrade(email, topic, evaluation.score);
    }
    res.json({ feedback: evaluation.rawFeedback, score: evaluation.score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quiz', async (req, res) => {
  const { topic, format } = req.body;
  try {
    const quiz = await generateQuiz(topic, format);
    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/evaluate-quiz', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { topic, quizText, studentAnswers } = req.body;
  const prompt = `Topic: ${topic}\nQuiz Questions:\n${quizText}\nStudent's Submitted Answers:\n${studentAnswers}\nEvaluate this quiz. Your output must strictly follow this structure:\nScore: [X]/100\nFeedback: [Constructive comments identifying wrong items, code-tracing gaps, and guidance]`;
  try {
    const evaluation = await generateContentWithFallback(prompt, SYSTEM_PROMPTS.evaluator, 0.3);
    const scoreMatch = evaluation.match(/Score:\s*(\d+)\s*\/100/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
    await recordQuizGrade(email, topic, score);
    res.json({ feedback: evaluation, score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/evaluate-assignment', async (req, res) => {
  const email = req.headers['x-student-email'];
  const { topic, assignmentText, studentCode } = req.body;
  const prompt = `Topic: ${topic}\nAssignment Task Prompt:\n${assignmentText}\nStudent's Submitted C++23 Implementation:\n${studentCode}\nEvaluate this coding assignment. Grade compiling structure, logical complexity, and boundary cases.\nYour output must strictly follow this structure:\nScore: [X]/100\nFeedback: [Line-by-line code review, optimization advice, and structural correctness]`;
  try {
    const evaluation = await generateContentWithFallback(prompt, SYSTEM_PROMPTS.evaluator, 0.3);
    const scoreMatch = evaluation.match(/Score:\s*(\d+)\s*\/100/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
    await recordAssignmentGrade(email, topic, score, 'AI Graded Assignment Sheet');
    res.json({ feedback: evaluation, score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/predict-exam', async (req, res) => {
  try {
    const slides = await getFolderContent('slides');
    const assignments = await getFolderContent('assignments');
    const quizzes = await getFolderContent('quizzes');
    const predictions = await predictExamTopics(slides, assignments, quizzes);
    res.json({ predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/simulate-exam', async (req, res) => {
  try {
    const slides = await getFolderContent('slides');
    const assignments = await getFolderContent('assignments');
    const quizzes = await getFolderContent('quizzes');
    const exam = await simulateFinalExam(slides, assignments, quizzes);
    res.json({ exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(BASE_DIR, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` DSA AI Tutor running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});