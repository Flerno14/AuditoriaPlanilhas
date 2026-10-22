"""Read-only translation audit; optional local model, never downloads weights."""
import base64
import hashlib
from contextlib import redirect_stdout
from io import BytesIO
from pathlib import Path
import sys

import pandas as pd
from openpyxl import Workbook
import app_corrigido as core

_model = None
_model_path = None
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'


def read_sheet(data):
    raw = Path(data['path']).read_bytes()
    fingerprint = hashlib.sha256(raw).hexdigest()
    if data.get('fingerprint') and data['fingerprint'] != fingerprint:
        raise ValueError('A planilha mudou desde a análise. Selecione novamente o arquivo.')
    frame = core.normalizar_dataframe(core.carregar_excel(raw, data['sheet'], 'arquivo de tradução'))
    return frame, fingerprint


def cell_text(value):
    if value is None or value is pd.NA or pd.isna(value):
        return ''
    return str(value)


def execute(action, data):
    if action == 'translation-columns':
        frame, fingerprint = read_sheet(data)
        return {'columns': list(frame.columns), 'fingerprint': fingerprint}
    if action == 'translation-read':
        frame, fingerprint = read_sheet(data)
        source, target = data['source'], data['target']
        identifier = data.get('identifier')
        if source == target or any(column not in frame.columns for column in [source, target]):
            raise ValueError('Selecione duas colunas diferentes para inglês e português.')
        if identifier and identifier not in frame.columns:
            raise ValueError('A coluna de identificação não existe.')
        rows = [{'line': i + 2, 'identifier': cell_text(row[identifier]) if identifier else '',
                 'source': cell_text(row[source]), 'target': cell_text(row[target])}
                for i, row in enumerate(frame.to_dict('records'))]
        return {'rows': rows, 'fingerprint': fingerprint}
    if action == 'translation-semantic':
        return semantic(data)
    if action == 'translation-export':
        book = Workbook()
        sheet = book.active
        sheet.title = 'Auditoria de tradução'
        sheet.append(['Linha', 'Identificação', 'Inglês', 'Português', 'Similaridade (cosseno)',
                      'Prioridade', 'Alertas', 'Revisão', 'Modelo'])
        for row in data['rows']:
            sheet.append([row['line'], row['identifier'], row['source'], row['target'], row.get('score'),
                          row['priority'], '\n'.join(row['issues']), row['review'], data.get('model', 'Sem análise semântica')])
            for cell in sheet[sheet.max_row]:
                if isinstance(cell.value, str):
                    cell.value = core.sanitizar_texto_excel(cell.value)
                    cell.data_type = 's'
        sheet.freeze_panes = 'A2'
        sheet.auto_filter.ref = sheet.dimensions
        output = BytesIO()
        book.save(output)
        book.close()
        return {'content': base64.b64encode(output.getvalue()).decode('ascii')}
    raise ValueError('Operação de auditoria desconhecida.')


def semantic(data):
    global _model, _model_path
    rows = data['rows']
    if not isinstance(rows, list) or len(rows) > 64:
        raise ValueError('A análise semântica aceita até 64 pares por lote.')
    model_path = Path(data.get('modelPath', ''))
    if not model_path.is_dir() or not (model_path / 'modules.json').is_file():
        raise ValueError('Selecione uma pasta local do modelo Sentence Transformers (com modules.json).')
    # Libraries can print initialization messages; stdout belongs to JSON Lines.
    with redirect_stdout(sys.stderr):
        if _model is None or _model_path != str(model_path.resolve()):
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as error:
                raise ValueError('Análise semântica indisponível: instale requirements-translation.txt no Python usado pelo aplicativo.') from error
            _model = SentenceTransformer(str(model_path.resolve()), local_files_only=True, trust_remote_code=False, device='cpu')
            _model_path = str(model_path.resolve())
        result = [{'score': None, 'semanticIssue': ''} for _ in rows]
        texts, indices = [], []
        for index, row in enumerate(rows):
            a, b = row['source'], row['target']
            if not a.strip() or not b.strip():
                continue
            if any(len(_model.tokenizer.encode(text, truncation=False)) > _model.max_seq_length for text in (a, b)):
                result[index]['semanticIssue'] = 'Texto acima do limite do modelo: proximidade não calculada; revise o conteúdo completo.'
                continue
            indices.append(index)
            texts.extend([a, b])
        if texts:
            vectors = _model.encode(texts, batch_size=16, normalize_embeddings=True, show_progress_bar=False)
            for offset, index in enumerate(indices):
                result[index]['score'] = float(vectors[2 * offset] @ vectors[2 * offset + 1])
        return result
