"""
Serviço HTTP simples para predição usando FastAPI.

Como rodar:
    uvicorn serve:app --host 0.0.0.0 --port 8000

O endpoint POST /predict espera um JSON com as features (mesmos nomes usados no treino).
Retorna JSON: { evaluation: "positive"|"negative", score: float }
"""
from pathlib import Path
import joblib
import json
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "models" / "model.pkl"
SCALER_PATH = BASE / "models" / "scaler.pkl"
FEATURES_PATH = BASE / "models" / "features.json"


def load_artifacts():
    if not MODEL_PATH.exists() or not SCALER_PATH.exists() or not FEATURES_PATH.exists():
        raise FileNotFoundError("model/scaler/features não encontrados. Rode train.py antes.")
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(FEATURES_PATH, "r", encoding="utf-8") as f:
        features = json.load(f).get("features", [])
    return model, scaler, features


_ARTIFACTS: Optional[tuple] = None

app = FastAPI(title="FocusQuest ML Service")


class FeaturesIn(BaseModel):
    data: Dict[str, float]


def get_artifacts():
    global _ARTIFACTS
    if _ARTIFACTS is None:
        _ARTIFACTS = load_artifacts()
    return _ARTIFACTS


@app.get("/health")
def health():
    try:
        get_artifacts()
        return {"status": "ok", "model_loaded": True}
    except Exception as exc:
        return {"status": "degraded", "model_loaded": False, "detail": str(exc)}


@app.post("/predict")
def predict(payload: FeaturesIn):
    data = payload.data
    try:
        model, scaler, FEATURES = get_artifacts()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Ensure all features present, fill missing with 0
    try:
        x = [float(data.get(f, 0.0)) for f in FEATURES]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler features: {e}")

    x_scaled = scaler.transform([x])
    prob = model.predict_proba(x_scaled)[0][1]
    label = "positive" if prob >= 0.5 else "negative"
    return {"evaluation": label, "score": float(prob)}
