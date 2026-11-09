import ast
import json
from pathlib import Path
import sqlite3
import unittest

from learn_server import add_gui_lessons

ROOT=Path(__file__).resolve().parents[1]


class GUICatalogTests(unittest.TestCase):
    def test_twelve_ordered_tasks_have_english_code_and_private_solutions(self):
        tasks=json.loads((ROOT/'learn-gui.json').read_text(encoding='utf-8'))
        self.assertEqual(len(tasks),12)
        self.assertEqual(len({task['id'] for task in tasks}),12)
        self.assertEqual([task['id'] for task in tasks[:3]],['gui-import-module','gui-import-name','gui-hello'])
        for task in tasks:
            self.assertEqual(task['level'],'GUI')
            self.assertEqual(task['language'],'python')
            self.assertTrue(task['visible'])
            self.assertFalse(task['solution_released'])
            self.assertTrue(task['description_en'])
            for field in ('starter_code','solution'):
                self.assertTrue(task[field].isascii(),(task['id'],field))
                self.assertEqual(task[field],task[field+'_en'])
                ast.parse(task[field])
                self.assertNotIn('ui.run(',task[field])

    def test_upgrade_preserves_existing_rows_and_is_not_reapplied(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE migrations (name TEXT PRIMARY KEY)')
            teacher={'id':'hello','language':'python','description':'Teacher edit','visible':False,'solution_released':True}
            existing={'id':'gui-hello','language':'python','level':'Teacher category','description':'Custom GUI exercise','solution_released':True}
            js={'id':'js-hello','language':'javascript','description':'Keep this too'}
            rows=[teacher.copy(),existing.copy(),js.copy()]
            self.assertTrue(add_gui_lessons(db,rows))
            self.assertEqual(rows[0],teacher)
            self.assertEqual(rows[1],existing)
            self.assertEqual(rows[-1],js)
            self.assertEqual(len(rows),14)
            added=[r for r in rows if r['id'].startswith('gui-') and r['id']!='gui-hello']
            self.assertTrue(all(not r['solution_released'] for r in added))
            rows[:]=[r for r in rows if r['id']!='gui-score']
            self.assertFalse(add_gui_lessons(db,rows))
            self.assertNotIn('gui-score',{r['id'] for r in rows})
            self.assertEqual(rows[0],teacher)


if __name__=='__main__':
    unittest.main()
