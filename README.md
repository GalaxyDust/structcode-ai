# StructCode 🎓

**Pedagogical AI Tutor for Algorithms & Pseudocode** — Multi-Model AI assistant that guides students' thinking instead of giving direct solutions.

🌐 **Live Demo:** [structcode-ai.onrender.com](https://structcode-ai.onrender.com)

---

## ✨ Features

- 🤖 **Multi-Model Comparison** — Compare responses from up to 3 AI models side-by-side
- 📚 **5 Pedagogical Modes** — General Q&A, Code Explanation, Bug Fix, Algorithm Design, Question from Code
- 🌍 **Bilingual** — English & Indonesian support
- 💬 **Inline Keyword Exploration** — Click any concept for instant definition
- 📊 **Class Analytics** — Teachers can monitor student usage patterns
- 💾 **Session Persistence** — History survives page refresh
- 📱 **Fully Responsive** — Works on mobile, tablet, and desktop

---

## 🤖 Supported AI Models

| Model | Provider | Persona |
|---|---|---|
| Gemini 2.5 Flash | Google | Tutor Algoritma Umum |
| Llama 3.3 70B | OpenRouter (Meta) | Ahli Logika & Struktur Data |
| Qwen3 Coder | OpenRouter (Qwen) | Ahli Pseudocode & Implementasi |
| Gemma 4 31B | OpenRouter (Google) | Ahli Matematika Diskrit |
| GPT-OSS 120B | OpenRouter (OpenAI) | Ahli Pemecahan Masalah |
| Hermes 3 405B | OpenRouter (Nous) | Ahli Penalaran Algoritmik |

---

## 🚀 Local Setup

### Prerequisites
- Python 3.10+
- MongoDB (local or [Atlas](https://www.mongodb.com/cloud/atlas))
- API keys: Gemini & OpenRouter (free tier sufficient)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/GalaxyDust/structcode-ai.git
cd structcode-ai

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate   # Linux/Mac
# venv\Scripts\activate    # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Setup environment
cp .env.example .env
# Edit .env and fill in your API keys

# 5. Run application
python appV1.py

👤 Test Accounts
For demo purposes, the following accounts are available:

Teacher (with Analytics access):

NIM: 12345678 | Class: if4501 or if4502
NIM: 87654321 | Class: if4501
Student: Any other NIM + valid class (if4501 or if4502)

📜 License
This project is for educational research purposes.