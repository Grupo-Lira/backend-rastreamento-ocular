# ML service (descrição rápida)

Local: `backend-rastreamento-ocular/ml/`

Objetivo: treinar um classificador binário que avalia se a sessão de rastreamento ocular foi "positive" (boa atenção) ou "negative".

Passos rápidos:

1. Criar dataset CSV com colunas de features e `label` (0 ou 1). Use `models/features.json` depois do primeiro treino para saber a ordem.
2. Instalar dependências:
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
3. Treinar:
```bash
python train.py --csv data/dataset.csv --label label
```
Saídas: `ml/models/model.pkl`, `ml/models/scaler.pkl`, `ml/models/features.json`

4. Servir o modelo (FastAPI):
```bash
uvicorn serve:app --host 0.0.0.0 --port 8000
```

5. Exemplo de request:
```json
POST /predict
{
  "data": {
    "phase1_tempo_reacao_medio_ms": 120,
    "phase1_tempo_reacao_desvio_padrao_ms": 25,
    "phase1_total_acertos": 9,
    "phase1_total_comissao": 1,
    "phase1_total_omissao": 0,
    "phase1_taxa_acerto": 0.9,
    "phase2_acertos": 3,
    "phase2_planetas_vistos": 3,
    "phase2_planetas_ignorados": 0,
    "phase2_taxa_acerto": 1.0,
    "phase3_tempo_reacao_medio_ms": 110,
    "phase3_tempo_reacao_desvio_padrao_ms": 22,
    "phase3_total_acertos": 10,
    "phase3_total_comissao": 0,
    "phase3_total_omissao": 0,
    "phase3_taxa_acerto": 1.0
  }
}
```

Observações:
- `train.py` aceita também extração direta do MongoDB quando a variável de ambiente `MONGO_URI` estiver definida e o parâmetro `--mongo DB COL` for informado.
- Salve versões do modelo em `ml/models/` (ex.: `model_v1.pkl`).
