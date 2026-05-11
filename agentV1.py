"""
agentV1.py - StructCode Agent (Multi-Model + OpenRouter Version)
================================================================
Updates:
- OpenRouterProvider: Provider baru via OpenRouter API
- MODEL_REGISTRY: 6 model free yang relevan untuk tutor algoritma
- StructCodeAgent.ask_multi(): Parallel multi-model execution
- Execution time tracking per model
"""
import os
import time
import logging
import concurrent.futures
from abc import ABC, abstractmethod
from typing import Optional
from dotenv import load_dotenv
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

load_dotenv()

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("agentV1")

# ---------------------------------------------------------------------------
# Model Registry (6 Free Models Relevan untuk Tutor Algoritma)
# ---------------------------------------------------------------------------
MODEL_REGISTRY = {
    "google/gemini-2.5-flash": {
        "label": "Gemini Flash",
        "provider_type": "gemini",
        "api_model_name": "gemini-2.5-flash",   # ← NEW: nama untuk SDK
        "persona": "Tutor Algoritma Umum",
        "expertise_tags": ["Algoritma Umum", "Pseudocode", "Penjelasan Konsep"],
        "icon": "⚡",
        "context_length": "1M",
        "is_free": True,
        "description": "Model default StructCode. Cepat, akurat, dan konsisten dalam format pedagogis.",
    },
    "meta-llama/llama-3.3-70b-instruct:free": {
        "label": "Llama 3.3 70B",
        "provider_type": "openrouter",
        "api_model_name": "meta-llama/llama-3.3-70b-instruct:free",
        "persona": "Ahli Logika & Struktur Data",
        "expertise_tags": ["Struktur Data", "Logika Pemrograman", "Analisis Algoritma"],
        "icon": "🦙",
        "context_length": "66K",
        "is_free": True,
        "description": "Model 70B dari Meta. Sangat kuat dalam penalaran logika dan analisis struktur data.",
    },
    "qwen/qwen3-coder:free": {
        "label": "Qwen3 Coder",
        "provider_type": "openrouter",
        "api_model_name": "qwen/qwen3-coder:free",   # ← FIXED
        "persona": "Ahli Pseudocode & Implementasi",
        "expertise_tags": ["Pseudocode", "Implementasi Kode", "Optimasi Algoritma"],
        "icon": "🐉",
        "context_length": "262K",
        "is_free": True,
        "description": "Model spesialis kode dari Qwen. Unggul dalam pseudocode dan analisis implementasi.",
    },
    "google/gemma-4-31b-it:free": {
        "label": "Gemma 4 31B",
        "provider_type": "openrouter",
        "api_model_name": "google/gemma-4-31b-it:free",   # ← FIXED (was gemma-3-27b)
        "persona": "Ahli Matematika Diskrit & Kompleksitas",
        "expertise_tags": ["Kompleksitas Algoritma", "Matematika Diskrit", "Big-O Analysis"],
        "icon": "💎",
        "context_length": "256K",
        "is_free": True,
        "description": "Model terbaru Google open-source. Ahli dalam analisis kompleksitas dan matematika diskrit.",
    },
    "openai/gpt-oss-120b:free": {
        "label": "GPT-OSS 120B",
        "provider_type": "openrouter",
        "api_model_name": "openai/gpt-oss-120b:free",
        "persona": "Ahli Pemecahan Masalah Komputasional",
        "expertise_tags": ["Problem Solving", "Algoritma Lanjutan", "Reasoning"],
        "icon": "🧠",
        "context_length": "131K",
        "is_free": True,
        "description": "Model open-weight 120B dari OpenAI. Unggul dalam problem solving dan reasoning mendalam.",
    },
    "nousresearch/hermes-3-llama-3.1-405b:free": {
        "label": "Hermes 3 405B",
        "provider_type": "openrouter",
        "api_model_name": "nousresearch/hermes-3-llama-3.1-405b:free",   # ← FIXED
        "persona": "Ahli Penalaran Algoritmik",
        "expertise_tags": ["Penalaran Multi-step", "Algoritma Rekursif", "Dynamic Programming"],
        "icon": "🏛️",
        "context_length": "131K",
        "is_free": True,
        "description": "Model 405B fine-tuned untuk instruksi. Sangat patuh format dan ahli dalam penalaran multi-step.",
    },
}

