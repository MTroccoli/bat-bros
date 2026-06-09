"""
utils/theme.py
Módulo centralizado de tema visual — estética dark navy financiero.

Uso:
  1. En app.py, justo después de st.set_page_config(): aplicar_tema()
  2. Para colorear P&L: color_pl(valor) → hex string
  3. Para gráficos Plotly: fig.update_layout(**plantilla_plotly())
"""

import streamlit as st

# ── Paleta (única fuente de verdad) ───────────────────────────────────────────
COLORES: dict[str, str] = {
    "fondo":          "#040F20",
    "superficie":     "#071E3D",
    "superficie_alt": "#0D2D57",
    "superficie_3":   "#0D3D75",
    "borde":          "rgba(46,127,217,0.22)",
    "borde_fuerte":   "rgba(46,127,217,0.40)",
    "texto":          "#E8F0FB",
    "texto_sec":      "rgba(180,205,240,0.55)",
    "acento":         "#2E7FD9",
    "acento_oscuro":  "#14549C",
    "acento_aqua":    "#00C4CC",
    "ganancia":       "#29D985",
    "perdida":        "#FF5E5E",
    "neutro":         "rgba(180,205,240,0.45)",
    "oro":            "#FFD166",
    "plata":          "#C0C0C0",
    "bronce":         "#CD7F32",
}

# Alturas de la nav fija (sincronizadas con el CSS de abajo)
NAV_HEADER_H = 54   # px — topbar
NAV_BAR_H    = 46   # px — barra de secciones
NAV_SUB_H    = 44   # px — sub-nav de Inversiones
NAV_MOB_H    = 62   # px — barra inferior mobile


def color_pl(valor: float) -> str:
    """Verde si valor > 0, rojo si < 0, neutro si == 0."""
    if valor > 0:
        return COLORES["ganancia"]
    if valor < 0:
        return COLORES["perdida"]
    return COLORES["neutro"]


