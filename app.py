"""
app.py
Punto de entrada de finanzas_app.
Navegación horizontal fija: top bar en desktop, bottom tab bar en mobile.
"""

import streamlit as st
from database.db import init_db, verificar_db
from utils.theme import aplicar_tema, NAV_HEADER_H, NAV_BAR_H, NAV_SUB_H

# ── Config ────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Finanzas App",
    page_icon="💰",
    layout="wide",
    initial_sidebar_state="collapsed",
)
aplicar_tema()

# ── Base de datos ─────────────────────────────────────────────────────────────

@st.cache_resource
def _init_db() -> bool:
    try:
        init_db()
        return True
    except Exception:
        return False

db_ok = _init_db()

# ── Routing via query params ──────────────────────────────────────────────────

try:
    page = st.query_params.get("page", "dashboard")
    sub  = st.query_params.get("sub",  "mercado")
except AttributeError:
    # Streamlit < 1.30 fallback
    _p   = st.experimental_get_query_params()
    page = _p.get("page", ["dashboard"])[0]
    sub  = _p.get("sub",  ["mercado"])[0]

_PAGES = {"dashboard", "inversiones", "gastos", "ingresos", "presupuesto", "config"}
_SUBS  = {"mercado", "portafolio", "operaciones", "rentabilidad"}
if page not in _PAGES: page = "dashboard"
if sub  not in _SUBS:  sub  = "mercado"

# ── Definición de secciones ───────────────────────────────────────────────────

_NAV: list[tuple[str, str, str]] = [
    ("🏠", "Dashboard",   "dashboard"),
    ("📈", "Inversiones", "inversiones"),
    ("💸", "Gastos",      "gastos"),
    ("💵", "Ingresos",    "ingresos"),
    ("🎯", "Presupuesto", "presupuesto"),
    ("⚙️", "Config",      "config"),
]

_SUB: list[tuple[str, str, str]] = [
    ("🌐", "Mercado",      "mercado"),
    ("📋", "Portafolio",   "portafolio"),
    ("🔄", "Operaciones",  "operaciones"),
    ("📊", "Rentabilidad", "rentabilidad"),
]

# ── Topbar + Nav principal ────────────────────────────────────────────────────

def _nav_link(icon: str, label: str, key: str, active: bool,
              extra_params: str = "") -> str:
    href = f"?page={key}{extra_params}"
    cls  = "fin-nav-item fin-active" if active else "fin-nav-item"
    return (
        f'<a href="{href}" '
        f'onclick="window.top.location.href=\'{href}\'; return false;" '
        f'class="{cls}">'
        f'<span class="fin-nav-icon">{icon}</span>'
        f'<span class="fin-nav-label">{label}</span>'
        f'</a>'
    )

nav_html = "".join(
    _nav_link(ic, lb, k, k == page) for ic, lb, k in _NAV
)

st.markdown(
    f'<div class="fin-topbar">'
    f'  <div>'
    f'    <div class="fin-logo">💰 FINANZAS <span>APP</span></div>'
    f'    <div class="fin-logo-sub">Panel de control · Patrimonio personal</div>'
    f'  </div>'
    f'  <div class="fin-live">EN VIVO</div>'
    f'</div>'
    f'<nav class="fin-nav">{nav_html}</nav>',
    unsafe_allow_html=True,
)

# ── Sub-nav solo en Inversiones ───────────────────────────────────────────────

if page == "inversiones":
    sub_html = "".join(
        f'<a href="?page=inversiones&sub={k}" '
        f'onclick="window.top.location.href=\'?page=inversiones&sub={k}\'; return false;" '
        f'class="fin-sub-item {"fin-active" if k == sub else ""}">'
        f'{ic} {lb}</a>'
        for ic, lb, k in _SUB
    )
    st.markdown(f'<div class="fin-subnav">{sub_html}</div>', unsafe_allow_html=True)

# Ajustar padding-top dinámicamente según si hay sub-nav
_pt = NAV_HEADER_H + NAV_BAR_H + NAV_SUB_H + 16 if page == "inversiones" \
      else NAV_HEADER_H + NAV_BAR_H + 16
st.markdown(
    f'<style>[data-testid="stMainBlockContainer"]'
    f'{{padding-top:{_pt}px!important}}</style>',
    unsafe_allow_html=True,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _placeholder(nombre: str, ruta: str) -> None:
    st.title(nombre)
    st.info(f"🚧 Módulo en construcción · `{ruta}`")


def _render_config() -> None:
    from database.db import get_config, set_config

    st.title("⚙️ Configuración")
    st.divider()

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Usuarios")
        u1 = st.text_input("Nombre usuario 1", value=get_config("nombre_usuario_1") or "")
        u2 = st.text_input("Nombre usuario 2", value=get_config("nombre_usuario_2") or "")
    with col2:
        st.subheader("Inversiones")
        bench = st.text_input(
            "Benchmark (ticker)",
            value=get_config("benchmark_ticker") or "SPY",
            help="ETF para comparar el rendimiento del portafolio",
        )
    st.divider()

    if st.button("💾 Guardar configuración", type="primary"):
        try:
            set_config("nombre_usuario_1", u1)
            set_config("nombre_usuario_2", u2)
            set_config("benchmark_ticker", bench.upper())
            st.success("✅ Configuración guardada correctamente.")
        except Exception as e:
            st.error(f"❌ Error al guardar: {e}")

    with st.expander("🔍 Estado de la base de datos"):
        for k, v in verificar_db().items():
            st.text(f"{k}: {v}")

# ── Enrutamiento ──────────────────────────────────────────────────────────────

if not db_ok:
    st.error("❌ Error al inicializar la base de datos.")
    st.stop()

if page == "dashboard":
    try:
        from modules.dashboard import render
        render()
    except ImportError:
        _placeholder("Dashboard", "modules/dashboard.py")

elif page == "inversiones":
    if sub == "mercado":
        try:
            from modules.inversiones.mercado import render
            render()
        except ImportError:
            _placeholder("Mercado", "modules/inversiones/mercado.py")

    elif sub == "portafolio":
        try:
            from modules.inversiones.portafolio import render
            render()
        except ImportError:
            _placeholder("Portafolio", "modules/inversiones/portafolio.py")

    elif sub == "operaciones":
        try:
            from modules.inversiones.operaciones import render
            render()
        except ImportError:
            _placeholder("Operaciones", "modules/inversiones/operaciones.py")

    elif sub == "rentabilidad":
        try:
            from modules.inversiones.rentabilidad import render
            render()
        except ImportError:
            _placeholder("Rentabilidad", "modules/inversiones/rentabilidad.py")

elif page == "gastos":
    try:
        from modules.gastos import render
        render()
    except ImportError:
        _placeholder("Gastos", "modules/gastos.py")

elif page == "ingresos":
    try:
        from modules.ingresos import render
        render()
    except ImportError:
        _placeholder("Ingresos", "modules/ingresos.py")

elif page == "presupuesto":
    try:
        from modules.presupuesto import render
        render()
    except ImportError:
        _placeholder("Presupuesto", "modules/presupuesto.py")

elif page == "config":
    _render_config()