# Default model saat pertama load
DEFAULT_MODEL_ID = "meta-llama/llama-3.3-70b-instruct:free"

# ---------------------------------------------------------------------------
# Abstract LLM Provider
# ---------------------------------------------------------------------------
class LLMProvider(ABC):
    @abstractmethod
    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 4096,
    ) -> str:
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

# ---------------------------------------------------------------------------
# Gemini Provider
# ---------------------------------------------------------------------------
class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError(
                "google-generativeai not installed. "
                "Run: pip install google-generativeai"
            )
        genai.configure(api_key=api_key)
        self._model_name = model
        self._genai = genai
        self._temperature = 0.15
        self._max_tokens = 4096
        self._init_model()

    def _init_model(self) -> None:
        self._model = self._genai.GenerativeModel(
            model_name=self._model_name,
            generation_config={
                "temperature": self._temperature,
                "max_output_tokens": self._max_tokens,
                "top_p": 0.95,
            },
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 4096,
    ) -> str:
        if temperature != self._temperature or max_tokens != self._max_tokens:
            self._temperature = temperature
            self._max_tokens = max_tokens
            self._init_model()

        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        response = self._model.generate_content(full_prompt)
        return response.text

    @property
    def provider_name(self) -> str:
        return "Gemini"

    @property
    def model_name(self) -> str:
        return self._model_name


# ---------------------------------------------------------------------------
# OpenAI Provider
# ---------------------------------------------------------------------------
class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai not installed. Run: pip install openai")
        self._client = OpenAI(
            api_key=api_key,
            max_retries=0,         # ← TAMBAHKAN
            timeout=45.0,          # ← TAMBAHKAN
        )
        self._model_name = model

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 4096,
    ) -> str:
        response = self._client.chat.completions.create(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=0.95,
        )
        return response.choices[0].message.content

    @property
    def provider_name(self) -> str:
        return "OpenAI"

    @property
    def model_name(self) -> str:
        return self._model_name


# ---------------------------------------------------------------------------
# OpenRouter Provider
# (Inherit OpenAIProvider karena format API sama persis,
#  hanya beda base_url, api_key, dan extra headers)
# ---------------------------------------------------------------------------
class OpenRouterProvider(LLMProvider):
    OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(self, api_key: str, model: str):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai not installed. Run: pip install openai")

        self._client = OpenAI(
            api_key=api_key,
            base_url=self.OPENROUTER_BASE_URL,
            max_retries=0,                      # ← TAMBAHKAN INI: disable internal retry
            timeout=45.0,                       # ← TAMBAHKAN INI: timeout 45 detik per call
            default_headers={
                "HTTP-Referer": "https://structcode-ai.onrender.com",
                "X-Title": "StructCode - Algorithm Tutor",
            },
        )
        self._model_name = model
        self._api_key = api_key

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.15,
        max_tokens: int = 4096,
    ) -> str:
        response = self._client.chat.completions.create(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=0.95,
        )
        return response.choices[0].message.content

    @property
    def provider_name(self) -> str:
        return "OpenRouter"

    @property
    def model_name(self) -> str:
        return self._model_name