def aplicar_tema() -> None:
    """
    Inyecta el CSS global del tema.
    Llamar una única vez en app.py, justo después de st.set_page_config().

    Qué hace:
    - Importa Bebas Neue, DM Sans y DM Mono desde Google Fonts.
    - Oculta la interfaz nativa de Streamlit (header, toolbar, sidebar).
    - Aplica la paleta navy a todos los componentes.
    - Define .fin-topbar, .fin-nav y .fin-subnav como elementos fijos
      (desktop: arriba; mobile ≤768px: nav va abajo como bottom tab bar).
    """
    c = COLORES
    css = f"""
    <style>
    /* ── Fuentes ─────────────────────────────────────────────────────────── */
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

    html, body, [class*="css"] {{
        font-family: 'DM Sans', sans-serif;
    }}

    /* ── Fondo + rejilla sutil ───────────────────────────────────────────── */
    .stApp {{
        background-color: {c['fondo']};
        background-image:
            linear-gradient(rgba(46,127,217,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(46,127,217,0.04) 1px, transparent 1px);
        background-size: 48px 48px;
    }}

    /* ── Ocultar chrome nativo de Streamlit ──────────────────────────────── */
    #MainMenu,
    footer,
    [data-testid="stToolbar"],
    [data-testid="stHeader"],
    [data-testid="stDecoration"],
    [data-testid="stSidebarCollapseButton"] {{
        display: none !important;
    }}
    section[data-testid="stSidebar"] {{
        display: none !important;
    }}

    /* ── Resetear padding superior del contenedor principal ─────────────── */
    [data-testid="stMainBlockContainer"] {{
        padding-top: {NAV_HEADER_H + NAV_BAR_H + 16}px !important;
        max-width: 100% !important;
    }}

    /* ══════════════════════════════════════════════════════════════════════
       NAVEGACIÓN FIJA — Desktop
    ══════════════════════════════════════════════════════════════════════ */

    /* Header con logo */
    .fin-topbar {{
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 9999;
        height: {NAV_HEADER_H}px;
        background: {c['fondo']};
        border-bottom: 1px solid {c['borde']};
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        box-shadow: 0 2px 20px rgba(0,0,0,0.5);
    }}
    .fin-logo {{
        font-family: 'Bebas Neue', sans-serif;
        font-size: 22px;
        letter-spacing: 0.07em;
        color: {c['texto']};
        line-height: 1;
    }}
    .fin-logo span {{ color: {c['acento']}; }}
    .fin-logo-sub {{
        font-family: 'DM Mono', monospace;
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: {c['texto_sec']};
        margin-top: 1px;
    }}
    .fin-live {{
        font-family: 'DM Mono', monospace;
        font-size: 9px;
        color: {c['ganancia']};
        letter-spacing: 0.06em;
        display: flex;
        align-items: center;
        gap: 5px;
    }}
    .fin-live::before {{
        content: '';
        width: 6px; height: 6px;
        border-radius: 50%;
        background: {c['ganancia']};
        animation: fin-blink 2s ease-in-out infinite;
    }}
    @keyframes fin-blink {{ 0%,100%{{opacity:1}} 50%{{opacity:.3}} }}

    /* Barra de secciones principal */
    .fin-nav {{
        position: fixed;
        top: {NAV_HEADER_H}px; left: 0; right: 0;
        z-index: 9998;
        height: {NAV_BAR_H}px;
        background: {c['superficie']};
        border-bottom: 1px solid {c['borde']};
        display: flex;
        align-items: stretch;
        padding: 0 8px;
        overflow-x: auto;
        scrollbar-width: none;
    }}
    .fin-nav::-webkit-scrollbar {{ display: none; }}

    .fin-nav-item {{
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0 16px;
        font-family: 'DM Sans', sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: {c['texto_sec']};
        text-decoration: none !important;
        border-bottom: 2px solid transparent;
        white-space: nowrap;
        transition: color .15s, background .15s;
    }}
    .fin-nav-item:hover, .fin-nav-item:visited,
    .fin-nav-item:focus, .fin-nav-item:active {{
        text-decoration: none !important;
        color: {c['texto']};
    }}
    .fin-nav-item.fin-active {{
        color: {c['acento']};
        border-bottom-color: {c['acento']};
        background: rgba(46,127,217,0.07);
    }}
    .fin-nav-icon {{ font-size: 14px; }}
    .fin-nav-label {{ /* visible en desktop */ }}

    /* Sub-nav de Inversiones */
    .fin-subnav {{
        position: fixed;
        top: {NAV_HEADER_H + NAV_BAR_H}px; left: 0; right: 0;
        z-index: 9997;
        height: {NAV_SUB_H}px;
        background: rgba(4,15,32,0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-bottom: 1px solid {c['borde']};
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 24px;
        overflow-x: auto;
        scrollbar-width: none;
    }}
    .fin-subnav::-webkit-scrollbar {{ display: none; }}

    .fin-sub-item {{
        font-family: 'DM Mono', monospace;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: {c['texto_sec']};
        padding: 5px 14px;
        border-radius: 20px;
        text-decoration: none !important;
        border: 1px solid transparent;
        white-space: nowrap;
        transition: all .15s;
    }}
    .fin-sub-item:hover, .fin-sub-item:visited,
    .fin-sub-item:focus, .fin-sub-item:active {{
        text-decoration: none !important;
        color: {c['texto']};
        border-color: {c['borde_fuerte']};
    }}
    .fin-sub-item.fin-active {{
        color: {c['acento']};
        background: rgba(46,127,217,0.12);
        border-color: rgba(46,127,217,0.4);
    }}

    /* ══════════════════════════════════════════════════════════════════════
       NAVEGACIÓN FIJA — Mobile (≤768px)
       La barra de secciones se mueve al fondo como bottom tab bar.
    ══════════════════════════════════════════════════════════════════════ */
    @media (max-width: 768px) {{
        .fin-topbar {{
            height: 50px;
            padding: 0 14px;
        }}
        .fin-logo {{ font-size: 19px; }}

        /* Nav va al fondo */
        .fin-nav {{
            top: auto;
            bottom: 0;
            height: {NAV_MOB_H}px;
            justify-content: space-around;
            padding: 0;
            border-top: 1px solid {c['borde']};
            border-bottom: none;
            background: rgba(7,30,61,0.97);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
        }}
        .fin-nav-item {{
            flex-direction: column;
            gap: 3px;
            padding: 6px 4px;
            border-bottom: none;
            border-top: 2px solid transparent;
            border-bottom: none !important;
            flex: 1;
            justify-content: center;
            text-align: center;
            font-size: 8px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }}
        .fin-nav-item.fin-active {{
            border-top-color: {c['acento']};
            border-bottom: none !important;
        }}
        .fin-nav-icon {{ font-size: 20px; }}

        /* Sub-nav de Inversiones: debajo del header */
        .fin-subnav {{
            top: 50px;
            height: auto;
            min-height: 42px;
            padding: 6px 12px;
        }}

        /* Padding del contenido en mobile */
        [data-testid="stMainBlockContainer"] {{
            padding-top: 60px !important;
            padding-bottom: 72px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
        }}
    }}

    /* ══════════════════════════════════════════════════════════════════════
       COMPONENTES DE STREAMLIT
    ══════════════════════════════════════════════════════════════════════ */

    /* Títulos */
    h1 {{
        font-family: 'Bebas Neue', sans-serif !important;
        font-size: clamp(1.8rem, 4vw, 2.6rem) !important;
        letter-spacing: 0.06em !important;
        color: {c['texto']} !important;
        line-height: 1.05 !important;
    }}
    h2 {{
        font-family: 'Bebas Neue', sans-serif !important;
        font-size: clamp(1.2rem, 3vw, 1.7rem) !important;
        letter-spacing: 0.05em !important;
        color: {c['acento']} !important;
        line-height: 1.1 !important;
    }}
    h3 {{
        font-family: 'DM Mono', monospace !important;
        font-size: 0.75rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.12em !important;
        color: {c['texto_sec']} !important;
    }}

    /* Métricas */
    [data-testid="metric-container"] {{
        background-color: {c['superficie']};
        border: 1px solid {c['borde']};
        border-radius: 12px;
        padding: 1rem 1.2rem;
        font-variant-numeric: tabular-nums;
    }}
    [data-testid="metric-container"] label {{
        font-family: 'DM Mono', monospace !important;
        font-size: 0.68rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.12em !important;
        color: {c['texto_sec']} !important;
    }}
    [data-testid="metric-container"] [data-testid="stMetricValue"] {{
        font-family: 'Bebas Neue', sans-serif !important;
        font-size: 1.9rem !important;
        letter-spacing: 0.04em !important;
        color: {c['texto']} !important;
    }}
    [data-testid="metric-container"] [data-testid="stMetricDelta"] {{
        font-family: 'DM Mono', monospace !important;
        font-size: 0.8rem !important;
        font-variant-numeric: tabular-nums;
    }}

    /* Tablas */
    [data-testid="stDataFrame"], .stDataFrame {{
        font-variant-numeric: tabular-nums;
        border: 1px solid {c['borde']};
        border-radius: 10px;
        overflow: hidden;
    }}
    .stDataFrame thead tr th {{
        background-color: {c['superficie_alt']} !important;
        font-family: 'DM Mono', monospace !important;
        font-size: 0.68rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.1em !important;
        color: {c['texto_sec']} !important;
        border-bottom: 1px solid {c['borde']} !important;
    }}
    .stDataFrame tbody tr:hover td {{
        background-color: {c['superficie_alt']} !important;
    }}

    /* Botones */
    .stButton > button {{
        background-color: {c['acento_oscuro']};
        color: {c['texto']};
        border: 1px solid {c['acento']};
        border-radius: 8px;
        padding: 0.45rem 1.1rem;
        font-family: 'DM Sans', sans-serif;
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        transition: all 0.15s ease;
    }}
    .stButton > button:hover {{
        background-color: {c['acento']};
        border-color: {c['acento']};
        color: #ffffff;
    }}
    .stButton > button[kind="secondary"] {{
        background-color: {c['superficie_alt']};
        border-color: {c['borde_fuerte']};
        color: {c['texto_sec']};
    }}
    .stButton > button[kind="secondary"]:hover {{
        background-color: {c['superficie_3']};
        color: {c['texto']};
    }}

    /* Inputs */
    .stTextInput > div > div > input,
    .stNumberInput > div > div > input,
    .stSelectbox > div > div,
    .stDateInput > div > div > input,
    .stTextArea textarea {{
        background-color: {c['superficie_alt']} !important;
        border: 1px solid {c['borde_fuerte']} !important;
        border-radius: 8px !important;
        color: {c['texto']} !important;
        font-variant-numeric: tabular-nums;
    }}
    .stTextInput > div > div > input:focus,
    .stNumberInput > div > div > input:focus {{
        border-color: {c['acento']} !important;
        box-shadow: 0 0 0 2px rgba(46,127,217,0.2) !important;
    }}
    .stSelectbox [data-baseweb="select"] > div {{
        background-color: {c['superficie_alt']} !important;
        border-color: {c['borde_fuerte']} !important;
    }}

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {{
        background-color: {c['superficie']};
        border-bottom: 1px solid {c['borde']};
    }}
    .stTabs [data-baseweb="tab"] {{
        font-family: 'DM Mono', monospace;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: {c['texto_sec']};
    }}
    .stTabs [aria-selected="true"] {{
        color: {c['acento']} !important;
        border-bottom: 2px solid {c['acento']} !important;
        background-color: rgba(46,127,217,0.07) !important;
    }}

    /* Expander */
    [data-testid="stExpander"] {{
        background-color: {c['superficie']};
        border: 1px solid {c['borde']} !important;
        border-radius: 10px !important;
    }}
    [data-testid="stExpander"] summary {{
        font-family: 'DM Mono', monospace;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: {c['texto_sec']};
    }}

    /* Progress bar */
    .stProgress > div > div {{ background-color: {c['acento']} !important; }}
    .stProgress > div {{ background-color: {c['superficie_alt']} !important; }}

    /* Caption */
    .stCaption {{
        font-family: 'DM Mono', monospace !important;
        font-size: 0.68rem !important;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: {c['texto_sec']} !important;
    }}

    /* Divider */
    hr {{ border-color: {c['borde']} !important; }}
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)


def plantilla_plotly() -> dict:
    """
    Layout base para figuras Plotly coherente con el tema navy.

    Uso:
        fig = go.Figure()
        fig.add_trace(...)
        fig.update_layout(**plantilla_plotly())
    """
    c = COLORES
    axis = dict(
        gridcolor="rgba(46,127,217,0.10)",
        linecolor="rgba(46,127,217,0.20)",
        tickcolor="rgba(46,127,217,0.20)",
        tickfont=dict(family="'DM Mono', monospace", color=c["texto_sec"], size=10),
        title_font=dict(family="'DM Mono', monospace", color=c["texto_sec"], size=10),
        showgrid=True,
        zeroline=False,
    )
    return dict(
        paper_bgcolor=c["superficie"],
        plot_bgcolor=c["superficie"],
        font=dict(family="'DM Sans', sans-serif", color=c["texto"], size=12),
        xaxis=axis,
        yaxis=axis,
        legend=dict(
            bgcolor=c["superficie_alt"],
            bordercolor=c["borde_fuerte"],
            borderwidth=1,
            font=dict(family="'DM Mono', monospace", color=c["texto_sec"], size=10),
        ),
        margin=dict(l=48, r=24, t=40, b=40),
        colorway=[
            c["acento"], c["ganancia"], c["perdida"],
            c["acento_aqua"], c["oro"], "#A855F7", "#F59E0B",
        ],
        hoverlabel=dict(
            bgcolor=c["superficie_alt"],
            bordercolor=c["borde_fuerte"],
            font=dict(family="'DM Sans', sans-serif", color=c["texto"], size=12),
        ),
    )
