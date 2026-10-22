from io import BytesIO
import unittest
from openpyxl import load_workbook
from test_structure import spreadsheet
from test_business_rules import generate
from python.bridge import report_frame


class PopupEditsTests(unittest.TestCase):
    def test_explicit_decisions_cover_unchanged_blank_and_original_only_cells(self):
        first = spreadsheet(['ID', 'Same', 'Blank', 'Only'], [[1, 'igual', 'preservado', 'original']])
        second = spreadsheet(['ID', 'Same', 'Blank'], [[1, 'igual', None]])
        records = [
            {'Índice/Linha': 2, 'Nome da Coluna': 'Same', 'Valor no Arquivo 1': 'igual',
             'Valor no Arquivo 2': 'igual', 'Decisão': 'Valor personalizado', 'Valor personalizado': '=literal'},
            {'Índice/Linha': 2, 'Nome da Coluna': 'Blank', 'Valor no Arquivo 1': 'preservado',
             'Valor no Arquivo 2': None, 'Decisão': 'Usar Arquivo 2'},
            {'Índice/Linha': 2, 'Nome da Coluna': 'Only', 'Valor no Arquivo 1': 'original',
             'Valor no Arquivo 2': None, 'Decisão': 'Valor personalizado', 'Valor personalizado': 'manual'},
        ]
        output, _, _ = generate(first, second, report_frame(records))
        book = load_workbook(BytesIO(output))
        self.assertEqual(book['Dados']['B2'].value, '=literal')
        self.assertEqual(book['Dados']['B2'].data_type, 's')
        self.assertIsNone(book['Dados']['C2'].value)
        self.assertEqual(book['Dados']['D2'].value, 'manual')
        book.close()