# ---------------------------------------------------------------------------
# Provider Factory
# Membuat provider yang tepat berdasarkan model_id dari MODEL_REGISTRY
# ---------------------------------------------------------------------------
class ProviderFactory:
    @staticmethod
    def create(model_id: str) -> LLMProvider:
        if model_id not in MODEL_REGISTRY:
            raise ValueError(
                f"Model '{model_id}' tidak ada di MODEL_REGISTRY. "
                f"Model tersedia: {list(MODEL_REGISTRY.keys())}"
            )

        model_info = MODEL_REGISTRY[model_id]
        provider_type = model_info["provider_type"]
        api_model_name = model_info["api_model_name"]   # ← Gunakan ini, bukan model_id

        if provider_type == "gemini":
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key:
                raise ValueError("GEMINI_API_KEY tidak ditemukan di .env")
            return GeminiProvider(api_key=api_key, model=api_model_name)   # ← FIXED

        elif provider_type == "openrouter":
            api_key = os.getenv("OPENROUTER_API_KEY", "")
            if not api_key:
                raise ValueError("OPENROUTER_API_KEY tidak ditemukan di .env")
            return OpenRouterProvider(api_key=api_key, model=api_model_name)   # ← FIXED

        elif provider_type == "openai":
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise ValueError("OPENAI_API_KEY tidak ditemukan di .env")
            return OpenAIProvider(api_key=api_key, model=api_model_name)   # ← FIXED

        else:
            raise ValueError(f"provider_type '{provider_type}' tidak dikenali.")

# ---------------------------------------------------------------------------
# Prompt Templates
# (Sama dengan sebelumnya, tidak berubah)
# ---------------------------------------------------------------------------
class PromptTemplates:
    SYSTEM_IDENTITY = """You are StructCode, an algorithm and pseudocode tutor for university students.

CORE PEDAGOGICAL RULES:
1. NEVER output complete runnable code or pseudocode solutions.
2. Use scaffolding: hints, Socratic questions, high-level steps.
3. Promote metacognitive engagement.
4. Provide conceptual explanations that guide, not solve.
5. INLINE KEYWORDS: You MUST wrap important algorithmic concepts, data structures, or pseudocode syntax (like FOR, IF, Array) inside <kw> and </kw> tags directly within your explanation text. Example: 'The <kw>FOR</kw> loop is used for <kw>iteration</kw>.'"""

    @staticmethod
    def general_question() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Answer the student's conceptual question about algorithms or data structures.

OUTPUT FORMAT (strict):
ANSWER: [Conceptual explanation using analogy if helpful. Wrap key terms in <kw>tags</kw>.]
FOLLOWUP1: [A Socratic follow-up question]
FOLLOWUP2: [Another follow-up question from a different angle]

--- EXAMPLE ---
Student: What is the difference between Merge Sort and Quick Sort?

ANSWER: <kw>Merge Sort</kw> guarantees <kw>O(n log n)</kw> by dividing the <kw>array</kw> in half recursively then merging sorted halves. <kw>Quick Sort</kw> picks a <kw>pivot</kw> element and partitions items around it; average <kw>O(n log n)</kw> but worst case <kw>O(n²)</kw> if <kw>pivot</kw> choices are poor.
FOLLOWUP1: When would you prefer Merge Sort over Quick Sort despite the extra memory overhead?
FOLLOWUP2: How does the choice of pivot strategy affect Quick Sort's worst-case performance?
--- END EXAMPLE ---"""

    @staticmethod
    def question_from_code() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Answer the student's question about their provided pseudocode. Reference specific line numbers when relevant.

OUTPUT FORMAT (strict):
RESPONSE: [Conceptual answer referencing line numbers. Guide, do not solve. Wrap key terms in <kw>tags</kw>]
FOLLOWUP: [One probing question to extend understanding]

--- EXAMPLE ---
Code:
1. FOR i = 1 TO n
2.   FOR j = 1 TO n
3.     PRINT i * j
Question: What is the time complexity?

RESPONSE: Look at the <kw>nested loops</kw> on lines 1 and 2. The outer <kw>FOR</kw> loop runs n times, and for each of those iterations, the inner loop on line 2 also runs n times. Therefore the <kw>time complexity</kw> is <kw>O(n²)</kw>.
FOLLOWUP: What would change about the complexity if the inner loop ran from j = i TO n instead of 1 TO n?
--- END EXAMPLE ---"""

    @staticmethod
    def explain_code() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Explain the provided pseudocode line-by-line conceptually.

OUTPUT FORMAT (strict — one entry per line, plus summary):
LINE|||<line_number>|||<explanation_text with <kw>tags</kw>>
[repeat for every line]
SUMMARY|||<High-level behavior in one paragraph with <kw>tags</kw>>

