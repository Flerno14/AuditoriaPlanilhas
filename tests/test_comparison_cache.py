from datetime import datetime
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZIP_STORED

from python import bridge
from test_structure import spreadsheet


class ComparisonCacheTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        bridge._comparison_cache.clear()
        self.addCleanup(bridge._comparison_cache.clear)
        self.first = Path(self.folder.name) / 'first.xlsx'
        self.second = Path(self.folder.name) / 'second.xlsx'
        self.first.write_bytes(spreadsheet(['ID', 'Nome', 'Data', 'Nota'],
            [['x', 'Original', datetime(2026, 10, 20), 'Contexto'], ['x', 'Segundo', None, None]]))
        self.second.write_bytes(spreadsheet(['ID', 'Data', 'Nome'],
            [['x', datetime(2026, 10, 21), 'Primeiro'], ['x', None, 'Novo segundo'], ['z', None, 'Nova']]))
        self.context = dict(file1=str(self.first), file2=str(self.second), sheet='Dados',
                            alignByFirstColumn=True, validateUniqueFirstColumn=False)

    def compare(self, **rules):
        self.context.update(rules)
        result = bridge.execute('compare', self.context)
        self.context['fingerprint'] = result['fingerprint']
        return result

    def details(self, line=2, **rules):
        return bridge.execute('row-details', dict(self.context, line=line, **rules))

    def test_comparison_warms_cache_and_details_preserve_types_and_repeated_keys(self):
        with patch.object(bridge.core, 'carregar_excel', wraps=bridge.core.carregar_excel) as read:
            self.compare()
            first = self.details()
            second = self.details(3)
            preview = bridge.execute('preview-new-rows', self.context)
            self.assertEqual(read.call_count, 2)
        self.assertEqual(first['columns'], ['ID', 'Nome', 'Data', 'Nota'])
        self.assertEqual(first['values2'][1], 'Primeiro')
        self.assertEqual(first['values1'][2]['__excel_datetime__'], '2026-10-20T00:00:00')
        self.assertEqual(first['missingColumns2'], ['Nota'])
        self.assertEqual(second['values2'], ['x', 'Novo segundo', None, None])
        self.assertEqual(second['line2'], 3)
        self.assertEqual(preview['rows'][0]['values'], ['z', 'Nova', None, None])
        first['values1'][1] = 'Não deve alterar o cache'
        self.assertEqual(self.details()['values1'][1], 'Original')

    def test_cold_cache_after_restart_or_resume_is_built_on_demand(self):
        self.compare()
        bridge._comparison_cache.clear()
        with patch.object(bridge.core, 'carregar_excel', wraps=bridge.core.carregar_excel) as read:
            bridge.execute('validate-session', self.context)
            self.assertEqual(read.call_count, 0)
            self.details()
            self.details(3)
            self.assertEqual(read.call_count, 2)

    def test_memory_limit_bypasses_storage_without_changing_results(self):
        self.compare()
        expected = self.details()
        with patch.object(bridge, 'COMPARISON_CACHE_MAX_BYTES', 1):
            with patch.object(bridge.core, 'carregar_excel', wraps=bridge.core.carregar_excel) as read:
                self.compare()
                self.assertFalse(bridge._comparison_cache)
                self.assertEqual(self.details(), expected)
                self.assertEqual(self.details(), expected)
                self.assertEqual(read.call_count, 6)

    def test_only_one_pair_is_retained_and_different_paths_replace_it(self):
        self.compare()
        original = dict(self.context)
        alternate = Path(self.folder.name) / 'copy.xlsx'
        alternate.write_bytes(self.second.read_bytes())
        self.context['file2'] = str(alternate)
        with patch.object(bridge.core, 'carregar_excel', wraps=bridge.core.carregar_excel) as read:
            self.details()
            self.assertEqual(len(bridge._comparison_cache), 1)
            self.context = original
            self.details()
            self.assertEqual(read.call_count, 4)
            self.assertEqual(len(bridge._comparison_cache), 1)

    def test_changed_sheet_or_rules_reject_old_identity_and_clear_cache(self):
        for rules in [dict(sheet='Outra'), dict(alignByFirstColumn=False),
                      dict(validateUniqueFirstColumn=True)]:
            with self.subTest(rules=rules):
                self.compare()
                with self.assertRaisesRegex(ValueError, 'mudaram desde a comparação'):
                    self.details(**rules)
                self.assertFalse(bridge._comparison_cache)
        self.compare(alignByFirstColumn=False)
        self.assertEqual(self.details(3)['values2'][1], 'Novo segundo')
        with self.assertRaisesRegex(ValueError, 'duplicada'):
            self.compare(alignByFirstColumn=True, validateUniqueFirstColumn=True)
        self.assertFalse(bridge._comparison_cache)

    def test_content_change_with_same_size_and_timestamp_is_rejected(self):
        # ZIP_STORED lets the text change keep the exact workbook byte length.
        def stored(name):
            source = spreadsheet(['ID', 'Nome'], [[1, name]])
            output = BytesIO()
            with ZipFile(BytesIO(source)) as original, ZipFile(output, 'w', ZIP_STORED) as result:
                for item in original.infolist():
                    result.writestr(item.filename, original.read(item.filename))
            return output.getvalue()

        self.first.write_bytes(stored('Ana'))
        self.second.write_bytes(stored('Bia'))
        self.compare()
        previous = self.second.stat()
        self.second.write_bytes(stored('Lia'))
        os.utime(self.second, ns=(previous.st_atime_ns, previous.st_mtime_ns))
        self.assertEqual(self.second.stat().st_size, previous.st_size)
        self.assertEqual(self.second.stat().st_mtime_ns, previous.st_mtime_ns)
        with self.assertRaisesRegex(ValueError, 'mudaram desde a comparação'):
            self.details()
        self.assertFalse(bridge._comparison_cache)
        self.compare()
        self.assertEqual(self.details()['values2'][1], 'Lia')

    def test_missing_sources_never_return_cached_details(self):
        self.compare()
        self.second.unlink()
        with self.assertRaisesRegex(ValueError, 'acessar os arquivos'):
            self.details()
        self.assertFalse(bridge._comparison_cache)

    def test_multiple_requests_keep_json_lines_protocol_in_one_process(self):
        fingerprint = bridge.session_fingerprint(self.first.read_bytes(), self.second.read_bytes(), self.context)
        requests = [
            dict(self.context, id=1, action='compare'),
            dict(self.context, id=2, action='row-details', line=3, fingerprint=fingerprint),
        ]
        result = subprocess.run([sys.executable, str(Path(bridge.__file__))],
            input=''.join(json.dumps(request) + '\n' for request in requests),
            text=True, encoding='utf-8', capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([item['id'] for item in responses], [1, 2])
        self.assertTrue(all(item['ok'] for item in responses), responses)
        self.assertEqual(responses[1]['result']['values2'][1], 'Novo segundo')


if __name__ == '__main__':
    unittest.main()
