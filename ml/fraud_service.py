"""
UPI Fraud Shield — Fraud Scoring SERVICE  (separate process, :8002)
===================================================================
In real UPI the fraud engine is NOT part of the app's payment server — it is a
separate service (the PSP's or NPCI's), reached over the network. This runs the
engine as exactly that: its own process, its own model in memory, its own mule
graph, exposed over HTTP. The payment backend (server/app.py) calls it on every
transaction and never imports the model itself.

Endpoints
  POST /score    {feats}  -> {score,label,reasons,ring,components,fraud_probability,latency_ms}
  POST /observe  {feats}  -> records the committed edge in the mule graph
  GET  /health

Run:  .venv/bin/python -m uvicorn ml.fraud_service:app --host 127.0.0.1 --port 8002
"""
from __future__ import annotations
import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .score import FraudEngine

app = FastAPI(title="UPI Fraud Scoring Service", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

engine: FraudEngine | None = None


@app.on_event("startup")
def _load():
    global engine
    engine = FraudEngine()          # loads the XGBoost model + SHAP explainer once
    print("Fraud scoring service up on :8002 — model + graph loaded")


class Feats(BaseModel):
    # The payment backend builds the full feature dict from the DB and sends it
    # verbatim; the service is deliberately dumb about accounts — it only scores.
    feats: dict[str, Any]


@app.get("/health")
def health():
    return {"ok": True, "model_loaded": engine is not None}


@app.post("/score")
def score(req: Feats):
    t0 = time.perf_counter()
    # observe=False: the service must not record an edge for money that may be
    # blocked. The backend calls /observe only after the transfer actually commits.
    out = engine.score(req.feats, observe=False)
    out["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    return out


@app.post("/observe")
def observe(req: Feats):
    engine.observe(req.feats)
    return {"observed": True}
