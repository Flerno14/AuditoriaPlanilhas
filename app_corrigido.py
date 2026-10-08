"""Lógica de comparação e geração de arquivos da Auditoria de Planilhas."""
from io import BytesIO
from pathlib import Path
import hashlib

import numpy as np
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import PatternFill


def sanitizar_texto_excel(texto: str) -> str:
    """Substitui apenas caracteres proibidos em XML/Excel.

    Barras, acentos e demais caracteres especiais válidos são preservados.
    """
    def permitido_xml(caractere: str) -> bool:
        codigo = ord(caractere)
        return (
            codigo in (0x09, 0x0A, 0x0D)
            or 0x20 <= codigo <= 0xD7FF
            or 0xE000 <= codigo <= 0xFFFD
            or 0x10000 <= codigo <= 0x10FFFF
        ) and codigo not in (0xFFFE, 0xFFFF)

    return "".join(c if permitido_xml(c) else "\uFFFD" for c in texto)


# ============================================================
# FUNÇÕES DE LEITURA
# ============================================================

def obter_abas(arquivo_bytes: bytes) -> list[str]:
    """Obtém os nomes das abas existentes em um arquivo Excel."""

    workbook = load_workbook(
        BytesIO(arquivo_bytes),
        read_only=True,
        data_only=False,
    )

    try:
        return workbook.sheetnames
    finally:
        workbook.close()


def carregar_excel(
    arquivo_bytes: bytes,
    sheet_name: str,
) -> pd.DataFrame:
    """Lê uma aba do Excel utilizando pandas."""

    return pd.read_excel(
        BytesIO(arquivo_bytes),
        sheet_name=sheet_name,
        engine="openpyxl",
        # A planilha corrigida pode conter texto e números na mesma coluna.
        # Preservar object evita a conversão de uma coluna mista para string
        # via PyArrow ("Expected bytes, got a 'int' object").
        dtype=object,
    )


# ============================================================
# NORMALIZAÇÃO
# ============================================================

