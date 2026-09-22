from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment


# =============================================================
# CONFIGURAÇÃO DOS ARQUIVOS
# =============================================================

# Informe aqui os arquivos que deseja comparar.
#
# ARQUIVO_1 = arquivo ORIGINAL
# ARQUIVO_2 = arquivo MODIFICADO

ARQUIVO_1 = "./pasta-arquivos-excel/All Translations of Defense_IA_20260911.xlsx"
ARQUIVO_2 = "./pasta-arquivos-excel/All Translations of Defense_IA_20260817.xlsx"

# Nome do arquivo que será gerado com as diferenças.
ARQUIVO_RESULTADO = "relatorio_diferencas.xlsx"


# =============================================================
# LEITURA DO EXCEL
# =============================================================

def carregar_excel(caminho: str, sheet_name=0) -> pd.DataFrame:
    """
    Carrega uma planilha Excel em um DataFrame.

    Parâmetros:
        caminho:
            Caminho do arquivo Excel.

        sheet_name:
            Nome ou índice da aba que será lida.
            0 = primeira aba.

    Retorna:
        DataFrame com os dados da planilha.
    """

    arquivo = Path(caminho)

    if not arquivo.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {arquivo}"
        )

    try:
        return pd.read_excel(
            arquivo,
            sheet_name=sheet_name,
            engine="openpyxl"
        )

    except Exception as exc:
        raise ValueError(
            f"Não foi possível ler o arquivo '{arquivo}': {exc}"
        ) from exc


# =============================================================
# NORMALIZAÇÃO
# =============================================================

