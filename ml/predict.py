"""
CLI para previsão offline usando o modelo salvo.

Exemplos:
  python predict.py --json '{"tempo_reacao_medio_ms":100,...}'
  python predict.py --file sample_input.json
"""
import argparse
import json
from pathlib import Path
import joblib

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "models" / "model.pkl"
SCALER_PATH = BASE / "models" / "scaler.pkl"
FEATURES_PATH = BASE / "models" / "features.json"


def load_artifacts():
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(FEATURES_PATH, "r", encoding="utf-8") as f:
        features = json.load(f).get("features", [])
    return model, scaler, features


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--json", help="JSON com as features")
    group.add_argument("--file", help="Arquivo JSON com as features")
    args = parser.parse_args()

    model, scaler, FEATURES = load_artifacts()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(args.json)

    x = [float(data.get(f, 0.0)) for f in FEATURES]
    x_scaled = scaler.transform([x])
    prob = model.predict_proba(x_scaled)[0][1]
    label = "positive" if prob >= 0.5 else "negative"
    print(json.dumps({"evaluation": label, "score": float(prob)}, indent=2))


if __name__ == "__main__":
    main()
