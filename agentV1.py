"""
agentV1.py - StructCode Agent (Bilingual + Inline Keywords Version)
=====================================================================
LLM-powered pedagogical coding assistant with guardrails.

Updates:
- Inline Keyword Wrapping: Memaksa AI membungkus kata kunci dengan <kw>...</kw>
- Strict Bilingual Support: Memaksa penjelasan bahasa Indonesia tanpa merusak format struktur output.
"""
import os
import time
import logging
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
        model_id: Optional[str] = None  # TAMBAHAN
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
            raise ImportError("google-generativeai not installed.")
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
        self, system_prompt: str, user_prompt: str, 
        temperature: float = 0.15, max_tokens: int = 4096,
        model_id: Optional[str] = None
    ) -> str:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        response = self._model.generate_content(full_prompt)
        return response.text

    @property
    def provider_name(self) -> str: return "Gemini"
    @property
    def model_name(self) -> str: return self._model_name

# ---------------------------------------------------------------------------
# OpenAI Provider
# ---------------------------------------------------------------------------
class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai not installed.")
        self._client = OpenAI(api_key=api_key)
        self._model_name = model

    def generate(
        self, system_prompt: str, user_prompt: str, 
        temperature: float = 0.15, max_tokens: int = 4096,
        model_id: Optional[str] = None
    ) -> str:
        target_model = model_id if model_id else self._model_name
        response = self._client.chat.completions.create(
            model=target_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature, max_tokens=max_tokens, top_p=0.95,
        )
        return response.choices[0].message.content

    @property
    def provider_name(self) -> str: return "OpenAI"
    @property
    def model_name(self) -> str: return self._model_name

# ---------------------------------------------------------------------------
# OpenRouter Provider (BARU)
# ---------------------------------------------------------------------------
class OpenRouterProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai not installed.")
        # Menggunakan format OpenAI tapi diarahkan ke API OpenRouter
        self._client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
        self._model_name = model

    def generate(
        self, system_prompt: str, user_prompt: str, 
        temperature: float = 0.15, max_tokens: int = 4096,
        model_id: Optional[str] = None
    ) -> str:
        target_model = model_id if model_id else self._model_name
        response = self._client.chat.completions.create(
            model=target_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature, max_tokens=max_tokens, top_p=0.95,
        )
        return response.choices[0].message.content

    @property
    def provider_name(self) -> str: return "OpenRouter"
    @property
    def model_name(self) -> str: return self._model_name

# ---------------------------------------------------------------------------
# Prompt Templates (Updated for <kw> tags and strict formatting)
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
# StructCode Agent
# ---------------------------------------------------------------------------

class StructCodeAgent:
    VALID_FEATURES = {
        "general", "from_code", "explain", "help_fix", "help_write",
    }

    def __init__(self) -> None:
        # Inisialisasi default saat aplikasi baru nyala
        self._provider = self._get_dynamic_provider("openrouter", "meta-llama/llama-3.3-70b-instruct:free")
        logger.info("StructCodeAgent initialized")

    def _get_dynamic_provider(self, provider_name: str, model_name: str) -> LLMProvider:
        """Membuat instance API secara dinamis berdasarkan pilihan user"""
        provider_name = provider_name.lower().strip()
        
        if provider_name == "openrouter":
            api_key = os.getenv("OPENROUTER_API_KEY", "")
            if not api_key: raise ValueError("OPENROUTER_API_KEY missing in .env")
            return OpenRouterProvider(api_key=api_key, model=model_name)
            
        elif provider_name == "openai":
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key: raise ValueError("OPENAI_API_KEY missing in .env")
            return OpenAIProvider(api_key=api_key, model=model_name)
            
        else:
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key: raise ValueError("GEMINI_API_KEY missing in .env")
            return GeminiProvider(api_key=api_key, model=model_name)

    @property
    def provider_name(self) -> str:
        return self._provider.provider_name

    @property
    def model_name(self) -> str:
        return self._provider.model_name

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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=5, max=30),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    def _generate_with_retry(self, dynamic_provider: LLMProvider, system_prompt: str, user_prompt: str, model_id: str) -> str:
        try:
            return dynamic_provider.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                model_id=model_id
            )
        except Exception as exc:
            err_str = str(exc)
            if any(t in err_str.lower() for t in ["429", "quota", "rate limit"]):
                logger.warning("Rate limit hit: %s", err_str[:120])
                time.sleep(2)
            raise

    def ask(self, feature: str, user_input: str, extra_context: str = "", language: str = "en", provider: str = "openrouter", model_id: str = "meta-llama/llama-3.3-70b-instruct:free") -> str:
        if feature not in self.VALID_FEATURES: feature = "general"
        system_prompt = self._get_system_prompt(feature)
        
        # BILINGUAL STRICT PROMPT
        if language == "id":
            system_prompt += "\n\nCRITICAL BILINGUAL INSTRUCTION:\nYou MUST translate and write ALL explanations strictly in Indonesian. Wrap important concepts in <kw> and </kw> tags. Keep prefixes like ANSWER:, RESPONSE: in English."
        else:
            system_prompt += "\n\nCRITICAL INSTRUCTION:\nWrite all explanations in standard English. Wrap important algorithmic concepts in <kw> and </kw> tags."

        user_prompt_parts = []
        if extra_context: user_prompt_parts.append(f"Pseudocode / Context:\n{extra_context}")
        user_prompt_parts.append(f"Student: {user_input}\n\nResponse:")
        user_prompt = "\n\n".join(user_prompt_parts)

        try:
            # Gunakan provider dari parameter
            dyn_prov = self._get_dynamic_provider(provider, model_id)
            result = self._generate_with_retry(dyn_prov, system_prompt, user_prompt, model_id)
            return result
        except Exception as exc:
            return self._handle_error(exc)

    def explore(self, keyword: str, language: str = "en") -> str:
        system_prompt = PromptTemplates.inline_explore()
        if language == "id":
            system_prompt += "\n\nCRITICAL BILINGUAL INSTRUCTION:\nYou MUST write the DEF in Indonesian. Keep prefixes DEF|||, EXAMPLE|||, RELATED||| in English."
        else:
            system_prompt += "\n\nCRITICAL INSTRUCTION:\nWrite the DEF in English."

        user_prompt = f'Explain keyword for inline exploration: "{keyword}"'

        try:
            # Explore pakai model default yang cepat
            result = self._generate_with_retry(self._provider, system_prompt, user_prompt, self.model_name)
            return result
        except Exception as exc:
            return self._handle_error(exc)

    @staticmethod
    def _handle_error(exc: Exception) -> str:
        err_str = str(exc)
        if any(t in err_str.lower() for t in ["429", "quota", "rate limit"]):
            return "ERROR|||Rate limit exceeded. Please wait 1 minute before trying again."
        logger.error("LLM error: %s", err_str[:200])
        return f"ERROR|||{err_str[:200]}"