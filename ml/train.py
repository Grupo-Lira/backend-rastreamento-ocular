"""
Treinamento básico do modelo de classificação binária para a avaliação final.

Uso:
    - Treinar a partir de CSV:
            python train.py --csv data/dataset.csv --label label
    - Treinar extraindo do MongoDB (forneça MONGO_URI):
            MONGO_URI="mongodb://..." python train.py --mongo dbname collection --label label

Saída:
    - models/model.pkl
    - models/scaler.pkl
    - models/features.json
"""
import argparse
import json
import os
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

try:
    from pymongo import MongoClient
except Exception:
    MongoClient = None


FINAL_FEATURES = [
    "phase1_tempo_reacao_medio_ms",
    "phase1_tempo_reacao_desvio_padrao_ms",
    "phase1_total_acertos",
    "phase1_total_comissao",
    "phase1_total_omissao",
    "phase1_taxa_acerto",
    "phase2_acertos",
    "phase2_planetas_vistos",
    "phase2_planetas_ignorados",
    "phase2_taxa_acerto",
    "phase3_tempo_reacao_medio_ms",
    "phase3_tempo_reacao_desvio_padrao_ms",
    "phase3_total_acertos",
    "phase3_total_comissao",
    "phase3_total_omissao",
    "phase3_taxa_acerto",
]


def load_from_csv(path: str) -> pd.DataFrame:
    return pd.read_csv(path)


def load_from_mongo(uri: str, db: str, collection: str) -> pd.DataFrame:
    if MongoClient is None:
        raise RuntimeError("pymongo não está instalado")
    client = MongoClient(uri)
    col = client[db][collection]
    docs = list(col.find({}))
    if not docs:
        return pd.DataFrame()
    df = pd.DataFrame(docs)
    return df


def ensure_models_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def prepare_features(df: pd.DataFrame, features: list, label: str = None):
    # garante o mesmo contrato em treino e predição, preenchendo colunas ausentes com zero
    X = df.reindex(columns=features, fill_value=0).copy()
    X = X.apply(pd.to_numeric, errors="coerce").fillna(0)
    y = None
    if label and label in df.columns:
        y = pd.to_numeric(df[label], errors="coerce").fillna(0).astype(int)
    return X, y, list(features)


def build_cv(y: pd.Series):
    class_counts = y.value_counts()
    min_class = int(class_counts.min()) if not class_counts.empty else 0
    if min_class < 2:
        return None

    n_splits = min(5, min_class)
    return StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Caminho para CSV de treino")
    parser.add_argument("--mongo", nargs=2, metavar=("DB", "COL"), help="Extrair dados do Mongo: DB COL")
    parser.add_argument("--label", default="label", help="Nome da coluna label (binária)")
    parser.add_argument("--out", default="models", help="Pasta de saída para modelos")
    args = parser.parse_args()

    df = None
    if args.csv:
        df = load_from_csv(args.csv)
    elif args.mongo:
        uri = os.environ.get("MONGO_URI")
        if not uri:
            raise RuntimeError("MONGO_URI não definido no ambiente")
        db, col = args.mongo
        df = load_from_mongo(uri, db, col)
    else:
        raise RuntimeError("Especifique --csv ou --mongo DB COL")

    if df is None or df.empty:
        raise RuntimeError("Dataset vazio")

    X, y, available = prepare_features(df, FINAL_FEATURES, args.label)
    if y is None:
        raise RuntimeError("Label não encontrado no dataset; passe --label <coluna>")

    outdir = Path(args.out)
    ensure_models_dir(outdir)

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X.values)

    X_train, X_test, y_train, y_test = train_test_split(
        Xs,
        y.values,
        test_size=0.2,
        random_state=42,
        stratify=y.values if len(set(y.values)) > 1 else None,
    )

    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)

    cv = build_cv(y)
    scores = cross_val_score(clf, Xs, y.values, cv=cv, scoring="roc_auc") if cv else []

    joblib.dump(clf, outdir / "model.pkl")
    joblib.dump(scaler, outdir / "scaler.pkl")
    with open(outdir / "features.json", "w", encoding="utf-8") as f:
        json.dump({"features": available}, f, ensure_ascii=False, indent=2)

    print("Treinamento concluído")
    if len(scores):
        print(f"ROC-AUC CV mean: {scores.mean():.4f}")
    else:
        print("ROC-AUC CV indisponível: poucas amostras por classe")
    print(f"Model saved to: {outdir / 'model.pkl'}")


if __name__ == "__main__":
    main()
