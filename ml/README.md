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
    "tempo_reacao_medio_ms": 120,
    "tempo_reacao_desvio_ms": 30,
    "total_acertos": 45,
    "total_comissao": 2,
    "total_omissao": 3,
    "taxa_acerto": 0.9
  }
}
```

Observações:
- `train.py` aceita também extração direta do MongoDB quando a variável de ambiente `MONGO_URI` estiver definida e o parâmetro `--mongo DB COL` for informado.
- Salve versões do modelo em `ml/models/` (ex.: `model_v1.pkl`).
