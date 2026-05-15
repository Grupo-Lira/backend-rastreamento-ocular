"""
Exporta um dataset final com uma linha por usuário/sessão, combinando as 3 fases.

Fontes:
  - experimento_fase_1 / resultados_analise (fase 1)
  - experimentos_fase_2 (fase 2)
  - estatisticas_fase_3 (fase 3)

Saída:
  - CSV pronto para treino do modelo binário final.

Uso exemplo:
  MONGO_URI="mongodb://127.0.0.1:27017" python export_dataset.py --db rastreamento_ocular --out data/dataset_final.csv
"""
from __future__ import annotations

import argparse
import csv
import math
import os
from collections import defaultdict
from pathlib import Path
from statistics import mean, pstdev

import pandas as pd

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover
    MongoClient = None

DWELL_REQUIRED_MS = 5000


def to_number(value, default=0.0):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else default
    except Exception:
        return default


def to_timestamp(value):
    if value is None:
        return 0.0
    if hasattr(value, "timestamp"):
        try:
            return float(value.timestamp() * 1000)
        except Exception:
            return 0.0
    return to_number(value, 0.0)


def safe_mean(values):
    values = [v for v in values if math.isfinite(v)]
    return round(mean(values), 2) if values else 0.0


def safe_std(values):
    values = [v for v in values if math.isfinite(v)]
    return round(pstdev(values), 2) if len(values) > 1 else 0.0


def compute_phase1_summary(doc):
    historico = doc.get("historico_olhar") or []
    resultados = doc.get("resultados_alvos") or []

    tempos_reacao = []
    total_acertos = 0
    total_comissao = 0
    total_omissao = 0

    for resultado in resultados:
        alvo_indice = resultado.get("alvo_indice")
        inicio = to_timestamp(resultado.get("tempo_inicio_alvo"))
        fim = to_timestamp(resultado.get("tempo_fim_alvo"))

        eventos = [
            item
            for item in historico
            if item.get("alvo_indice") == alvo_indice
            and inicio <= to_timestamp(item.get("timestamp")) <= fim
        ]
        eventos.sort(key=lambda item: to_timestamp(item.get("timestamp")))

        first_focus = next((item for item in eventos if item.get("is_focando")), None)
        tempo_reacao = None
        if first_focus is not None:
            tempo_reacao = max(0.0, to_timestamp(first_focus.get("timestamp")) - inicio)
            tempos_reacao.append(tempo_reacao)

        foco_maximo = 0.0
        desvio_maximo = 0.0
        inicio_bloco_foco = None
        inicio_bloco_desvio = inicio
        estado_atual_foco = False
        ultimo_ts = inicio

        for evento in eventos:
            ts = to_timestamp(evento.get("timestamp"))

            if estado_atual_foco:
                foco_maximo = max(foco_maximo, ts - (inicio_bloco_foco or ts))

            esta_focando = bool(evento.get("is_focando"))
            if not estado_atual_foco and esta_focando:
                inicio_bloco_foco = ts
                if inicio_bloco_desvio is not None:
                    desvio_maximo = max(desvio_maximo, ts - inicio_bloco_desvio)
                    inicio_bloco_desvio = None

            if estado_atual_foco and not esta_focando:
                if inicio_bloco_foco is not None:
                    foco_maximo = max(foco_maximo, ts - inicio_bloco_foco)
                inicio_bloco_foco = None
                inicio_bloco_desvio = ts

            estado_atual_foco = esta_focando
            ultimo_ts = ts

        if estado_atual_foco:
            foco_maximo = max(foco_maximo, fim - (inicio_bloco_foco or fim))
        elif inicio_bloco_desvio is not None:
            desvio_maximo = max(desvio_maximo, fim - inicio_bloco_desvio)

        if tempo_reacao is not None and tempo_reacao <= DWELL_REQUIRED_MS and foco_maximo >= DWELL_REQUIRED_MS:
            total_acertos += 1
        elif tempo_reacao is None or tempo_reacao > DWELL_REQUIRED_MS:
            total_omissao += 1
        elif desvio_maximo > DWELL_REQUIRED_MS or len(eventos) > 2:
            total_comissao += 1

    total_eventos = total_acertos + total_comissao + total_omissao
    taxa_acerto = round(total_acertos / total_eventos, 4) if total_eventos else 0.0

    return {
        "phase1_tempo_reacao_medio_ms": safe_mean(tempos_reacao),
        "phase1_tempo_reacao_desvio_padrao_ms": safe_std(tempos_reacao),
        "phase1_total_acertos": total_acertos,
        "phase1_total_comissao": total_comissao,
        "phase1_total_omissao": total_omissao,
        "phase1_taxa_acerto": taxa_acerto,
    }


def compute_phase2_summary(doc):
    acertos = int(to_number(doc.get("acertos"), 0))
    planetas_vistos = int(to_number(doc.get("planetas_vistos"), 0))
    planetas_ignorados = int(to_number(doc.get("planetas_ignorados"), 0))
    total = acertos + planetas_ignorados
    taxa_acerto = round(acertos / total, 4) if total else 0.0

    return {
        "phase2_acertos": acertos,
        "phase2_planetas_vistos": planetas_vistos,
        "phase2_planetas_ignorados": planetas_ignorados,
        "phase2_taxa_acerto": taxa_acerto,
    }


