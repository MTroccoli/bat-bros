"""
database/db.py
Conexión a Supabase (PostgreSQL) via supabase-py.
Credenciales en .streamlit/secrets.toml o variables de entorno.
"""

import os
import streamlit as st
from supabase import create_client, Client

# ── Conexión ──────────────────────────────────────────────────────────────────

@st.cache_resource
def _client() -> Client:
    try:
        url = st.secrets["supabase"]["url"]
        key = st.secrets["supabase"]["anon_key"]
    except Exception:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "Credenciales de Supabase no encontradas. "
            "Configurá .streamlit/secrets.toml o SUPABASE_URL / SUPABASE_ANON_KEY."
        )
    return create_client(url, key)


# ── Setup / verificación ───────────────────────────────────────────────────────

def init_db() -> None:
    _client().table("configuracion").select("clave").limit(1).execute()


# ── Helpers genéricos ──────────────────────────────────────────────────────────

def fetch_all(table: str, select: str = "*", **filters) -> list[dict]:
    """SELECT con filtros de igualdad opcionales.
    Ejemplo: fetch_all("gastos", fecha="2026-05-01")
    """
    q = _client().table(table).select(select)
    for col, val in filters.items():
        q = q.eq(col, val)
    return q.execute().data


def fetch_one(table: str, select: str = "*", **filters) -> dict | None:
    """Devuelve la primera fila que coincide con los filtros."""
    q = _client().table(table).select(select)
    for col, val in filters.items():
        q = q.eq(col, val)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def insert(table: str, data: dict) -> dict:
    """Inserta una fila y devuelve el registro creado."""
    result = _client().table(table).insert(data).execute()
    return result.data[0] if result.data else {}


def update(table: str, data: dict, **filters) -> list[dict]:
    """Actualiza filas que coinciden con los filtros."""
    q = _client().table(table).update(data)
    for col, val in filters.items():
        q = q.eq(col, val)
    return q.execute().data


def delete(table: str, **filters) -> list[dict]:
    """Elimina filas que coinciden con los filtros."""
    q = _client().table(table).delete()
    for col, val in filters.items():
        q = q.eq(col, val)
    return q.execute().data


def upsert(table: str, data: dict | list[dict]) -> list[dict]:
    """INSERT … ON CONFLICT DO UPDATE."""
    result = _client().table(table).upsert(data).execute()
    return result.data


# ── Helpers de configuración ──────────────────────────────────────────────────

def get_config(clave: str) -> str | None:
    row = fetch_one("configuracion", select="valor", clave=clave)
    return row["valor"] if row else None


def set_config(clave: str, valor: str) -> None:
    upsert("configuracion", {"clave": clave, "valor": valor})


# ── Verificación rápida ───────────────────────────────────────────────────────

def verificar_db() -> dict:
    tablas = [
        "activos", "operaciones", "posiciones", "lotes",
        "operaciones_cerradas", "gastos", "ingresos",
        "presupuestos", "cuentas", "deudas", "alertas",
    ]
    resumen = {}
    try:
        sb = _client()
        for tabla in tablas:
            r = sb.table(tabla).select("*", count="exact").limit(0).execute()
            resumen[tabla] = r.count if r.count is not None else 0
        resumen["estado"] = "ok"
        resumen["bd"] = "Supabase PostgreSQL"
    except Exception as e:
        resumen["estado"] = "error"
        resumen["error"] = str(e)
    return resumen