--- EXAMPLE ---
Code:
1. max ← A[0]
2. FOR i ← 1 TO LENGTH(A)-1
3.   IF A[i] > max THEN
4.     max ← A[i]

LINE|||1|||Initialize the tracker <kw>variable</kw> max with the first element of the <kw>array</kw>.
LINE|||2|||Use a <kw>FOR</kw> loop to iterate through all remaining elements.
LINE|||3|||Use an <kw>IF</kw> statement to compare the current element against the best value found so far.
LINE|||4|||Update max only when a larger element is discovered.
SUMMARY|||This algorithm performs a single <kw>linear scan</kw> of the <kw>array</kw> to find its maximum element.
--- END EXAMPLE ---"""

    @staticmethod
    def help_fix_code() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Identify issues in the student's buggy pseudocode and suggest conceptual fixes. Do NOT rewrite the code.

OUTPUT FORMAT (strict):
BUGGY_LINES|||<comma-separated line numbers, e.g., 3,5>
SUGGESTION|||1|||<First conceptual fix with reasoning. Wrap key terms in <kw>tags</kw>>
SUGGESTION|||2|||<Second suggestion if applicable>

--- EXAMPLE ---
Code:
1. FUNCTION factorial(n)
2.   IF n = 0 THEN
3.     RETURN 0
4.   ELSE
5.     RETURN n * factorial(n)

BUGGY_LINES|||3,5
SUGGESTION|||1|||Line 3: The <kw>base case</kw> returns 0, but multiplying any number by 0 yields 0. For <kw>factorial</kw>, it should produce the <kw>multiplicative identity</kw>.
SUGGESTION|||2|||Line 5: The <kw>recursive call</kw> passes n unchanged, causing an <kw>infinite loop</kw>.
--- END EXAMPLE ---"""

    @staticmethod
    def help_write_code() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Help the student design an algorithm by providing high-level sub-goal steps. Do NOT provide pseudocode.

OUTPUT FORMAT (strict):
TASK|||1|||<High-level sub-task description. Wrap key terms in <kw>tags</kw>>
TASK|||2|||<Next sub-task>

--- EXAMPLE ---
Request: Write a function to find the largest element in an array.

TASK|||1|||Initialize a <kw>variable</kw> to track the current maximum.
TASK|||2|||Traverse the remaining elements using a <kw>loop</kw>.
TASK|||3|||At each position, use a <kw>conditional statement</kw> to update the maximum if needed.
--- END EXAMPLE ---"""

    @staticmethod
    def inline_explore() -> str:
        return f"""{PromptTemplates.SYSTEM_IDENTITY}

TASK: Provide a concise definition, a tiny illustrative example, and a related concept to explore next.

