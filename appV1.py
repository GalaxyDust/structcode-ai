"""
appV1.py - StructCode Flask Application (Multi-Model + History Version)
=======================================================================
Updates:
- /api/models         : List semua model tersedia dari registry
- /api/ask_multi      : Parallel multi-model endpoint
- /api/history        : Save & load history per session
- col_history         : MongoDB collection untuk history
- History juga disimpan di session server-side sebagai fallback
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Any

from flask import Flask, render_template, request, jsonify, session
from pymongo import MongoClient

from agentV1 import StructCodeAgent, MODEL_REGISTRY, DEFAULT_MODEL_ID

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

app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24).hex())

# ---------------------------------------------------------------------------
# MongoDB Configuration
# ---------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client["structcode_db"]

    col_usage     = db["usage_logs"]
    col_feedback  = db["feedback_logs"]
    col_survey    = db["survey_logs"]
    col_educator  = db["educator_logs"]
    col_error     = db["error_logs"]
    col_history   = db["history_logs"]   # NEW: untuk multi-model history

    client.server_info()
    logger.info("Successfully connected to MongoDB")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    db = None
    col_usage = col_feedback = col_survey = None
    col_educator = col_error = col_history = None

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
# Auth Data
# ---------------------------------------------------------------------------
ALLOWED_CLASSES = ["if4501", "if4502"]

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
        logger.warning("MongoDB collection tidak tersedia, log dilewati.")
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

def validate_model_ids(model_ids: list) -> list[str]:
    """
    Validasi dan filter model_ids.
    Hanya model yang ada di MODEL_REGISTRY yang diizinkan.
    Maksimal 3 model.
    """
    valid = [m for m in model_ids if m in MODEL_REGISTRY]
    if len(valid) > 3:
        valid = valid[:3]
    return valid

# ---------------------------------------------------------------------------
# Routes: Static Pages & Auth
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("indexV1.html")

@app.route("/api/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    name  = payload.get("name", "").strip()
    nim   = payload.get("nim", "").strip()
    kelas = payload.get("kelas", "").strip().lower()

    if not name or not nim or not kelas:
        return jsonify({"error": "Semua kolom (Nama, NIM, Kelas) harus diisi."}), 400

    kelas_norm = kelas.replace(" ", "").replace("-", "")

    if kelas_norm not in ALLOWED_CLASSES:
        return jsonify({"error": f"Kelas '{kelas}' tidak tersedia / tidak terdaftar."}), 403

    if nim in TEACHER_DB:
        if kelas_norm not in TEACHER_DB[nim]["classes"]:
            return jsonify({"error": f"Anda tidak ditugaskan untuk kelas {kelas_norm}"}), 403
        session["role"]  = "teacher"
        session["name"]  = name
        session["nim"]   = nim
        session["kelas"] = kelas_norm
        return jsonify({"status": "ok", "role": "teacher", "name": name})
    else:
        session["role"]  = "student"
        session["name"]  = name
        session["nim"]   = nim
        session["kelas"] = kelas_norm
        return jsonify({"status": "ok", "role": "student", "name": name})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"status": "ok"})

# ---------------------------------------------------------------------------
# Routes: Provider & Model Info
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

@app.route("/api/models")
def get_models():
    """
    Return daftar semua model tersedia dari MODEL_REGISTRY.
    Digunakan oleh frontend untuk render model selector dropdown.
    """
    models = []
    for model_id, info in MODEL_REGISTRY.items():
        models.append({
            "id": model_id,
            "label": info["label"],
            "persona": info["persona"],
            "expertise_tags": info["expertise_tags"],
            "icon": info["icon"],
            "context_length": info["context_length"],
            "is_free": info["is_free"],
            "description": info["description"],
            "provider_type": info["provider_type"],
            "is_default": model_id == DEFAULT_MODEL_ID,
        })
    return jsonify({
        "models": models,
        "default_model_id": DEFAULT_MODEL_ID,
        "max_selection": 3,
    })

# ---------------------------------------------------------------------------
# Routes: Single Ask (Backward Compatible)
# ---------------------------------------------------------------------------
@app.route("/api/ask", methods=["POST"])
def ask():
    """
    Single model ask endpoint.
    Backward compatible — digunakan jika hanya 1 model aktif.
    """
    if not agent:
        return jsonify({"error": "LLM agent not configured"}), 500

    payload       = request.get_json(silent=True) or {}
    feature       = payload.get("feature", "general")
    user_input    = payload.get("input", "").strip()
    extra_context = payload.get("extra", "").strip()
    language      = payload.get("language", "en")
    model_id      = payload.get("model_id", DEFAULT_MODEL_ID)

    if not user_input and feature != "explain":
        return jsonify({"error": "Input cannot be empty.", "response": None}), 400

    if feature == "explain" and not extra_context:
        return jsonify({"error": "Please paste pseudocode to explain.", "response": None}), 400

    # Validasi model_id
    if model_id not in MODEL_REGISTRY:
        model_id = DEFAULT_MODEL_ID

    response_text = agent.ask(
        feature=feature,
        user_input=user_input,
        extra_context=extra_context,
        language=language,
        model_id=model_id,
    )

    log_entry = {
        **build_base_log(feature),
        "language_used": language,
        "model_id_used": model_id,
        "rq1_query": {
            "input_preview": user_input[:500],
            "has_code_context": bool(extra_context),
            "code_context_lines": len(extra_context.splitlines()) if extra_context else 0,
            "input_word_count": len(user_input.split()),
            "is_follow_up": payload.get("is_follow_up", False),
            "follow_up_index": payload.get("follow_up_index", 0),
        },
        "rq2_response": {
            "response_preview": response_text[:1000],
            "response_length": len(response_text),
            "is_error": response_text.startswith("ERROR|||"),
            "manual_codes": {
                "correctness": None,
                "helpfulness": None,
                "solution_revelation": None,
                "query_type": None,
            },
        },
    }
    insert_log(col_usage, log_entry)

    if response_text.startswith("ERROR|||"):
        error_msg = response_text.replace("ERROR|||", "")
        insert_log(col_error, {
            **build_base_log(feature),
            "error_message": error_msg,
            "model_id": model_id,
            "error_type": "rate_limit" if "rate limit" in error_msg.lower() else "llm_error",
        })
        status_code = 429 if "rate limit" in error_msg.lower() else 500
        return jsonify({"error": error_msg, "response": None}), status_code

    return jsonify({
        "response": response_text,
        "model_id": model_id,
        "model_label": MODEL_REGISTRY.get(model_id, {}).get("label", model_id),
    })

# ---------------------------------------------------------------------------
# Routes: Multi-Model Ask (NEW)
# ---------------------------------------------------------------------------
@app.route("/api/ask_multi", methods=["POST"])
def ask_multi():
    """
    Multi-model parallel ask endpoint.

    Request body:
    {
        "feature": "general",
        "input": "Apa itu bubble sort?",
        "extra": "(optional) pseudocode",
        "language": "en",
        "model_ids": ["google/gemini-2.5-flash", "meta-llama/..."],
        "existing_model_ids": ["google/gemini-2.5-flash"]  // skip model ini
    }

    Response:
    {
        "results": {
            "google/gemini-2.5-flash": {
                "model_id": "...",
                "label": "Gemini Flash",
                "persona": "...",
                "icon": "⚡",
                "response": "...",
                "exec_time": 2.3,
                "error": null,
                "is_error": false
            },
            ...
        },
        "history_id": "uuid-string"
    }
    """
    if not agent:
        return jsonify({"error": "LLM agent not configured"}), 500

    payload             = request.get_json(silent=True) or {}
    feature             = payload.get("feature", "general")
    user_input          = payload.get("input", "").strip()
    extra_context       = payload.get("extra", "").strip()
    language            = payload.get("language", "en")
    model_ids           = payload.get("model_ids", [DEFAULT_MODEL_ID])
    existing_model_ids  = payload.get("existing_model_ids", [])

    # Validasi input
    if not user_input and feature != "explain":
        return jsonify({"error": "Input cannot be empty."}), 400

    if feature == "explain" and not extra_context:
        return jsonify({"error": "Please paste pseudocode to explain."}), 400

    # Validasi model IDs (filter invalid + max 3)
    model_ids = validate_model_ids(model_ids)
    if not model_ids:
        model_ids = [DEFAULT_MODEL_ID]

    # Jalankan multi-model parallel
    results = agent.ask_multi(
        feature=feature,
        user_input=user_input,
        model_ids=model_ids,
        extra_context=extra_context,
        language=language,
        existing_model_ids=existing_model_ids,
    )

    # Generate history ID untuk tracking
    history_id = str(uuid.uuid4())

    # Hitung statistik
    successful_models = [r for r in results.values() if not r.get("is_error")]
    failed_models     = [r for r in results.values() if r.get("is_error")]
    avg_exec_time     = (
        sum(r.get("exec_time", 0) for r in successful_models) / len(successful_models)
        if successful_models else 0
    )

    # Log ke MongoDB
    history_entry = {
        "history_id": history_id,
        **build_base_log(feature),
        "language_used": language,
        "input": user_input[:1000],
        "extra_context_preview": extra_context[:500] if extra_context else "",
        "has_extra_context": bool(extra_context),
        "model_ids_requested": model_ids,
        "model_ids_existing": existing_model_ids,
        "results": {
            model_id: {
                "response_preview": r.get("response", "")[:500],
                "response_length": len(r.get("response", "")),
                "exec_time": r.get("exec_time", 0),
                "is_error": r.get("is_error", False),
                "error": r.get("error"),
            }
            for model_id, r in results.items()
        },
        "stats": {
            "total_models_run": len(results),
            "successful_models": len(successful_models),
            "failed_models": len(failed_models),
            "avg_exec_time": round(avg_exec_time, 2),
        },
    }
    insert_log(col_history, history_entry)

    # Log ke usage juga (untuk analytics)
    insert_log(col_usage, {
        **build_base_log(feature),
        "language_used": language,
        "model_id_used": ",".join(model_ids),
        "is_multi_model": True,
        "history_id": history_id,
        "rq1_query": {
            "input_preview": user_input[:500],
            "has_code_context": bool(extra_context),
            "model_count": len(model_ids),
        },
        "rq2_response": {
            "successful_models": len(successful_models),
            "failed_models": len(failed_models),
            "avg_exec_time": round(avg_exec_time, 2),
            "is_error": len(successful_models) == 0,
        },
    })

    return jsonify({
        "results": results,
        "history_id": history_id,
        "stats": {
            "total_models_run": len(results),
            "successful": len(successful_models),
            "failed": len(failed_models),
            "avg_exec_time": round(avg_exec_time, 2),
        },
    })

# ---------------------------------------------------------------------------
# Routes: History (NEW)
# ---------------------------------------------------------------------------
@app.route("/api/history", methods=["GET"])
def get_history():
    """
    Ambil history untuk session aktif.
    Digunakan saat restore dari MongoDB (fallback dari localStorage).

    Query params:
    - feature: filter by feature (optional)
    - limit: jumlah entry (default 50)
    """
    if col_history is None:
        return jsonify({"history": [], "source": "db_unavailable"}), 200

    session_id = get_session_id()
    feature    = request.args.get("feature", "")
    limit      = min(int(request.args.get("limit", 50)), 100)

    query = {"session_id": session_id}
    if feature:
        query["feature"] = feature

    try:
        entries = list(
            col_history
            .find(query, {"_id": 0})
            .sort("timestamp", -1)
            .limit(limit)
        )
        return jsonify({
            "history": entries,
            "count": len(entries),
            "session_id": session_id,
            "source": "mongodb",
        })
    except Exception as exc:
        logger.error("Failed to fetch history: %s", exc)
        return jsonify({"history": [], "error": str(exc)}), 500

@app.route("/api/history", methods=["POST"])
def save_history():
    """
    Simpan satu history entry dari frontend (client-driven sync).
    Digunakan untuk sync localStorage ke MongoDB di background.
    """
    if col_history is None:
        return jsonify({"status": "skipped", "reason": "db_unavailable"}), 200

    payload = request.get_json(silent=True) or {}

    # Validasi minimal
    if not payload.get("feature") or not payload.get("input"):
        return jsonify({"error": "Missing required fields: feature, input"}), 400

    entry = {
        "history_id": payload.get("history_id", str(uuid.uuid4())),
        **build_base_log(payload.get("feature", "")),
        "language_used": payload.get("language", "en"),
        "input": payload.get("input", "")[:1000],
        "extra_context_preview": payload.get("extra_context_preview", "")[:300],
        "results": payload.get("results", {}),
        "synced_from_client": True,
        "client_timestamp": payload.get("timestamp", ""),
    }

    insert_log(col_history, entry)
    return jsonify({"status": "ok", "history_id": entry["history_id"]})

@app.route("/api/history/<history_id>", methods=["GET"])
def get_history_entry(history_id: str):
    """Ambil satu history entry by ID."""
    if col_history is None:
        return jsonify({"error": "Database not connected"}), 503

    try:
        entry = col_history.find_one(
            {"history_id": history_id},
            {"_id": 0}
        )
        if not entry:
            return jsonify({"error": "History entry not found"}), 404
        return jsonify(entry)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# ---------------------------------------------------------------------------
# Routes: Explore
# ---------------------------------------------------------------------------
@app.route("/api/explore", methods=["POST"])
def explore():
    if not agent:
        return jsonify({"error": "LLM agent not configured"}), 500

    payload  = request.get_json(silent=True) or {}
    keyword  = payload.get("keyword", "").strip()
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
# Routes: Feedback & Survey
# ---------------------------------------------------------------------------
@app.route("/api/feedback", methods=["POST"])
def feedback():
    payload  = request.get_json(silent=True) or {}
    feature  = payload.get("feature", "unknown")
    model_id = payload.get("model_id", DEFAULT_MODEL_ID)
    rating   = payload.get("rating")
    comment  = payload.get("comment", "").strip()
    is_edit  = bool(payload.get("is_edit", False))  # NEW

    if rating is not None:
        try:
            rating = int(rating)
            if rating not in range(1, 6):
                rating = None
        except:
            rating = None

    labels = {
        1: "very_unhelpful", 2: "unhelpful", 3: "neutral",
        4: "helpful", 5: "very_helpful"
    }

    log_entry = {
        **build_base_log(feature),
        "model_id_rated": model_id,
        "model_label": MODEL_REGISTRY.get(model_id, {}).get("label", model_id),
        "is_edit": is_edit,                               # NEW: flag edit
        "edit_timestamp": datetime.utcnow().isoformat() + "Z" if is_edit else None,
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
    return jsonify({
        "status": "ok",
        "rating_received": rating,
        "is_edit": is_edit,
    })

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
# Routes: Analytics (Teacher Only)
# ---------------------------------------------------------------------------
@app.route("/api/analytics/summary")
def analytics_summary():
    if db is None:
        return jsonify({"error": "Database not connected"}), 500

    if session.get("role") != "teacher":
        return jsonify({"error": "Akses Ditolak. Halaman ini hanya untuk Pengajar."}), 403

    kelas_aktif    = session.get("kelas")
    base_filter    = {"user_class": kelas_aktif, "feature": {"$ne": "explore"}}
    error_filter   = {"user_class": kelas_aktif, "rq2_response.is_error": True}

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
        "paper_baseline_pct": {
            feat: meta["paper_usage_pct"]
            for feat, meta in FEATURE_METADATA.items()
        },
        # NEW: model usage stats
        "model_usage": {},
        "multi_model_queries": 0,
    }

    try:
        summary["total_queries"]         = col_usage.count_documents(base_filter)
        summary["total_errors"]          = col_usage.count_documents(error_filter)
        summary["unique_sessions_count"] = len(
            col_usage.distinct("session_id", {"user_class": kelas_aktif})
        )
        summary["multi_model_queries"]   = col_usage.count_documents(
            {"user_class": kelas_aktif, "is_multi_model": True}
        )

        # Feature groupings
        pipeline = [
            {"$match": {
                "user_class": kelas_aktif,
                "feature": {"$in": list(FEATURE_METADATA.keys())}
            }},
            {"$group": {"_id": "$feature", "count": {"$sum": 1}}}
        ]
        for item in col_usage.aggregate(pipeline):
            summary["feature_counts"][item["_id"]] = item["count"]

        # Model usage dari history
        model_pipeline = [
            {"$match": {"user_class": kelas_aktif}},
            {"$unwind": "$model_ids_requested"},
            {"$group": {"_id": "$model_ids_requested", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        for item in col_history.aggregate(model_pipeline) if col_history else []:
            model_label = MODEL_REGISTRY.get(item["_id"], {}).get("label", item["_id"])
            summary["model_usage"][model_label] = item["count"]

        total_q = summary["total_queries"]
        if total_q > 0:
            summary["error_rate"] = round(summary["total_errors"] / total_q, 4)
            summary["feature_usage_pct"] = {
                f: round((c / total_q) * 100, 1)
                for f, c in summary["feature_counts"].items()
            }
        else:
            summary["feature_usage_pct"] = {f: 0.0 for f in FEATURE_METADATA}

        # Rating averages per feature
        for feat in FEATURE_METADATA:
            ratings = list(col_feedback.find(
                {
                    "feature": feat,
                    "user_class": kelas_aktif,
                    "rq2_rating.rating": {"$ne": None}
                },
                {"rq2_rating.rating": 1, "_id": 0}
            ))
            if ratings:
                summary["avg_ratings"][feat] = round(
                    sum(r["rq2_rating"]["rating"] for r in ratings) / len(ratings), 2
                )
            else:
                summary["avg_ratings"][feat] = None

    except Exception as e:
        logger.error(f"Error compiling analytics: {e}")

    return jsonify(summary)

# ---------------------------------------------------------------------------
# Application Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)