"""
appV1.py - StructCode Flask Application (MongoDB Version - Render.com Ready)
==========================================================================
Web server providing REST API for StructCode pedagogical AI assistant.

Update Fase 1: 
- Sistem Autentikasi Dummy (Teacher & Student)
- Validasi Kelas IF4501 dan IF4502
- Route Analytics khusus Role Teacher
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Any
import time 
from flask import Flask, render_template, request, jsonify, session
from pymongo import MongoClient

# Mengambil class Agent (Pastikan agentV1.py berada di folder yang sama)
from agentV1 import StructCodeAgent

# ---------------------------------------------------------------------------
# Application Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("appV1")

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
)

# Secret key for session management (Diperlukan untuk Fitur Login)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24).hex())

# ---------------------------------------------------------------------------
# MongoDB Configuration
# ---------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client["structcode_db"] # Nama database
    
    # Collections
    col_usage = db["usage_logs"]
    col_feedback = db["feedback_logs"]
    col_survey = db["survey_logs"]
    col_educator = db["educator_logs"]
    col_error = db["error_logs"]
    
    client.server_info() # Trigger connection check
    logger.info("Successfully connected to MongoDB")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    db = None

# ---------------------------------------------------------------------------
# Feature Metadata
# ---------------------------------------------------------------------------
FEATURE_METADATA = {
    "general": {
        "label": "General Question",
        "description": "Conceptual algorithm questions",
        "paper_usage_pct": 38,
    },
    "from_code": {
        "label": "Question from Pseudocode",
        "description": "Questions about provided pseudocode",
        "paper_usage_pct": 28,
    },
    "explain": {
        "label": "Explain Pseudocode",
        "description": "Line-by-line explanation",
        "paper_usage_pct": 5.5,
    },
    "help_fix": {
        "label": "Help Fix Pseudocode",
        "description": "Debugging assistance",
        "paper_usage_pct": 23,
    },
    "help_write": {
        "label": "Help Write Pseudocode",
        "description": "Algorithm design guidance",
        "paper_usage_pct": 4,
    },
}

# ---------------------------------------------------------------------------
# Dummy Authentication Data (Dosen & Kelas)
# ---------------------------------------------------------------------------
ALLOWED_CLASSES = ["if4501", "if4502"]

# Hapus field "password" dari data dosen
TEACHER_DB = {
    "12345678": {
        "name": "Budi Dosen",
        "classes": ["if4501", "if4502"]
    },
    "87654321": {
        "name": "Siti Dosen",
        "classes": ["if4501"]
    }
}
# ---------------------------------------------------------------------------
# Agent Initialization
# ---------------------------------------------------------------------------
try:
    agent = StructCodeAgent()
    logger.info(
        "Agent ready | provider=%s | model=%s",
        agent.provider_name,
        agent.model_name,
    )
except ValueError as exc:
    logger.critical("Agent initialization failed: %s", exc)
    agent = None

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def insert_log(collection, data: dict[str, Any]) -> None:
    if collection is None:
        return
    try:
        collection.insert_one(data)
    except Exception as exc:
        logger.error(f"Failed to write log to MongoDB: {exc}")

def get_session_id() -> str:
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]

def build_base_log(feature: str = "") -> dict[str, Any]:
    """Build the common fields present in every log entry (Termasuk Session Login)."""
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "session_id": get_session_id(),
        "user_name": session.get("name", "anonymous"),
        "user_nim": session.get("nim", "anonymous"),
        "user_class": session.get("kelas", "unknown"),
        "user_role": session.get("role", "student"),
        "provider": agent.provider_name if agent else "unavailable",
        "model": agent.model_name if agent else "unavailable",
        "feature": feature,
        "user_agent": request.headers.get("User-Agent", "")[:200],
        "ip_hash": str(hash(request.remote_addr)), 
    }

# ---------------------------------------------------------------------------
# Routes: Static Pages & Auth
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("indexV1.html")

@app.route("/api/login", methods=["POST"])
def login():
    """Endpoint untuk autentikasi user (Mahasiswa / Dosen). Tanpa Password."""
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    nim = payload.get("nim", "").strip()
    kelas = payload.get("kelas", "").strip().lower()

    if not name or not nim or not kelas:
        return jsonify({"error": "Semua kolom (Nama, NIM, Kelas) harus diisi."}), 400

    # Normalisasi spasi / strip class (contoh "if 4501" -> "if4501")
    kelas_norm = kelas.replace(" ", "").replace("-", "")

    # Validasi keberadaan kelas
    if kelas_norm not in ALLOWED_CLASSES:
        return jsonify({"error": f"Kelas '{kelas}' tidak tersedia / tidak terdaftar."}), 403

    # Cek apakah user ini Dosen
    if nim in TEACHER_DB:
        if kelas_norm not in TEACHER_DB[nim]["classes"]:
            return jsonify({"error": f"Anda tidak ditugaskan untuk kelas {kelas_norm}"}), 403
        
        # Login Berhasil sebagai Dosen
        session["role"] = "teacher"
        session["name"] = name
        session["nim"] = nim
        session["kelas"] = kelas_norm
        return jsonify({"status": "ok", "role": "teacher", "name": name})
    else:
        # Login sebagai Mahasiswa
        session["role"] = "student"
        session["name"] = name
        session["nim"] = nim
        session["kelas"] = kelas_norm
        return jsonify({"status": "ok", "role": "student", "name": name})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"status": "ok"})

# ---------------------------------------------------------------------------
# Routes: Provider Info
# ---------------------------------------------------------------------------
@app.route("/api/provider")
def provider_info():
    if not agent:
        return jsonify({"error": "Agent not initialized"}), 500
    
    return jsonify({
        "provider": agent.provider_name,
        "model": agent.model_name,
        "features": FEATURE_METADATA,
    })

# ---------------------------------------------------------------------------
# Routes: Main Ask Endpoint (RQ1 + RQ2)
# ---------------------------------------------------------------------------

@app.route("/api/ask", methods=["POST"])
def ask():
    if not agent:
        return jsonify({"error": "LLM agent not configured"}), 500

    payload = request.get_json(silent=True) or {}
    feature = payload.get("feature", "general")
    user_input = payload.get("input", "").strip()
    extra_context = payload.get("extra", "").strip()
    language = payload.get("language", "en")
    model_id = payload.get("model_id") # Menerima model dinamis

    if not user_input and feature != "explain":
        return jsonify({"error": "Input cannot be empty."}), 400

    # MENGUKUR WAKTU EKSEKUSI
    start_time = time.time()
    response_text = agent.ask(
        feature=feature,
        user_input=user_input,
        extra_context=extra_context,
        language=language,
        model_id=model_id
    )
    execution_time = round(time.time() - start_time, 2)

    log_entry = {
        **build_base_log(feature),
        "model_used": model_id or agent.model_name,
        "execution_time_sec": execution_time,
        "language_used": language,
        "rq1_query": {
            "input_preview": user_input,
            "extra_context": extra_context,
        },
        "rq2_response": {
            "response_preview": response_text,
            "is_error": response_text.startswith("ERROR|||"),
        },
    }

    insert_log(col_usage, log_entry)

    if response_text.startswith("ERROR|||"):
        error_msg = response_text.replace("ERROR|||", "")
        return jsonify({"error": error_msg, "execution_time": execution_time}), 429

    return jsonify({
        "response": response_text, 
        "execution_time": execution_time,
        "model_id": model_id
    })

@app.route("/api/history", methods=["GET"])
def get_history():
    """Mengambil riwayat percakapan agar tidak hilang saat direfresh"""
    if db is None:
        return jsonify({"error": "Database error"}), 500
        
    session_id = get_session_id()
    # Cari 50 log terakhir dari sesi ini untuk fitur general
    logs = list(col_usage.find(
        {"session_id": session_id, "feature": "general", "rq2_response.is_error": False},
        {"_id": 0}
    ).sort("timestamp", 1).limit(50))
    
    return jsonify({"status": "ok", "history": logs})

# ---------------------------------------------------------------------------
# Routes: Inline Exploration (RQ1 + D1)
# ---------------------------------------------------------------------------
@app.route("/api/explore", methods=["POST"])
def explore():
    if not agent:
        return jsonify({"error": "LLM agent not configured"}), 500

    payload = request.get_json(silent=True) or {}
    keyword = payload.get("keyword", "").strip()
    language = payload.get("language", "en")

    if not keyword:
        return jsonify({"error": "Keyword cannot be empty."}), 400

    result = agent.explore(keyword=keyword, language=language)

    insert_log(col_usage, {
        **build_base_log("explore"),
        "language_used": language,
        "rq1_query": {
            "input_preview": keyword,
            "interaction_type": "inline_keyword_exploration",
        },
        "rq2_response": {
            "response_preview": result[:500],
            "is_error": result.startswith("ERROR|||"),
            "manual_codes": {"correctness": None, "helpfulness": None},
        },
    })

    if result.startswith("ERROR|||"):
        error_msg = result.replace("ERROR|||", "")
        return jsonify({"error": error_msg, "response": None}), 429

    return jsonify({"response": result})

# ---------------------------------------------------------------------------
# Routes: Feedback & Survey (RQ2 + RQ3)
# ---------------------------------------------------------------------------
@app.route("/api/feedback", methods=["POST"])
def feedback():
    payload = request.get_json(silent=True) or {}
    feature = payload.get("feature", "unknown")
    rating = payload.get("rating")
    comment = payload.get("comment", "").strip()
    
    if rating is not None:
        try:
            rating = int(rating)
            if rating not in range(1, 6): rating = None
        except: rating = None

    labels = {1: "very_unhelpful", 2: "unhelpful", 3: "neutral", 4: "helpful", 5: "very_helpful"}

    log_entry = {
        **build_base_log(feature),
        "rq2_rating": {
            "rating": rating,
            "rating_label": labels.get(rating, "no_rating"),
            "response_preview": payload.get("snippet", "")[:300],
        },
        "rq3_perception": {
            "comment": comment,
            "query_preview": payload.get("query_snippet", "")[:200],
            "is_follow_up": payload.get("is_follow_up", False),
            "manual_sentiment": None,
        },
    }

    insert_log(col_feedback, log_entry)
    return jsonify({"status": "ok", "rating_received": rating})

@app.route("/api/survey", methods=["POST"])
def survey():
    payload = request.get_json(silent=True) or {}
    log_entry = {
        **build_base_log(),
        "rq3_weekly_survey": {
            "week_number": payload.get("week_number"),
            "usefulness_rating": payload.get("usefulness_rating"),
            "liked_aspects": payload.get("open_feedback", "")[:1000],
        },
    }
    insert_log(col_survey, log_entry)
    return jsonify({"status": "ok", "message": "Survey submitted. Thank you!"})

# ---------------------------------------------------------------------------
# Routes: Analytics Summary (Untuk Dosen)
# ---------------------------------------------------------------------------
@app.route("/api/analytics/summary")
def analytics_summary():
    """Mengambil Analytics. HANYA UNTUK ROLE TEACHER."""
    if db is None:
        return jsonify({"error": "Database not connected"}), 500

    # Role validation
    if session.get("role") != "teacher":
        return jsonify({"error": "Akses Ditolak. Halaman ini hanya untuk Pengajar (Teacher)."}), 403

    kelas_aktif = session.get("kelas")
    base_filter = {"user_class": kelas_aktif, "feature": {"$ne": "explore"}}
    explore_filter = {"user_class": kelas_aktif, "feature": "explore"}
    error_filter = {"user_class": kelas_aktif, "rq2_response.is_error": True}
    feedback_filter = {"user_class": kelas_aktif}

    summary = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "target_class": kelas_aktif,
        "feature_counts": {f: 0 for f in FEATURE_METADATA},
        "total_queries": 0,
        "total_errors": 0,
        "error_rate": 0.0,
        "avg_ratings": {},
        "unique_sessions_count": 0,
        "feature_usage_pct": {},
        "paper_baseline_pct": {feat: meta["paper_usage_pct"] for feat, meta in FEATURE_METADATA.items()}
    }

    try:
        summary["total_queries"] = col_usage.count_documents(base_filter)
        summary["total_errors"] = col_usage.count_documents(error_filter)
        summary["unique_sessions_count"] = len(col_usage.distinct("session_id", {"user_class": kelas_aktif}))

        # Feature groupings for specific class
        pipeline = [
            {"$match": {"user_class": kelas_aktif, "feature": {"$in": list(FEATURE_METADATA.keys())}}},
            {"$group": {"_id": "$feature", "count": {"$sum": 1}}}
        ]
        for item in col_usage.aggregate(pipeline):
            summary["feature_counts"][item["_id"]] = item["count"]

        total_q = summary["total_queries"]
        if total_q > 0:
            summary["error_rate"] = round(summary["total_errors"] / total_q, 4)
            summary["feature_usage_pct"] = {f: round((c / total_q) * 100, 1) for f, c in summary["feature_counts"].items()}
        else:
            summary["feature_usage_pct"] = {f: 0.0 for f in FEATURE_METADATA}

        # Rating averages
        for feat in FEATURE_METADATA:
            ratings = list(col_feedback.find(
                {"feature": feat, "user_class": kelas_aktif, "rq2_rating.rating": {"$ne": None}}, 
                {"rq2_rating.rating": 1, "_id": 0}
            ))
            if ratings:
                summary["avg_ratings"][feat] = round(sum(r["rq2_rating"]["rating"] for r in ratings) / len(ratings), 2)
            else:
                summary["avg_ratings"][feat] = None

    except Exception as e:
        logger.error(f"Error compiling analytics from MongoDB: {e}")

    return jsonify(summary)

# ---------------------------------------------------------------------------
# Application Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)