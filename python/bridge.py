"""Ponte JSON Lines entre Electron e a lógica de planilhas em Python."""
import base64
from datetime import date, datetime
from io import BytesIO
import json
import sys
import unicodedata
from pathlib import Path

import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app_corrigido as core

REPORT_COLUMNS = [
    "Índice/Linha",
    "Nome da Coluna",
    "Valor no Arquivo 1",
    "Valor no Arquivo 2",
    "Decisão",
]


def header_id(value):
    """Compare localized report headings regardless of accent or encoding artifacts."""
    decomposed = unicodedata.normalize("NFKD", str(value).casefold())
    return "".join(char for char in decomposed if char.isalnum() and not unicodedata.combining(char))


REPORT_HEADER_IDS = {header_id(column): column for column in REPORT_COLUMNS}


def report_frame(records):
    """Restore a report with the exact column names expected by the core logic."""
    normalized = []
    for record in records:
        row = {}
        for key, value in restore_value(record).items():
            row[REPORT_HEADER_IDS.get(header_id(key), key)] = value
        normalized.append(row)
    frame = pd.DataFrame(normalized, columns=REPORT_COLUMNS)
    if normalized:
        missing = [
            column
            for column in REPORT_COLUMNS
            if any(column not in row for row in normalized)
        ]
        if missing:
            raise ValueError(
                "Relatório recebido sem as colunas obrigatórias: " + ", ".join(missing)
            )
    return frame

def json_value(value):
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return {"__excel_datetime__": value.isoformat(), "date_only": isinstance(value, date) and not isinstance(value, datetime)}
    if hasattr(value, "item"):
        return json_value(value.item())
    if isinstance(value, str):
        return core.sanitizar_texto_excel(value)
    return value


def restore_value(value):
    if isinstance(value, dict) and "__excel_datetime__" in value:
        if value.get("date_only"):
            return date.fromisoformat(value["__excel_datetime__"])
        return datetime.fromisoformat(value["__excel_datetime__"])
    if isinstance(value, dict):
        return {key: restore_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [restore_value(item) for item in value]
    if isinstance(value, str):
        return core.sanitizar_texto_excel(value)
    return value


def dataframe_rows(frame):
    return [
        {str(key): json_value(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def execute(action, data):
    if action == "sheets":
        return core.obter_abas(Path(data["path"]).read_bytes())

    if action == "compare":
        first = Path(data["file1"]).read_bytes()
        second = Path(data["file2"]).read_bytes()
        report, new_rows = core.comparar_dataframes(first, second, data["sheet"])
        return {"report": dataframe_rows(report), "newRows": new_rows}

    if action == "export-differences":
        frame = report_frame(data["report"])
        output = BytesIO()
        frame.to_excel(output, index=False, sheet_name="Diferenças")
        return {"content": base64.b64encode(output.getvalue()).decode("ascii")}

    if action == "export-choices":
        frame = report_frame(data["report"])
        if frame["Decisão"].eq("Pendente").any():
            raise ValueError("Resolva todas as diferenças antes de exportar as escolhas.")
        selected = frame.apply(lambda row: row["Valor no Arquivo 2"] if row["Decisão"] == "Usar Arquivo 2" else row["Valor no Arquivo 1"], axis=1)
        output = BytesIO()
        pd.DataFrame({"Linha": frame["Índice/Linha"], "Coluna": frame["Nome da Coluna"], "Mudanças Aplicadas": selected}).to_excel(output, index=False, sheet_name="Conteúdo escolhido")
        return {"content": base64.b64encode(output.getvalue()).decode("ascii")}

    if action == "generate":
        first = Path(data["file1"]).read_bytes()
        second = Path(data["file2"]).read_bytes()
        report = report_frame(data["report"])
        decisions = report.copy()
        content, changes, rows = core.gerar_arquivo_corrigido(
            first, second, report, decisions, data["sheet"], data["name"],
            incluir_linhas_novas=data["includeNewRows"],
            marcar_alteracoes_laranja=data["orange"],
        )
        return {"content": base64.b64encode(content).decode("ascii"), "changes": changes, "rows": rows}

    raise ValueError(f"Operação desconhecida: {action}")


# Electron writes JSON Lines as UTF-8. Set stdin explicitly as well as the
# output streams: on Windows, stdin may otherwise use the active code page,
# corrupting localized report keys such as "Índice/Linha" and "Decisão".
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


for line in sys.stdin:
    try:
        request = {}
        request = json.loads(line)
        result = execute(request["action"], request)
        response = {"id": request["id"], "ok": True, "result": result}
    except Exception as error:
        response = {"id": request.get("id"), "ok": False, "error": str(error)}
    # ASCII escaping keeps isolated surrogates in source cells from breaking
    # the UTF-8 JSON Lines transport; exports sanitize these values for XLSX.
    sys.stdout.write(json.dumps(response, ensure_ascii=True, default=json_value) + "\n")
    sys.stdout.flush()