def normalizar_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normaliza o DataFrame antes da comparação.

    - Reseta o índice.
    - Remove espaços dos nomes das colunas.
    - Converte nomes de colunas para string.
    - Trata strings vazias como células vazias.
    """

    resultado = df.copy()

    resultado.reset_index(drop=True, inplace=True)

    resultado.columns = [
        str(coluna).strip()
        for coluna in resultado.columns
    ]

    resultado.replace(
        r"^\s*$",
        np.nan,
        regex=True,
        inplace=True,
    )

    return resultado


# ============================================================
# VALIDAÇÃO DAS COLUNAS
# ============================================================

def validar_colunas(
    df1: pd.DataFrame,
    df2: pd.DataFrame,
) -> None:
    """Garante que os nomes das colunas não sejam duplicados."""

    duplicadas_1 = df1.columns[df1.columns.duplicated()].tolist()
    duplicadas_2 = df2.columns[df2.columns.duplicated()].tolist()

    if duplicadas_1:
        raise ValueError(
            "O Arquivo 1 possui colunas duplicadas: "
            + ", ".join(map(str, duplicadas_1))
        )

    if duplicadas_2:
        raise ValueError(
            "O Arquivo 2 possui colunas duplicadas: "
            + ", ".join(map(str, duplicadas_2))
        )


# ============================================================
# COMPARAÇÃO
# ============================================================

def comparar_dataframes(
    arquivo_1_bytes: bytes,
    arquivo_2_bytes: bytes,
    sheet_name: str,
) -> tuple[pd.DataFrame, int]:
    """
    Compara os dois arquivos de forma vetorizada.

    Regras:
    - Diferenças em linhas presentes nos dois arquivos aparecem na interface,
      exceto quando o valor do Arquivo 2 está vazio: nesse caso, mantemos o
      valor do Arquivo 1 automaticamente.
    - Linhas que existem somente no Arquivo 1 são mantidas automaticamente
      e não aparecem na interface.
    - Linhas que existem somente no Arquivo 2 NÃO aparecem na interface.
    - As linhas exclusivas do Arquivo 2 são tratadas automaticamente como
      "Usar Arquivo 2" e serão adicionadas ao arquivo corrigido.

    Retorna:
        relatório de diferenças entre as linhas existentes no Arquivo 1
        quantidade de linhas novas existentes somente no Arquivo 2
    """

    df1 = normalizar_dataframe(
        carregar_excel(arquivo_1_bytes, sheet_name)
    )

    df2 = normalizar_dataframe(
        carregar_excel(arquivo_2_bytes, sheet_name)
    )

    validar_colunas(df1, df2)

    quantidade_linhas_arquivo_1 = len(df1)
    quantidade_linhas_arquivo_2 = len(df2)

    quantidade_linhas_novas = max(
        0,
        quantidade_linhas_arquivo_2 - quantidade_linhas_arquivo_1,
    )

    # Mantemos a comparação do tamanho máximo para continuar detectando
    # também linhas que existam somente no Arquivo 1 (possíveis remoções).
    quantidade_linhas = max(
        quantidade_linhas_arquivo_1,
        quantidade_linhas_arquivo_2,
    )

    indices = pd.RangeIndex(
        start=0,
        stop=quantidade_linhas,
    )

    todas_colunas = df1.columns.union(
        df2.columns,
        sort=False,
    )

    alinhado_1 = df1.reindex(
        index=indices,
        columns=todas_colunas,
    )

    alinhado_2 = df2.reindex(
        index=indices,
        columns=todas_colunas,
    )

    # Materialize comparison results as ordinary booleans before combining
    # masks; nullable pandas booleans can carry pd.NA into boolean operators.
    iguais = alinhado_1.eq(alinhado_2).fillna(False)

    ambos_vazios = (
        alinhado_1.isna()
        & alinhado_2.isna()
    )

    # Um valor vazio no Arquivo 2 significa manter o valor original. Isso
    # também cobre linhas inteiras que existem apenas no Arquivo 1.
    manter_arquivo_1 = alinhado_1.notna() & alinhado_2.isna()
    diferenca = ~(iguais | ambos_vazios | manter_arquivo_1)
    # Comparações de colunas ``object`` podem produzir pd.NA. NumPy não
    # consegue decidir o valor booleano de pd.NA, portanto a máscara precisa
    # ser materializada explicitamente como bool antes de usar np.where.
    mascara_diferencas = diferenca.to_numpy(dtype=bool, na_value=True)

    linhas, colunas = np.where(mascara_diferencas)

    # Linhas exclusivas de qualquer arquivo não são listadas: as do Arquivo 2
    # são adicionadas automaticamente, e as do Arquivo 1 ficam preservadas.
    quantidade_linhas_compartilhadas = min(
        quantidade_linhas_arquivo_1,
        quantidade_linhas_arquivo_2,
    )
    somente_linhas_compartilhadas = linhas < quantidade_linhas_compartilhadas

    linhas = linhas[somente_linhas_compartilhadas]
    colunas = colunas[somente_linhas_compartilhadas]

    if len(linhas) == 0:
        return (
            pd.DataFrame(
                columns=[
                    "Índice/Linha",
                    "Nome da Coluna",
                    "Valor no Arquivo 1",
                    "Valor no Arquivo 2",
                    "Decisão",
                ]
            ),
            quantidade_linhas_novas,
        )

    relatorio = pd.DataFrame(
        {
            "Índice/Linha": linhas + 2,
            "Nome da Coluna": todas_colunas.to_numpy()[colunas],
            "Valor no Arquivo 1": alinhado_1.to_numpy()[
                linhas, colunas
            ],
            "Valor no Arquivo 2": alinhado_2.to_numpy()[
                linhas, colunas
            ],
            "Decisão": "Pendente",
        }
    )

    return relatorio, quantidade_linhas_novas


# ============================================================
# CONVERSÃO DE VALORES
# ============================================================

def normalizar_valor_excel(valor):
    """Converte valores pandas para valores aceitos pelo openpyxl."""

    if valor is None or valor is pd.NA:
        return None

    try:
        # pd.isna(pd.NA) returns pd.NA, whose boolean value is ambiguous.
        # Only scalar boolean results identify an empty Excel cell here.
        ausente = pd.isna(valor)
        if not hasattr(ausente, "__len__") and bool(ausente):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(valor, pd.Timestamp):
        return valor.to_pydatetime()

    if isinstance(valor, np.generic):
        valor = valor.item()

    if isinstance(valor, str):
        return sanitizar_texto_excel(valor)

    return valor


# ============================================================
# GERAÇÃO DO ARQUIVO CORRIGIDO
# ============================================================

def copiar_estilo_linha(worksheet, linha_origem: int, linha_destino: int) -> None:
    """Copia a formatação da última linha de dados para uma nova linha."""

    from copy import copy

    if linha_origem < 1 or linha_origem > worksheet.max_row:
        return

    for coluna in range(1, worksheet.max_column + 1):
        origem = worksheet.cell(
            row=linha_origem,
            column=coluna,
        )
        destino = worksheet.cell(
            row=linha_destino,
            column=coluna,
        )

        if origem.has_style:
            destino._style = copy(origem._style)
        if origem.number_format:
            destino.number_format = origem.number_format
        if origem.alignment:
            destino.alignment = copy(origem.alignment)
        if origem.protection:
            destino.protection = copy(origem.protection)


def gerar_arquivo_corrigido(
    arquivo_1_bytes: bytes,
    arquivo_2_bytes: bytes,
    relatorio_original: pd.DataFrame,
    decisoes: pd.DataFrame,
    sheet_name: str,
    nome_arquivo_original: str,
    incluir_linhas_novas: bool = True,
    marcar_alteracoes_laranja: bool = False,
) -> tuple[bytes, int, int]:
    """
    Cria uma cópia do Arquivo 1, aplica as decisões do usuário e
    adiciona automaticamente ao final as linhas que existem somente
    no Arquivo 2, quando incluir_linhas_novas for True.

    Retorna:
        bytes do arquivo corrigido
        quantidade de células alteradas por decisão do usuário
        quantidade de linhas novas adicionadas automaticamente
    """

    extensao = Path(nome_arquivo_original).suffix.lower()

    parametros = {"data_only": False}

    if extensao == ".xlsm":
        parametros["keep_vba"] = True

    workbook = load_workbook(
        BytesIO(arquivo_1_bytes),
        **parametros,
    )

    try:
        if sheet_name not in workbook.sheetnames:
            raise ValueError(
                f"A aba '{sheet_name}' não existe no Arquivo 1."
            )

        worksheet = workbook[sheet_name]

        # DataFrames normalizados usados para descobrir o tamanho real
        # das áreas de dados e os valores das linhas novas.
        df_original = normalizar_dataframe(
            carregar_excel(arquivo_1_bytes, sheet_name)
        )

        df_modificado = normalizar_dataframe(
            carregar_excel(arquivo_2_bytes, sheet_name)
        )

        mapa_colunas = {
            str(nome): indice + 1
            for indice, nome in enumerate(df_original.columns)
        }

        # Valores do Arquivo 2 para cada diferença encontrada.
        valores_arquivo_2 = {}

        for _, linha in relatorio_original.iterrows():
            chave = (
                int(linha["Índice/Linha"]),
                str(linha["Nome da Coluna"]),
            )
            valores_arquivo_2[chave] = linha["Valor no Arquivo 2"]

        quantidade_alteracoes = 0

        # --------------------------------------------------------
        # APLICA AS DECISÕES DA INTERFACE
        # --------------------------------------------------------

        for _, decisao in decisoes.iterrows():
            escolha = decisao["Decisão"]

            if escolha != "Usar Arquivo 2":
                continue

            linha_excel = int(decisao["Índice/Linha"])
            nome_coluna = str(decisao["Nome da Coluna"])

            if nome_coluna not in mapa_colunas:
                raise ValueError(
                    f"A coluna '{nome_coluna}' existe no Arquivo 2, "
                    "mas não existe no Arquivo 1. "
                    "Não é possível substituir essa célula."
                )

            chave = (linha_excel, nome_coluna)

            if chave not in valores_arquivo_2:
                raise ValueError(
                    "Não foi possível localizar o valor do Arquivo 2 "
                    f"para a célula {nome_coluna} / linha {linha_excel}."
                )

            novo_valor = normalizar_valor_excel(
                valores_arquivo_2[chave]
            )

            celula = worksheet.cell(
                row=linha_excel,
                column=mapa_colunas[nome_coluna],
            )
            valor_anterior = normalizar_valor_excel(celula.value)
            celula.value = novo_valor

            if marcar_alteracoes_laranja and valor_anterior != novo_valor:
                celula.fill = PatternFill(
                    fill_type="solid",
                    fgColor="FFFFA500",
                )

            quantidade_alteracoes += 1

        # --------------------------------------------------------
        # ADICIONA AUTOMATICAMENTE AS LINHAS NOVAS DO ARQUIVO 2
        # --------------------------------------------------------

        quantidade_linhas_arquivo_1 = len(df_original)
        quantidade_linhas_arquivo_2 = len(df_modificado)

        quantidade_linhas_novas = max(
            0,
            quantidade_linhas_arquivo_2 - quantidade_linhas_arquivo_1,
        )

        if incluir_linhas_novas and quantidade_linhas_novas > 0:

            # Os dados começam na linha 2, pois a linha 1 é o cabeçalho.
            primeira_linha_nova = quantidade_linhas_arquivo_1 + 2

            # Preserva a formatação da última linha existente sempre que
            # possível.
            ultima_linha_existente = quantidade_linhas_arquivo_1 + 1

            for deslocamento, indice_df2 in enumerate(
                range(quantidade_linhas_arquivo_1, quantidade_linhas_arquivo_2)
            ):

                linha_excel = primeira_linha_nova + deslocamento

                copiar_estilo_linha(
                    worksheet,
                    ultima_linha_existente,
                    linha_excel,
                )

                # Grava somente as colunas que já existem no Arquivo 1,
                # preservando a estrutura do arquivo original.
                for nome_coluna, coluna_excel in mapa_colunas.items():

                    if nome_coluna not in df_modificado.columns:
                        continue

                    valor = df_modificado.iloc[
                        indice_df2
                    ][nome_coluna]

                    worksheet.cell(
                        row=linha_excel,
                        column=coluna_excel,
                    ).value = normalizar_valor_excel(valor)

        if not incluir_linhas_novas:
            quantidade_linhas_novas = 0

        saida = BytesIO()
        workbook.save(saida)
        saida.seek(0)

        return (
            saida.getvalue(),
            quantidade_alteracoes,
            quantidade_linhas_novas,
        )

    finally:
        workbook.close()


# ============================================================
# IDENTIFICADOR DA COMPARAÇÃO
# ============================================================

def gerar_id_comparacao(
    arquivo_1_bytes: bytes,
    arquivo_2_bytes: bytes,
    sheet_name: str,
) -> str:
    """Gera um identificador estável para a comparação atual."""

    conteudo = (
        arquivo_1_bytes
        + arquivo_2_bytes
        + sheet_name.encode("utf-8")
    )

    return hashlib.md5(conteudo).hexdigest()