def normalizar_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normaliza o DataFrame antes da comparação.

    Ajustes:
        - Reseta o índice.
        - Remove espaços dos nomes das colunas.
        - Converte nomes das colunas para string.
        - Considera strings vazias ou contendo somente espaços
          como células vazias.
    """

    resultado = df.copy()

    # Remove o índice original.
    #
    # Dessa forma, a comparação é feita pela posição da linha.
    resultado.reset_index(drop=True, inplace=True)

    # Garante que os nomes das colunas sejam strings
    # e remove espaços extras.
    resultado.columns = [
        str(coluna).strip()
        for coluna in resultado.columns
    ]

    # Strings vazias ou contendo somente espaços
    # são tratadas como células vazias.
    resultado.replace(
        r"^\s*$",
        pd.NA,
        regex=True,
        inplace=True
    )

    return resultado


# =============================================================
# ANÁLISE DA ESTRUTURA
# =============================================================

def analisar_estrutura(
    df1: pd.DataFrame,
    df2: pd.DataFrame
) -> dict:
    """
    Analisa diferenças estruturais entre as duas planilhas.

    Verifica:
        - Quantidade de linhas.
        - Quantidade de colunas.
        - Colunas existentes somente no Arquivo 1.
        - Colunas existentes somente no Arquivo 2.
    """

    colunas_arquivo_1 = pd.Index(df1.columns)
    colunas_arquivo_2 = pd.Index(df2.columns)

    # Colunas que existem somente no Arquivo 1.
    somente_arquivo_1 = colunas_arquivo_1[
        ~colunas_arquivo_1.isin(colunas_arquivo_2)
    ]

    # Colunas que existem somente no Arquivo 2.
    somente_arquivo_2 = colunas_arquivo_2[
        ~colunas_arquivo_2.isin(colunas_arquivo_1)
    ]

    return {
        "linhas_arquivo_1": len(df1),
        "linhas_arquivo_2": len(df2),

        "colunas_arquivo_1": len(df1.columns),
        "colunas_arquivo_2": len(df2.columns),

        "colunas_exclusivas_arquivo_1":
            list(somente_arquivo_1),

        "colunas_exclusivas_arquivo_2":
            list(somente_arquivo_2),

        "linhas_extras_arquivo_1":
            max(0, len(df1) - len(df2)),

        "linhas_extras_arquivo_2":
            max(0, len(df2) - len(df1)),
    }


# =============================================================
# EXIBIÇÃO DA ESTRUTURA
# =============================================================

def imprimir_resumo_estrutura(
    estrutura: dict
) -> None:
    """
    Mostra no console um resumo da estrutura dos arquivos.
    """

    print("\n" + "=" * 70)
    print("ANÁLISE DA ESTRUTURA")
    print("=" * 70)

    print(
        f"Arquivo 1: "
        f"{estrutura['linhas_arquivo_1']} linhas x "
        f"{estrutura['colunas_arquivo_1']} colunas"
    )

    print(
        f"Arquivo 2: "
        f"{estrutura['linhas_arquivo_2']} linhas x "
        f"{estrutura['colunas_arquivo_2']} colunas"
    )

    # ---------------------------------------------------------
    # Diferenças de quantidade de linhas
    # ---------------------------------------------------------

    if estrutura["linhas_arquivo_1"] != estrutura["linhas_arquivo_2"]:

        print(
            "\n[ALERTA] Os arquivos possuem quantidades "
            "diferentes de linhas."
        )

        if estrutura["linhas_extras_arquivo_1"] > 0:
            print(
                f" - Arquivo 1 possui "
                f"{estrutura['linhas_extras_arquivo_1']} "
                f"linha(s) a mais."
            )

        if estrutura["linhas_extras_arquivo_2"] > 0:
            print(
                f" - Arquivo 2 possui "
                f"{estrutura['linhas_extras_arquivo_2']} "
                f"linha(s) a mais."
            )

    # ---------------------------------------------------------
    # Diferenças de quantidade de colunas
    # ---------------------------------------------------------

    if estrutura["colunas_arquivo_1"] != estrutura["colunas_arquivo_2"]:

        print(
            "\n[ALERTA] Os arquivos possuem quantidades "
            "diferentes de colunas."
        )

    # ---------------------------------------------------------
    # Colunas exclusivas
    # ---------------------------------------------------------

    if estrutura["colunas_exclusivas_arquivo_1"]:

        print(
            "\nColunas existentes somente no Arquivo 1:"
        )

        for coluna in estrutura["colunas_exclusivas_arquivo_1"]:
            print(f" - {coluna}")

    if estrutura["colunas_exclusivas_arquivo_2"]:

        print(
            "\nColunas existentes somente no Arquivo 2:"
        )

        for coluna in estrutura["colunas_exclusivas_arquivo_2"]:
            print(f" - {coluna}")

    # ---------------------------------------------------------
    # Estrutura equivalente
    # ---------------------------------------------------------

    estrutura_igual = (
        estrutura["linhas_arquivo_1"]
        == estrutura["linhas_arquivo_2"]
        and
        estrutura["colunas_arquivo_1"]
        == estrutura["colunas_arquivo_2"]
        and
        not estrutura["colunas_exclusivas_arquivo_1"]
        and
        not estrutura["colunas_exclusivas_arquivo_2"]
    )

    if estrutura_igual:
        print(
            "\n[OK] A estrutura dos arquivos é equivalente."
        )

    print("=" * 70)


# =============================================================
# COMPARAÇÃO DOS DATAFRAMES
# =============================================================

def comparar_dataframes(
    df1: pd.DataFrame,
    df2: pd.DataFrame
) -> pd.DataFrame:
    """
    Compara dois DataFrames célula a célula utilizando operações
    vetorizadas do pandas.

    Retorna um DataFrame contendo:

        Índice/Linha
        Nome da Coluna
        Valor no Arquivo 1
        Valor no Arquivo 2
    """

    # ---------------------------------------------------------
    # Quantidade máxima de linhas.
    #
    # Caso um arquivo tenha mais linhas, elas também serão
    # consideradas na comparação.
    # ---------------------------------------------------------

    quantidade_linhas = max(
        len(df1),
        len(df2)
    )

    indices = pd.RangeIndex(
        start=0,
        stop=quantidade_linhas
    )

    # ---------------------------------------------------------
    # União das colunas dos dois arquivos.
    #
    # Assim, uma coluna que exista somente em um arquivo
    # também será analisada.
    # ---------------------------------------------------------

    todas_colunas = df1.columns.union(
        df2.columns,
        sort=False
    )

    # ---------------------------------------------------------
    # ALINHAMENTO
    # ---------------------------------------------------------

    alinhado_1 = df1.reindex(
        index=indices,
        columns=todas_colunas
    )

    alinhado_2 = df2.reindex(
        index=indices,
        columns=todas_colunas
    )

    # ---------------------------------------------------------
    # COMPARAÇÃO VETORIZADA
    #
    # O pandas identifica as células diferentes sem precisar
    # executar um loop Python para cada célula.
    #
    # keep_shape=False:
    #   retorna somente posições com diferença.
    #
    # keep_equal=False:
    #   elimina valores iguais do resultado.
    # ---------------------------------------------------------

    diferencas = alinhado_1.compare(
        alinhado_2,
        keep_shape=False,
        keep_equal=False
    )

    # ---------------------------------------------------------
    # Nenhuma diferença encontrada.
    # ---------------------------------------------------------

    if diferencas.empty:

        return pd.DataFrame(
            columns=[
                "Índice/Linha",
                "Nome da Coluna",
                "Valor no Arquivo 1",
                "Valor no Arquivo 2",
            ]
        )

    # ---------------------------------------------------------
    # CONVERSÃO DO RESULTADO DO compare()
    #
    # IMPORTANTE:
    # Para compatibilidade com pandas 3.x, não utilizamos:
    #
    #     dropna=True
    #
    # dentro do stack().
    # ---------------------------------------------------------

    resultado = diferencas.stack(
        level=0
    )

    resultado = resultado.reset_index()

    # ---------------------------------------------------------
    # Ajuste dos nomes das colunas.
    # ---------------------------------------------------------

    resultado.rename(
        columns={
            "level_0": "linha_dataframe",
            "level_1": "Nome da Coluna",
            "self": "Valor no Arquivo 1",
            "other": "Valor no Arquivo 2",
        },
        inplace=True
    )

    # Algumas versões do pandas podem utilizar "index"
    # como nome do primeiro nível.
    if "linha_dataframe" not in resultado.columns:

        if "index" in resultado.columns:

            resultado.rename(
                columns={
                    "index": "linha_dataframe"
                },
                inplace=True
            )

    # ---------------------------------------------------------
    # CONVERSÃO PARA LINHA REAL DO EXCEL
    #
    # O pandas começa o índice em 0:
    #
    # índice 0 -> linha 2 do Excel
    # índice 1 -> linha 3 do Excel
    #
    # Isso ocorre porque a linha 1 é o cabeçalho.
    # ---------------------------------------------------------

    resultado["Índice/Linha"] = (
        resultado["linha_dataframe"] + 2
    )

    resultado.drop(
        columns=["linha_dataframe"],
        inplace=True
    )

    # ---------------------------------------------------------
    # Ordenação
    # ---------------------------------------------------------

    resultado.sort_values(
        by=[
            "Índice/Linha",
            "Nome da Coluna"
        ],
        inplace=True
    )

    resultado.reset_index(
        drop=True,
        inplace=True
    )

    # ---------------------------------------------------------
    # Ordem final das colunas.
    # ---------------------------------------------------------

    resultado = resultado[
        [
            "Índice/Linha",
            "Nome da Coluna",
            "Valor no Arquivo 1",
            "Valor no Arquivo 2",
        ]
    ]

    return resultado


# =============================================================
# EXPORTAÇÃO DO RELATÓRIO
# =============================================================

def exportar_relatorio(
    relatorio: pd.DataFrame,
    caminho_saida: str
) -> None:
    """
    Exporta as diferenças para um novo arquivo Excel.

    Também aplica uma formatação básica:
        - Cabeçalho destacado.
        - Filtro.
        - Cabeçalho congelado.
        - Largura das colunas ajustada.
    """

    relatorio_exportacao = relatorio.copy()

    # Converte valores ausentes para células realmente vazias.
    for coluna in [
        "Valor no Arquivo 1",
        "Valor no Arquivo 2"
    ]:

        relatorio_exportacao[coluna] = (
            relatorio_exportacao[coluna]
            .where(
                pd.notna(
                    relatorio_exportacao[coluna]
                ),
                ""
            )
        )

    # Exporta para Excel.
    relatorio_exportacao.to_excel(
        caminho_saida,
        index=False,
        sheet_name="Diferenças"
    )

    # ---------------------------------------------------------
    # FORMATAÇÃO COM OPENPYXL
    # ---------------------------------------------------------

    workbook = load_workbook(
        caminho_saida
    )

    worksheet = workbook["Diferenças"]

    # ---------------------------------------------------------
    # Formatação do cabeçalho
    # ---------------------------------------------------------

    for cell in worksheet[1]:

        cell.font = Font(
            bold=True,
            color="FFFFFF"
        )

        cell.fill = PatternFill(
            fill_type="solid",
            fgColor="1F4E78"
        )

        cell.alignment = Alignment(
            horizontal="center",
            vertical="center"
        )

    # ---------------------------------------------------------
    # Largura das colunas
    # ---------------------------------------------------------

    larguras = {
        "A": 15,
        "B": 30,
        "C": 30,
        "D": 30,
    }

    for coluna, largura in larguras.items():

        worksheet.column_dimensions[
            coluna
        ].width = largura

    # ---------------------------------------------------------
    # Congela o cabeçalho
    # ---------------------------------------------------------

    worksheet.freeze_panes = "A2"

    # ---------------------------------------------------------
    # Filtro automático
    # ---------------------------------------------------------

    worksheet.auto_filter.ref = (
        worksheet.dimensions
    )

    # Salva o arquivo final.
    workbook.save(
        caminho_saida
    )


# =============================================================
# FUNÇÃO PRINCIPAL
# =============================================================

def comparar_planilhas(
    caminho_arquivo_1: str,
    caminho_arquivo_2: str,
    caminho_saida: str,
    sheet_name=0
) -> pd.DataFrame:
    """
    Função principal responsável por executar toda a auditoria.

    Etapas:
        1. Carregar os arquivos.
        2. Normalizar os DataFrames.
        3. Analisar a estrutura.
        4. Comparar os dados.
        5. Exibir diferenças no console.
        6. Gerar o relatório Excel.

    Retorna:
        DataFrame contendo as diferenças encontradas.
    """

    print("=" * 70)
    print("AUDITORIA DE PLANILHAS EXCEL")
    print("=" * 70)

    # ---------------------------------------------------------
    # Carregamento
    # ---------------------------------------------------------

    print("\nCarregando Arquivo 1...")

    df1 = carregar_excel(
        caminho_arquivo_1,
        sheet_name=sheet_name
    )

    print("Carregando Arquivo 2...")

    df2 = carregar_excel(
        caminho_arquivo_2,
        sheet_name=sheet_name
    )

    print("Arquivos carregados com sucesso.")

    # ---------------------------------------------------------
    # Normalização
    # ---------------------------------------------------------

    df1 = normalizar_dataframe(df1)
    df2 = normalizar_dataframe(df2)

    # ---------------------------------------------------------
    # Análise estrutural
    # ---------------------------------------------------------

    estrutura = analisar_estrutura(
        df1,
        df2
    )

    imprimir_resumo_estrutura(
        estrutura
    )

    # ---------------------------------------------------------
    # Comparação
    # ---------------------------------------------------------

    print("\nComparando os dados...")

    relatorio = comparar_dataframes(
        df1,
        df2
    )

    # ---------------------------------------------------------
    # Exibição do resultado
    # ---------------------------------------------------------

    print("\n" + "=" * 70)
    print("RESULTADO DA COMPARAÇÃO")
    print("=" * 70)

    if relatorio.empty:

        print(
            "\n[OK] Nenhuma diferença encontrada."
        )

    else:

        print(
            f"\n[ALERTA] "
            f"{len(relatorio)} diferença(s) encontrada(s).\n"
        )

        print(
            relatorio.to_string(
                index=False
            )
        )

    # ---------------------------------------------------------
    # Exportação
    # ---------------------------------------------------------

    exportar_relatorio(
        relatorio,
        caminho_saida
    )

    print(
        f"\nRelatório salvo em:"
    )

    print(
        Path(caminho_saida).resolve()
    )

    print("=" * 70)

    return relatorio


# =============================================================
# EXECUÇÃO DO PROGRAMA
# =============================================================

if __name__ == "__main__":

    try:

        comparar_planilhas(
            caminho_arquivo_1=ARQUIVO_1,
            caminho_arquivo_2=ARQUIVO_2,
            caminho_saida=ARQUIVO_RESULTADO,
            sheet_name=0
        )

    except FileNotFoundError as erro:

        print(
            f"\n[ERRO] {erro}"
        )

    except ValueError as erro:

        print(
            f"\n[ERRO] {erro}"
        )

    except Exception as erro:

        print(
            "\n[ERRO INESPERADO]"
        )

        print(
            f"{type(erro).__name__}: {erro}"
        )
