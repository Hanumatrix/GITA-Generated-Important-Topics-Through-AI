# 🎓 GITA — AI-Generated Important Topics from Syllabus

> **Turn any syllabus into exam-ready study material using AI.**  
> Upload your syllabus → get **important topics, questions, answers, coding problems & visual learning graphs** in minutes.

🚀 Used by **500+ students** | ⚡ Built with **Next.js + Gemini AI** | 🎯 Exam-focused

---

## ✨ Why GITA?

Most tools generate random content.  
**GITA understands your syllabus.**

- 📌 Extracts **important topics**
- 📝 Generates **exam-oriented questions & answers**
- 💻 Creates **coding problems with solutions**
- 🧠 Shows **topic relationships & learning paths**
- 🎨 Adds **diagrams & visual explanations**

Built **Built by a student, for students**.

---

## 🔥 Key Features

### 📚 Intelligent Syllabus Analysis
- Upload **PDF / DOCX / TXT**
- AI extracts **20–25 high-value topics**
- Importance score (0–1) + exam marks estimation (0–50)
- 3–8 crisp key points per topic

### 📝 Exam-Ready Q&A
- 3–6 exam-style questions per topic
- 350–450 word **structured answers**
- Bullet points + headings
- **7-day smart caching** to reduce API usage

### 💻 Coding Problem Generator
- Languages: **C, C++, Python, Java, JavaScript**
- Full runnable code
- Algorithm explanation
- Time & space complexity
- Difficulty levels (Easy / Medium / Hard)

### 🎨 Visual Learning
- Automatic diagrams from Wikipedia / Google
- CSP-safe image proxying
- Interactive **knowledge graph**
- Topic dependency visualization

### 🔁 Smart AI Handling
- Automatic API key rotation
- Retry logic for rate limits
- Graceful failure handling

---

## 🛠 Tech Stack

### Frontend
- Next.js 16 · React 19 · TypeScript
- TailwindCSS 4 · Radix UI
- Recharts · next-themes

### Backend
- Convex (real-time NoSQL)
- Node.js

### AI
- Google Gemini 2.0 Flash
- Vercel AI SDK
- Zod schema validation

---

## 🚀 Quick Start

### 1️⃣ Clone & install
```bash
git clone https://github.com/Hanumatrix/GITA-Generated-Important-Topics-Through-AI
cd GITA-Generated-Important-Topics-Through-AI

```
## 2️⃣ Environment setup
Create .env.local
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
GOOGLE_SEARCH_API_KEY=your_key_here
GOOGLE_SEARCH_ENGINE_ID=your_key_here
```

## 3️⃣ Run locally
```bash
npm install
npm run dev
```
Open → http://localhost:3000

## 🧠 How It Works
```bash
Upload Syllabus
     ↓
Text Extraction (PDF/DOC/TXT)
     ↓
AI Topic Analysis
     ↓
Questions + Answers + Coding Problems
     ↓
Diagrams + Knowledge Graph
```