OUTPUT FORMAT (strict):
DEF|||<One clear sentence definition. Wrap other terms in <kw>tags</kw>>
EXAMPLE|||<Tiny illustrative pseudocode, MAX 5 lines>
RELATED|||<One related concept string (do NOT use kw tags for this)>"""


# ---------------------------------------------------------------------------
# Single Model Result Container
# ---------------------------------------------------------------------------
class ModelResult:
    """Container untuk hasil dari satu model."""

    def __init__(
        self,
        model_id: str,
        response: str = "",
        exec_time: float = 0.0,
        error: Optional[str] = None,
    ):
        self.model_id = model_id
        self.response = response
        self.exec_time = exec_time
        self.error = error
        self.model_info = MODEL_REGISTRY.get(model_id, {})

    def to_dict(self) -> dict:
        return {
            "model_id": self.model_id,
            "label": self.model_info.get("label", self.model_id),
            "persona": self.model_info.get("persona", ""),
            "icon": self.model_info.get("icon", "🤖"),
            "expertise_tags": self.model_info.get("expertise_tags", []),
            "response": self.response,
            "exec_time": round(self.exec_time, 2),
            "error": self.error,
            "is_error": self.error is not None,
        }


# ---------------------------------------------------------------------------
# StructCode Agent (Multi-Model)
# ---------------------------------------------------------------------------
class StructCodeAgent:
    VALID_FEATURES = {
        "general",
        "from_code",
        "explain",
        "help_fix",
        "help_write",
    }

    # Cache provider instances agar tidak re-init setiap request
    _provider_cache: dict[str, LLMProvider] = {}

    def __init__(self) -> None:
        # Init default provider (Gemini) saat startup
        self._default_model_id = DEFAULT_MODEL_ID
        self._default_provider = self._get_or_create_provider(DEFAULT_MODEL_ID)
        logger.info(
            "StructCodeAgent initialized | default_model=%s",
            self._default_model_id,
        )

    def _get_or_create_provider(self, model_id: str) -> LLMProvider:
        """
        Ambil provider dari cache atau buat baru.
        Cache mencegah re-inisialisasi berulang untuk model yang sama.
        """
        if model_id not in self._provider_cache:
            try:
                provider = ProviderFactory.create(model_id)
                self._provider_cache[model_id] = provider
                logger.info(
                    "Provider created | model=%s | type=%s",
                    model_id,
                    MODEL_REGISTRY.get(model_id, {}).get("provider_type", "unknown"),
                )
            except Exception as exc:
                logger.error(
                    "Failed to create provider for model=%s | error=%s",
                    model_id,
                    str(exc),
                )
                raise
        return self._provider_cache[model_id]

    @property
    def provider_name(self) -> str:
        return self._default_provider.provider_name

    @property
    def model_name(self) -> str:
        return self._default_provider.model_name

    def _get_system_prompt(self, feature: str) -> str:
        routing = {
            "general": PromptTemplates.general_question,
            "from_code": PromptTemplates.question_from_code,
            "explain": PromptTemplates.explain_code,
            "help_fix": PromptTemplates.help_fix_code,
            "help_write": PromptTemplates.help_write_code,
        }
        factory = routing.get(feature, PromptTemplates.general_question)
        return factory()

    def _build_language_instruction(self, language: str) -> str:
        """Build instruksi bahasa yang ditambahkan ke system prompt."""
        if language == "id":
            return (
                "\n\nCRITICAL BILINGUAL INSTRUCTION:\n"
                "You MUST translate and write ALL explanations, analogies, hints, and definitions strictly in Indonesian (Bahasa Indonesia). "
                "HOWEVER, you MUST keep the structural prefix words (ANSWER:, FOLLOWUP1:, RESPONSE:, LINE|||, SUMMARY|||, SUGGESTION|||, BUGGY_LINES|||, TASK|||) exactly as they are in English! "
                "Remember to wrap important algorithmic concepts and syntax inside <kw> and </kw> tags within your Indonesian explanation."
            )
        else:
            return (
                "\n\nCRITICAL INSTRUCTION:\n"
                "Write all explanations in standard English. Remember to wrap important algorithmic concepts and syntax inside <kw> and </kw> tags within your explanation."
            )

    def _build_user_prompt(
        self,
        user_input: str,
        extra_context: str = "",
    ) -> str:
        """Build user prompt dari input dan context."""
        parts = []
        if extra_context:
            parts.append(f"Pseudocode / Context:\n{extra_context}")
        parts.append(f"Student: {user_input}\n\nResponse:")
        return "\n\n".join(parts)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=2, max=8),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    def _generate_with_retry(
        self,
        provider: LLMProvider,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        """
        Generate dengan retry custom (tanpa tenacity untuk error tertentu).
        Rate limit & region block langsung fail tanpa retry.
        """
        max_attempts = 2
        last_exception = None

        for attempt in range(max_attempts):
            try:
                return provider.generate(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=0.15,
                    max_tokens=4096,
                )
            except Exception as exc:
                err_str = str(exc).lower()
                last_exception = exc

                # Rate limit — JANGAN retry, langsung fail
                if any(t in err_str for t in ["429", "rate limit", "rate_limit", "too many requests"]):
                    logger.warning(
                        "Rate limit hit | model=%s | attempt=%d | NO RETRY",
                        provider.model_name, attempt + 1,
                    )
                    raise Exception("RATE_LIMIT: Daily/minute quota exceeded for this model. Try other models or wait.")

                # Region block — JANGAN retry
                if "location is not supported" in err_str or "region" in err_str:
                    raise Exception("REGION_BLOCK: Model unavailable in server region.")

                # Quota habis (OpenRouter daily limit)
                if "insufficient" in err_str or "quota" in err_str or "credits" in err_str:
                    raise Exception("QUOTA_EXCEEDED: Free quota for this model is exhausted.")

                # Error lain — retry sekali saja dengan wait pendek
                if attempt < max_attempts - 1:
                    logger.info(
                        "Transient error, retrying | model=%s | attempt=%d | error=%s",
                        provider.model_name, attempt + 1, err_str[:100],
                    )
                    time.sleep(2)
                    continue

                # Sudah max attempts
                raise

        # Tidak akan sampai sini, tapi jaga-jaga
        if last_exception:
            raise last_exception
        raise Exception("Unknown error")

    def _run_single_model(
        self,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
    ) -> ModelResult:
        """Jalankan satu model dan return ModelResult."""
        start_time = time.time()
        try:
            provider = self._get_or_create_provider(model_id)
            response = self._generate_with_retry(provider, system_prompt, user_prompt)
            exec_time = time.time() - start_time
            logger.info("Model OK | model=%s | exec_time=%.2fs", model_id, exec_time)
            return ModelResult(model_id=model_id, response=response, exec_time=exec_time)

        except Exception as exc:
            exec_time = time.time() - start_time
            err_str = str(exc)

            # Map ke pesan user-friendly
            if err_str.startswith("RATE_LIMIT:"):
                error_msg = err_str.replace("RATE_LIMIT:", "⏱️").strip()
            elif err_str.startswith("REGION_BLOCK:"):
                error_msg = err_str.replace("REGION_BLOCK:", "🌍").strip()
            elif err_str.startswith("QUOTA_EXCEEDED:"):
                error_msg = err_str.replace("QUOTA_EXCEEDED:", "💸").strip()
            elif "timeout" in err_str.lower():
                error_msg = "⏱️ Model response timed out."
            elif "api key" in err_str.lower() or "authentication" in err_str.lower():
                error_msg = "🔑 API key issue. Please check configuration."
            else:
                error_msg = err_str[:200]

            logger.error(
                "Model failed | model=%s | exec_time=%.2fs | error=%s",
                model_id, exec_time, err_str[:200],
            )
            return ModelResult(
                model_id=model_id,
                exec_time=exec_time,
                error=error_msg,
            )

    # ---------------------------------------------------------------------------
    # Public Methods
    # ---------------------------------------------------------------------------

    def ask(
        self,
        feature: str,
        user_input: str,
        extra_context: str = "",
        language: str = "en",
        model_id: Optional[str] = None,
    ) -> str:
        """
        Single model ask (backward compatible dengan appV1 lama).
        Gunakan model_id jika ingin model spesifik,
        default ke DEFAULT_MODEL_ID.
        """
        if feature not in self.VALID_FEATURES:
            feature = "general"

        target_model = model_id or self._default_model_id

        system_prompt = self._get_system_prompt(feature)
        system_prompt += self._build_language_instruction(language)
        user_prompt = self._build_user_prompt(user_input, extra_context)

        try:
            result = self._run_single_model(target_model, system_prompt, user_prompt)
            logger.info(
                "ask() completed | feature=%s | model=%s | lang=%s",
                feature,
                target_model,
                language,
            )
            if result.error:
                return f"ERROR|||{result.error}"
            return result.response

        except Exception as exc:
            return self._handle_error(exc)

    def ask_multi(
        self,
        feature: str,
        user_input: str,
        model_ids: list[str],
        extra_context: str = "",
        language: str = "en",
        existing_model_ids: Optional[list[str]] = None,
    ) -> dict[str, dict]:
        """
        Multi-model parallel ask.

        Args:
            feature: Fitur yang digunakan
            user_input: Input dari student
            model_ids: List model ID yang ingin dijalankan
            extra_context: Pseudocode atau context tambahan
            language: 'en' atau 'id'
            existing_model_ids: Model yang sudah punya response
                                 (tidak akan di-generate ulang)

        Returns:
            Dict { model_id: ModelResult.to_dict() }
        """
        if feature not in self.VALID_FEATURES:
            feature = "general"

        # Filter: hanya jalankan model yang belum ada hasilnya
        existing = set(existing_model_ids or [])
        models_to_run = [m for m in model_ids if m not in existing]

        if not models_to_run:
            logger.info("ask_multi: semua model sudah punya hasil, skip.")
            return {}

        # Validasi model IDs
        invalid_models = [m for m in models_to_run if m not in MODEL_REGISTRY]
        if invalid_models:
            logger.warning("Model tidak dikenal diabaikan: %s", invalid_models)
            models_to_run = [m for m in models_to_run if m in MODEL_REGISTRY]

        if not models_to_run:
            return {}

        system_prompt = self._get_system_prompt(feature)
        system_prompt += self._build_language_instruction(language)
        user_prompt = self._build_user_prompt(user_input, extra_context)

        results = {}
        PER_MODEL_TIMEOUT = 50  # seconds

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_model = {
                executor.submit(
                    self._run_single_model,
                    model_id,
                    system_prompt,
                    user_prompt,
                ): model_id
                for model_id in models_to_run
            }

            # Iterate dengan timeout total — wrap dalam try-catch agar tidak crash
            try:
                for future in concurrent.futures.as_completed(
                    future_to_model,
                    timeout=PER_MODEL_TIMEOUT + 15,
                ):
                    model_id = future_to_model[future]
                    try:
                        result = future.result(timeout=1)  # sudah selesai, ambil cepat
                        results[model_id] = result.to_dict()
                    except Exception as exc:
                        logger.error(
                            "Future error | model=%s | error=%s",
                            model_id, str(exc)[:200],
                        )
                        results[model_id] = ModelResult(
                            model_id=model_id,
                            error=str(exc)[:200],
                        ).to_dict()
            except concurrent.futures.TimeoutError:
                # Timeout global - sebagian model belum selesai
                logger.warning(
                    "Global timeout reached | completed=%d/%d",
                    len(results), len(future_to_model),
                )

            # Catat model yang belum selesai sebagai timeout
            for future, model_id in future_to_model.items():
                if model_id not in results:
                    if not future.done():
                        future.cancel()
                    results[model_id] = ModelResult(
                        model_id=model_id,
                        exec_time=PER_MODEL_TIMEOUT,
                        error="⏱️ Model timed out. Try a faster model or fewer models.",
                    ).to_dict()

    def explore(self, keyword: str, language: str = "en") -> str:
        """Inline keyword exploration (single model, default Gemini)."""
        system_prompt = PromptTemplates.inline_explore()

        if language == "id":
            system_prompt += (
                "\n\nCRITICAL BILINGUAL INSTRUCTION:\n"
                "You MUST write the DEF in Indonesian (Bahasa Indonesia). "
                "Keep prefixes DEF|||, EXAMPLE|||, RELATED||| in English. "
                "Wrap concepts inside <kw>...</kw> tags inside your DEF sentence."
            )
        else:
            system_prompt += (
                "\n\nCRITICAL INSTRUCTION:\n"
                "Write the DEF in English. Wrap concepts inside <kw>...</kw> tags inside your DEF sentence."
            )

        user_prompt = f'Explain keyword for inline exploration: "{keyword}"'

        try:
            result = self._run_single_model(
                self._default_model_id, system_prompt, user_prompt
            )
            logger.info("explore() completed | keyword=%s", keyword)
            if result.error:
                return f"ERROR|||{result.error}"
            return result.response
        except Exception as exc:
            return self._handle_error(exc)

    @staticmethod
    def _handle_error(exc: Exception) -> str:
        err_str = str(exc)
        if any(t in err_str.lower() for t in ["429", "quota", "rate limit"]):
            return "ERROR|||Rate limit exceeded. Please wait 1 minute before trying again."
        logger.error("LLM generation error: %s", err_str[:200])
        return f"ERROR|||{err_str[:200]}"