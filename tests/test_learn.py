import http.cookiejar
import json
import sqlite3
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from learn_server import create_server, password_hash


class LearnTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "learn.sqlite3")
        self.hash = password_hash("test-secret")
        self.start()
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def start(self):
        self.server = create_server(("127.0.0.1", 0), self.database, self.hash, secure=False)
        self.url = "http://127.0.0.1:" + str(self.server.server_port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.server.database.close()

    def tearDown(self):
        self.stop()
        self.directory.cleanup()

    def request(self, path, method="GET", data=None, origin=None):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        request = urllib.request.Request(self.url + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
        try:
            response = self.client.open(request)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.load(response)

    def login(self):
        self.assertEqual(self.request("/api/admin/login", "POST", {"password":"test-secret"})[0], 200)

    def test_protected_persistent_edits_and_conflicts(self):
        _, original = self.request("/api/learn")
        self.assertEqual(len(original["entries"]), 82)
        self.assertEqual(sum(entry["language"]=="javascript" for entry in original["entries"]),41)
        self.assertEqual(self.request("/api/learn", "PUT", original)[0], 401)
        self.assertEqual(self.request("/api/admin/login", "POST", {"password":"wrong"})[0], 401)
        self.login()
        self.assertTrue(self.request("/api/admin/session")[1]["authenticated"])
        changed = {"version":original["version"], "entries":[{"title":"New task", "description":"New description", "level":"Aufbau"}, original["entries"][1]]}
        status, saved = self.request("/api/learn", "PUT", changed)
        self.assertEqual(status, 200)
        self.assertEqual(saved["entries"][0]["level"], "Aufbau")
        self.assertEqual(self.request("/api/learn", "PUT", changed)[0], 409)
        self.stop()
        self.start()
        self.assertEqual(self.request("/api/admin/learn")[1], saved)
        self.assertTrue(self.request("/api/admin/session")[1]["authenticated"])
        self.request("/api/admin/logout", "POST", {})
        self.assertFalse(self.request("/api/admin/session")[1]["authenticated"])
        self.assertEqual(self.request("/api/learn", "PUT", saved)[0], 401)

    def test_validation_csrf_rate_limit_and_empty_list(self):
        self.assertEqual(self.request("/api/admin/login", "POST", {"password":"test-secret"}, "https://other.example")[0], 403)
        self.login()
        _, state = self.request("/api/learn")
        state["entries"] = [{"title":"", "description":"test"}]
        self.assertEqual(self.request("/api/learn", "PUT", state)[0], 400)
        state["entries"] = [{"title":"Test", "description":"test", "level":5}]
        self.assertEqual(self.request("/api/learn", "PUT", state)[0], 400)
        state["entries"] = [{"title":"Test", "description":"test", "level":"x" * 61}]
        self.assertEqual(self.request("/api/learn", "PUT", state)[0], 400)
        state["entries"] = []
        self.assertEqual(self.request("/api/learn", "PUT", state)[0], 200)
        self.stop()
        self.start()
        self.assertEqual(self.request("/api/learn")[1]["entries"], [])
        for _ in range(5):
            self.assertEqual(self.request("/api/admin/login", "POST", {"password":"wrong"})[0], 401)
        self.assertEqual(self.request("/api/admin/login", "POST", {"password":"test-secret"})[0], 429)

    def test_visibility_hides_tasks_and_solutions_without_deleting_them(self):
        self.login()
        state=self.request("/api/admin/learn")[1]
        target=next(entry for entry in state["entries"] if entry["id"]=="hello")
        target.update(visible=False,solution_released=True)
        self.assertEqual(self.request("/api/learn","PUT",state)[0],200)
        self.assertNotIn("hello",{entry["id"] for entry in self.request("/api/learn")[1]["entries"]})
        self.assertEqual(self.request("/api/learn/hello/solution")[0],404)
        self.stop();self.start()
        private=self.request("/api/admin/learn")[1]
        target=next(entry for entry in private["entries"] if entry["id"]=="hello")
        self.assertFalse(target["visible"])
        self.assertTrue(target["solution_released"])
        invalid=dict(private,entries=[dict(target,visible="false")])
        self.assertEqual(self.request("/api/learn","PUT",invalid)[0],400)
        target["visible"]=True
        self.assertEqual(self.request("/api/learn","PUT",private)[0],200)
        self.assertIn("hello",{entry["id"] for entry in self.request("/api/learn")[1]["entries"]})
        self.assertEqual(self.request("/api/learn/hello/solution")[0],200)

    def test_basics_upgrade_preserves_teacher_edits_and_runs_once(self):
        self.login()
        state=self.request("/api/admin/learn")[1]
        state["entries"]=[entry for entry in state["entries"] if "basics-" not in entry["id"]]
        state["entries"][0].update(description="Teacher assignment",visible=False,solution_released=True)
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE state SET entries=? WHERE id=1",(json.dumps(state["entries"]),))
            db.execute("DELETE FROM migrations WHERE name='basics-practice-v1'")
        db.close();self.start()
        upgraded=self.request("/api/admin/learn")[1]
        self.assertEqual(len(upgraded["entries"]),82)
        first=next(entry for entry in upgraded["entries"] if entry["id"]=="hello")
        self.assertEqual(first["description"],"Teacher assignment")
        self.assertFalse(first["visible"])
        self.assertTrue(first["solution_released"])
        additions=[entry for entry in upgraded["entries"] if "basics-" in entry["id"]]
        self.assertTrue(all(entry["visible"] and not entry["solution_released"] and entry["solution_en"] for entry in additions))
        upgraded["entries"]=[entry for entry in upgraded["entries"] if entry["id"]!="basics-snacks"]
        self.assertEqual(self.request("/api/learn","PUT",upgraded)[0],200)
        self.stop();self.start()
        self.assertNotIn("basics-snacks",{entry["id"] for entry in self.request("/api/admin/learn")[1]["entries"]})

    def test_level_upgrade_preserves_custom_levels_and_release_choices(self):
        self.login()
        state=self.request("/api/admin/learn")[1]
        manifest=json.loads(Path(__file__).resolve().parents[1].joinpath("learn-basics-upgrade.json").read_text(encoding="utf-8"))
        for entry in state["entries"]:
            update=manifest["level_updates"].get(entry["id"])
            if update:
                entry["level"]=update["before"]
            if entry["id"]=="basics-door":
                entry.update(level="Teacher level",visible=False,solution_released=True)
            if entry["id"] in ("function","js-function"):
                for field in ("description","description_en"):
                    entry[field]=entry[field].removesuffix(" [RETURN]")
            if entry["id"] in ("basics-rectangle-area","js-basics-rectangle-area"):
                for field in ("description","description_en"):
                    entry[field]+=" [RETURN]"
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE state SET entries=? WHERE id=1",(json.dumps(state["entries"]),))
            db.execute("DELETE FROM migrations WHERE name='practice-levels-v1'")
        db.close();self.start()
        updated=self.request("/api/admin/learn")[1]
        rows={entry["id"]:entry for entry in updated["entries"]}
        for identity,update in manifest["level_updates"].items():
            self.assertEqual(rows[identity]["level"],"Teacher level" if identity=="basics-door" else update["value"])
        self.assertFalse(rows["basics-door"]["visible"])
        self.assertTrue(rows["basics-door"]["solution_released"])
        self.assertTrue(rows["function"]["description"].endswith("[RETURN]"))
        self.assertFalse(rows["basics-rectangle-area"]["description"].endswith("[RETURN]"))
        rows["basics-count-up"]["level"]="Grundlagen"
        self.assertEqual(self.request("/api/learn","PUT",updated)[0],200)
        self.stop();self.start()
        rows={entry["id"]:entry for entry in self.request("/api/admin/learn")[1]["entries"]}
        self.assertEqual(rows["basics-count-up"]["level"],"Grundlagen")

    def test_graphics_levels_merge_bonus_without_overwriting_custom_choices(self):
        self.login()
        state=self.request("/api/admin/learn")[1]
        manifest=json.loads(Path(__file__).resolve().parents[1].joinpath("learn-basics-upgrade.json").read_text(encoding="utf-8"))
        for entry in state["entries"]:
            update=manifest["graphics_level_updates"].get(entry["id"])
            if update:entry["level"]=update["before"]
            if entry["id"]=="drag-circles":entry.update(level="Teacher group",visible=False,solution_released=True)
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE state SET entries=? WHERE id=1",(json.dumps(state["entries"]),))
            db.execute("DELETE FROM migrations WHERE name='graphics-levels-v1'")
        db.close();self.start()
        updated=self.request("/api/admin/learn")[1]
        rows={entry["id"]:entry for entry in updated["entries"]}
        for identity,update in manifest["graphics_level_updates"].items():
            self.assertEqual(rows[identity]["level"],"Teacher group" if identity=="drag-circles" else update["value"])
        self.assertFalse(rows["drag-circles"]["visible"])
        self.assertTrue(rows["drag-circles"]["solution_released"])
        rows["shapes"]["level"]="Aufbau"
        self.assertEqual(self.request("/api/learn","PUT",updated)[0],200)
        self.stop();self.start()
        rows={entry["id"]:entry for entry in self.request("/api/admin/learn")[1]["entries"]}
        self.assertEqual(rows["shapes"]["level"],"Aufbau")

    def test_solutions_are_private_until_released_and_can_be_locked_again(self):
        self.assertEqual(self.request("/api/admin/learn")[0],401)
        self.assertEqual(self.request("/api/learn/hello/solution")[0],403)
        public = self.request("/api/learn")[1]
        self.assertTrue(all("solution" not in entry for entry in public["entries"]))
        self.assertTrue(all(not entry["solution_available"] for entry in public["entries"]))
        self.assertEqual(self.request("/learn-solutions.json")[0],404)
        self.login()
        private = self.request("/api/admin/learn")[1]
        self.assertTrue(all(entry["solution"] for entry in private["entries"]))
        self.assertEqual(self.request("/api/learn/hello/solution")[0],403)
        private["entries"][0]["solution_released"] = True
        status,saved = self.request("/api/learn","PUT",private)
        self.assertEqual(status,200)
        self.request("/api/admin/logout","POST",{})
        self.assertEqual(self.request("/api/learn/hello/solution")[0],200)
        self.assertEqual(self.request("/api/learn/hello/solution")[1]["solution"],saved["entries"][0]["solution"])
        self.assertEqual(self.request("/api/learn/password/solution")[0],403)
        self.assertNotIn("solution",self.request("/api/learn")[1]["entries"][0])
        self.login()
        private = self.request("/api/admin/learn")[1]
        private["entries"][0]["solution_released"] = False
        private["entries"][0]["solution"] = "print('Neue Lösung')\n"
        self.assertEqual(self.request("/api/learn","PUT",private)[0],200)
        self.stop(); self.start()
        self.assertEqual(self.request("/api/learn/hello/solution")[0],403)
        self.assertEqual(self.request("/api/admin/learn")[1]["entries"][0]["solution"],"print('Neue Lösung')\n")

    def test_canvas_bilingual_upgrade_preserves_custom_solutions(self):
        self.login()
        state = self.request("/api/admin/learn")[1]
        original = {entry["id"]: dict(entry) for entry in state["entries"]}
        fixture = Path(__file__).with_name("fixtures") / "matplotlib-shapes.py"
        for entry in state["entries"]:
            for key in ("title_en", "description_en", "solution_en"):
                entry.pop(key, None)
            if entry["id"] == "shapes":
                entry.update(solution=fixture.read_text(encoding="utf-8"), solution_released=True)
            if entry["id"] == "drag-circles":
                entry.update(solution="print('Teacher version')", solution_released=True)
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE state SET entries=? WHERE id=1", (json.dumps(state["entries"]),))
            db.execute("DELETE FROM migrations WHERE name IN ('python-canvas-v1','commented-solutions-v1','bilingual-learn-v1')")
        db.close()
        self.start()
        upgraded = {entry["id"]: entry for entry in self.request("/api/admin/learn")[1]["entries"]}
        self.assertEqual(upgraded["shapes"]["solution"], original["shapes"]["solution"])
        self.assertTrue(upgraded["shapes"]["solution_released"])
        self.assertEqual(upgraded["shapes"]["solution_en"], original["shapes"]["solution_en"])
        self.assertEqual(upgraded["drag-circles"]["solution"], "print('Teacher version')")
        self.assertTrue(upgraded["drag-circles"]["solution_released"])
        self.assertEqual(upgraded["drag-circles"]["solution_en"], "")
        public = self.request("/api/learn")[1]
        self.assertTrue(all("solution_en" not in entry for entry in public["entries"]))
        self.assertEqual(self.request("/learn-solutions-en.json")[0], 404)

    def test_graphics_and_game_migrations_preserve_admin_changes(self):
        self.login()
        state = self.request("/api/admin/learn")[1]
        old_description = "Prüfe mit `if/else`, ob `points >= 10`. Gib LEVEL UP oder TRY AGAIN aus."
        old_solution = 'points = 12\n\nif points >= 10:\n    print("LEVEL UP")\nelse:\n    print("TRY AGAIN")\n'
        state["entries"] = [entry for entry in state["entries"]
                            if entry["id"].removeprefix("js-") not in
                            ("shapes", "drag-circles", "rotate-rectangle", "bouncing-ball", "framerate")]
        for entry in state["entries"]:
            if entry["id"] == "level":
                entry.update(description=old_description, solution=old_solution, solution_released=True)
            if entry["id"] == "js-level":
                entry.update(description="Teacher description", solution="Teacher solution", solution_released=True)
        self.assertEqual(self.request("/api/learn", "PUT", state)[0], 200)
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("DELETE FROM migrations WHERE name IN ('expert-graphics-v1','clearer-games-v1','framerate-learn-v1')")
        db.close()
        self.start()
        updated = self.request("/api/admin/learn")[1]
        rows = {entry["id"]: entry for entry in updated["entries"]}
        self.assertEqual(len(rows), 82)
        self.assertIn("input(", rows["level"]["solution"])
        self.assertNotEqual(rows["level"]["description"], old_description)
        self.assertTrue(rows["level"]["solution_released"])
        self.assertEqual(rows["js-level"]["description"], "Teacher description")
        self.assertEqual(rows["js-level"]["solution"], "Teacher solution")
        self.assertTrue(rows["js-level"]["solution_released"])
        self.assertFalse(rows["shapes"]["solution_released"])
        self.assertTrue(rows["shapes"]["solution"])
        self.assertTrue(rows["framerate"]["solution"])
        self.assertFalse(rows["framerate"]["solution_released"])
        identities = [entry["id"] for entry in updated["entries"]]
        self.assertEqual(identities[identities.index("bouncing-ball") + 1], "framerate")
        self.assertEqual(identities[identities.index("js-bouncing-ball") + 1], "js-framerate")
        updated["entries"] = [entry for entry in updated["entries"] if entry["id"] not in ("shapes", "framerate")]
        self.assertEqual(self.request("/api/learn", "PUT", updated)[0], 200)
        self.stop(); self.start()
        self.assertNotIn("shapes", {entry["id"] for entry in self.request("/api/admin/learn")[1]["entries"]})
        self.assertNotIn("framerate", {entry["id"] for entry in self.request("/api/admin/learn")[1]["entries"]})

    def test_javascript_migration_preserves_python_edits_and_runs_only_once(self):
        self.login()
        state=self.request("/api/admin/learn")[1]
        legacy=[entry for entry in state["entries"] if entry["language"]=="python"]
        for entry in legacy:
            del entry["language"]
        legacy[0].update(title="Edited Python task",solution="print('Private edit')",solution_released=True)
        self.stop()
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE state SET entries=? WHERE id=1",(json.dumps(legacy),))
            db.execute("DELETE FROM migrations")
        db.close()
        self.start()
        migrated=self.request("/api/admin/learn")[1]
        self.assertEqual(len(migrated["entries"]),82)
        self.assertEqual(migrated["entries"][0]["title"],"Edited Python task")
        self.assertEqual(migrated["entries"][0]["solution"],"print('Private edit')")
        self.assertTrue(migrated["entries"][0]["solution_released"])
        javascript=[entry for entry in migrated["entries"] if entry["language"]=="javascript"]
        self.assertEqual(len(javascript),41)
        self.assertTrue(all(entry["solution"] and not entry["solution_released"] for entry in javascript))
        invalid=dict(migrated,entries=[dict(javascript[0],language="ruby")])
        self.assertEqual(self.request("/api/learn","PUT",invalid)[0],400)
        migrated["entries"]=[entry for entry in migrated["entries"] if entry["id"]!="js-hello"]
        self.assertEqual(self.request("/api/learn","PUT",migrated)[0],200)
        self.stop();self.start()
        self.assertEqual(len(self.request("/api/admin/learn")[1]["entries"]),81)


if __name__ == "__main__":
    unittest.main()