def compute_phase3_summary(doc):
    resumo = doc.get("resumo_metricas") or {}
    total_acertos = int(to_number(resumo.get("total_acertos"), 0))
    total_comissao = int(to_number(resumo.get("total_comissao"), 0))
    total_omissao = int(to_number(resumo.get("total_omissao"), 0))
    total_eventos = total_acertos + total_comissao + total_omissao
    taxa_acerto = round(total_acertos / total_eventos, 4) if total_eventos else 0.0

    return {
        "phase3_tempo_reacao_medio_ms": to_number(resumo.get("tempo_reacao_medio_ms"), 0),
        "phase3_tempo_reacao_desvio_padrao_ms": to_number(
            resumo.get("tempo_reacao_desvio_padrao_ms"),
            0,
        ),
        "phase3_total_acertos": total_acertos,
        "phase3_total_comissao": total_comissao,
        "phase3_total_omissao": total_omissao,
        "phase3_taxa_acerto": taxa_acerto,
    }


def build_row(client_id, phase1=None, phase2=None, phase3=None):
    row = {"client_id": client_id}
    row.update(phase1 or {})
    row.update(phase2 or {})
    row.update(phase3 or {})
    return row


def score_row(row):
    phase1_score = (
        row["phase1_taxa_acerto"]
        + max(0.0, 1.0 - min(row["phase1_tempo_reacao_medio_ms"] / 10000.0, 1.0))
        + max(0.0, 1.0 - min(row["phase1_tempo_reacao_desvio_padrao_ms"] / 5000.0, 1.0))
    ) / 3.0
    phase2_score = (
        row["phase2_taxa_acerto"]
        + max(0.0, 1.0 - min(row["phase2_planetas_ignorados"] / 10.0, 1.0))
    ) / 2.0
    phase3_score = (
        row["phase3_taxa_acerto"]
        + max(0.0, 1.0 - min(row["phase3_tempo_reacao_medio_ms"] / 10000.0, 1.0))
        + max(0.0, 1.0 - min(row["phase3_tempo_reacao_desvio_padrao_ms"] / 5000.0, 1.0))
    ) / 3.0
    combined_score = round((phase1_score + phase2_score + phase3_score) / 3.0, 4)
    row["combined_score"] = combined_score
    row["label"] = 1 if combined_score >= 0.6 else 0
    return row


def load_collection(client, db_name, collection_name):
    return list(client[db_name][collection_name].find({}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="Nome do banco Mongo")
    parser.add_argument("--out", default="data/dataset_final.csv", help="CSV de saída")
    args = parser.parse_args()

    mongo_uri = os.environ.get("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI não definido no ambiente")
    if MongoClient is None:
        raise RuntimeError("pymongo não está instalado")

    client = MongoClient(mongo_uri)

    fase1_docs = load_collection(client, args.db, "experimentos_fase_1")
    fase2_docs = load_collection(client, args.db, "experimentos_fase_2")
    fase3_docs = load_collection(client, args.db, "estatisticas_fase_3")

    fase1_by_client = {doc.get("client_id"): doc for doc in fase1_docs if doc.get("client_id")}
    fase2_by_client = {doc.get("client_id"): doc for doc in fase2_docs if doc.get("client_id")}
    fase3_by_client = {doc.get("usuario_id"): doc for doc in fase3_docs if doc.get("usuario_id")}

    all_client_ids = sorted(
        set(fase1_by_client) | set(fase2_by_client) | set(fase3_by_client)
    )

    rows = []
    for client_id in all_client_ids:
        row = build_row(
            client_id,
            compute_phase1_summary(fase1_by_client.get(client_id, {})) if client_id in fase1_by_client else {
                "phase1_tempo_reacao_medio_ms": 0,
                "phase1_tempo_reacao_desvio_padrao_ms": 0,
                "phase1_total_acertos": 0,
                "phase1_total_comissao": 0,
                "phase1_total_omissao": 0,
                "phase1_taxa_acerto": 0,
            },
            compute_phase2_summary(fase2_by_client.get(client_id, {})) if client_id in fase2_by_client else {
                "phase2_acertos": 0,
                "phase2_planetas_vistos": 0,
                "phase2_planetas_ignorados": 0,
                "phase2_taxa_acerto": 0,
            },
            compute_phase3_summary(fase3_by_client.get(client_id, {})) if client_id in fase3_by_client else {
                "phase3_tempo_reacao_medio_ms": 0,
                "phase3_tempo_reacao_desvio_padrao_ms": 0,
                "phase3_total_acertos": 0,
                "phase3_total_comissao": 0,
                "phase3_total_omissao": 0,
                "phase3_taxa_acerto": 0,
            },
        )
        rows.append(score_row(row))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if rows:
        pd.DataFrame(rows).to_csv(out_path, index=False, quoting=csv.QUOTE_MINIMAL)
        print(f"Dataset exportado para {out_path} ({len(rows)} linhas)")
    else:
        raise RuntimeError("Nenhum dado encontrado para exportar")


if __name__ == "__main__":
    main()
