"""Small persistent Learn API. Nginx serves the editor and proxies /api/."""
import hashlib
import hmac
import json
import os
import re
from datetime import datetime
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from urllib.parse import unquote
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt + ":" + digest


def create_server(address, database, encoded_password, secure=True, static_dir=None):
    salt, digest = encoded_password.split(":")
    # Reject invalid configuration before accepting requests.
    bytes.fromhex(salt)
    if len(bytes.fromhex(digest)) != 64:
        raise ValueError("Invalid password hash")
    lock = threading.Lock()
    failures = {}
    db = sqlite3.connect(database, check_same_thread=False)
    db.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, version INTEGER, entries TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires REAL)")
    db.execute("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)")
    db.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS user_results (user_id TEXT NOT NULL, id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(user_id,id))")
    seeds = json.loads(Path(__file__).with_name("learn-defaults.json").read_text(encoding="utf-8"))
    db.execute("INSERT OR IGNORE INTO state VALUES (1, 1, ?)", (json.dumps(seeds),))
    # Seed private solutions once; preserve every later admin edit and release.
    solutions = json.loads(Path(__file__).with_name("learn-solutions.json").read_text(encoding="utf-8"))
    english_solutions = json.loads(Path(__file__).with_name("learn-solutions-en.json").read_text(encoding="utf-8"))
    version, stored = db.execute("SELECT version,entries FROM state WHERE id=1").fetchone()
    entries = json.loads(stored)
    changed = False
    # Add the JavaScript catalog once, without restoring tasks deleted by admins.
    if not db.execute("SELECT 1 FROM migrations WHERE name='javascript-learn-v1'").fetchone():
        identities = {entry["id"] for entry in entries}
        entries.extend(entry for entry in seeds if entry.get("language") == "javascript" and entry["id"] not in identities)
        db.execute("INSERT INTO migrations VALUES ('javascript-learn-v1')")
        changed = True
    for entry in entries:
        if "visible" not in entry:
            entry["visible"] = True
            changed = True
        if "language" not in entry:
            entry["language"] = "python"
            changed = True
        if "solution" not in entry:
            entry["solution"] = solutions.get(entry["id"], "")
            entry["solution_released"] = False
            changed = True
    if not db.execute("SELECT 1 FROM migrations WHERE name='expert-graphics-v1'").fetchone():
        identities = {entry["id"] for entry in entries}
        for language in ("python", "javascript"):
            additions = [entry for entry in seeds if entry["language"] == language
                         and entry["id"].removeprefix("js-") in
                         ("shapes", "drag-circles", "rotate-rectangle", "bouncing-ball")
                         and entry["id"] not in identities]
            for entry in additions:
                entry = dict(entry, solution=solutions[entry["id"]], solution_released=False)
                position = max((i + 1 for i, row in enumerate(entries)
                                if row["language"] == language), default=len(entries))
                entries.insert(position, entry)
                changed = True
        db.execute("INSERT INTO migrations VALUES ('expert-graphics-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='framerate-learn-v1'").fetchone():
        identities = {entry["id"] for entry in entries}
        for default in seeds:
            identity = default["id"]
            if identity not in ("framerate", "js-framerate") or identity in identities:
                continue
            entry = dict(default, solution=solutions[identity], solution_released=False)
            predecessor = identity.replace("framerate", "bouncing-ball")
            position = next((i + 1 for i, row in enumerate(entries) if row["id"] == predecessor),
                            max((i + 1 for i, row in enumerate(entries)
                                 if row["language"] == entry["language"]), default=len(entries)))
            entries.insert(position, entry)
            changed = True
        db.execute("INSERT INTO migrations VALUES ('framerate-learn-v1')")
    # Update only unchanged defaults. Teacher edits and release choices survive.
    if not db.execute("SELECT 1 FROM migrations WHERE name='clearer-games-v1'").fetchone():
        old_descriptions = {
            "level": "b9d277925b5846147f377956bbca1770a9a4998dafceebbdd0a2732929528a7f",
            "codebreaker": "b442b05c5781f00dbdb13d9f4a9f3856042970e713ef41f9e199eb971b8ad771",
        }
        old_solutions = {
            "level": "15a1c8e623665c8093d19b9c2655ae6fe3bb21a27913514ea897a23e81e2af35",
            "js-level": "ff993f3519cd5550ad1c26617f393fdf0f9ea299290a9a31eb9fcb4d899afba7",
            "codebreaker": "40b7ce8902016540700789913fd93c489fb81241893fe02a345ed5804f4bc5db",
            "js-codebreaker": "63a6f4c29ce493265d71d31e5fbb1ad94feea8f3bf3fcbf31840268fccb48355",
        }
        defaults = {entry["id"]: entry for entry in seeds}
        for entry in entries:
            identity = entry["id"]
            if identity not in old_solutions:
                continue
            for key, fingerprint, replacement in (
                ("description", old_descriptions[identity.removeprefix("js-")], defaults[identity]["description"]),
                ("solution", old_solutions[identity], solutions[identity]),
            ):
                if hashlib.sha256(entry.get(key, "").encode()).hexdigest() == fingerprint:
                    entry[key] = replacement
                    changed = True
        db.execute("INSERT INTO migrations VALUES ('clearer-games-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='python-canvas-v1'").fetchone():
        fingerprints = json.loads(Path(__file__).with_name("learn-canvas-upgrade.json").read_text(encoding="utf-8"))
        defaults = {row["id"]: row for row in seeds}
        for entry in entries:
            identity = entry["id"]
            if identity not in fingerprints:
                continue
            for key in ("description", "solution"):
                value = entry.get(key, "")
                if hashlib.sha256(value.encode()).hexdigest() == fingerprints[identity][key]:
                    entry[key] = defaults[identity][key] if key == "description" else solutions[identity]
                    changed = True
        db.execute("INSERT INTO migrations VALUES ('python-canvas-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='collision-learn-v1'").fetchone():
        identities = {entry["id"] for entry in entries}
        for default in seeds:
            identity = default["id"]
            if identity not in ("collision", "js-collision") or identity in identities:
                continue
            entry = dict(default, solution=solutions[identity], solution_released=False)
            predecessor = identity.replace("collision", "framerate")
            position = next((i + 1 for i, row in enumerate(entries) if row["id"] == predecessor), len(entries))
            entries.insert(position, entry)
            changed = True
        db.execute("INSERT INTO migrations VALUES ('collision-learn-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='commented-solutions-v1'").fetchone():
        fingerprints = json.loads(Path(__file__).with_name("learn-comments-upgrade.json").read_text(encoding="utf-8"))
        for entry in entries:
            identity = entry["id"]
            if identity in fingerprints and hashlib.sha256(entry.get("solution", "").encode()).hexdigest() == fingerprints[identity]:
                entry["solution"] = solutions[identity]
                changed = True
        db.execute("INSERT INTO migrations VALUES ('commented-solutions-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='bilingual-learn-v1'").fetchone():
        defaults = {row["id"]: row for row in seeds}
        for entry in entries:
            default = defaults.get(entry["id"], {})
            for key in ("title", "description", "solution"):
                expected = solutions.get(entry["id"]) if key == "solution" else default.get(key)
                translated = english_solutions.get(entry["id"], "") if key == "solution" else default.get(key + "_en", "")
                if key + "_en" not in entry:
                    entry[key + "_en"] = translated if entry.get(key) == expected else ""
                    changed = True
        db.execute("INSERT INTO migrations VALUES ('bilingual-learn-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='basics-practice-v1'").fetchone():
        manifest = json.loads(Path(__file__).with_name("learn-basics-upgrade.json").read_text(encoding="utf-8"))
        defaults = {row["id"]: row for row in seeds}
        identities = {row["id"] for row in entries}
        for identity, predecessor in manifest["additions"].items():
            if identity in identities:
                continue
            entry = dict(defaults[identity], solution=solutions[identity], solution_en=english_solutions[identity], solution_released=False)
            position = next((i+1 for i, row in enumerate(entries) if row["id"] == predecessor),
                            max((i+1 for i, row in enumerate(entries) if row["language"] == entry["language"]), default=len(entries)))
            entries.insert(position, entry)
            identities.add(identity)
            changed = True
        for entry in entries:
            for field, update in manifest["descriptions"].get(entry["id"], {}).items():
                if hashlib.sha256(entry.get(field, "").encode()).hexdigest() == update["before"]:
                    entry[field] = update["value"]
                    changed = True
            for field, value in manifest.get("starters", {}).get(entry["id"], {}).items():
                if field not in entry:
                    entry[field] = value
                    changed = True
        db.execute("INSERT INTO migrations VALUES ('basics-practice-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='practice-levels-v1'").fetchone():
        manifest=json.loads(Path(__file__).with_name("learn-basics-upgrade.json").read_text(encoding="utf-8"))
        for entry in entries:
            update=manifest.get("level_updates",{}).get(entry["id"])
            if update and entry.get("level")==update["before"]:
                entry["level"]=update["value"]
                changed=True
            # The first return exercise now belongs to the same level as the area exercise.
            if entry["id"] in ("function","js-function"):
                for field in ("description","description_en"):
                    update=manifest["descriptions"].get(entry["id"],{}).get(field)
                    if update and hashlib.sha256(entry.get(field,"").encode()).hexdigest()==update["before"]:
                        entry[field]=update["value"]
                        changed=True
            if entry["id"] in ("basics-rectangle-area","js-basics-rectangle-area"):
                default=next(row for row in seeds if row["id"]==entry["id"])
                for field in ("description","description_en"):
                    if entry.get(field)==default[field]+" [RETURN]":
                        entry[field]=default[field]
                        changed=True
        db.execute("INSERT INTO migrations VALUES ('practice-levels-v1')")
    if not db.execute("SELECT 1 FROM migrations WHERE name='graphics-levels-v1'").fetchone():
        manifest=json.loads(Path(__file__).with_name("learn-basics-upgrade.json").read_text(encoding="utf-8"))
        for entry in entries:
            update=manifest.get("graphics_level_updates",{}).get(entry["id"])
            if update and entry.get("level")==update["before"]:
                entry["level"]=update["value"]
                changed=True
        db.execute("INSERT INTO migrations VALUES ('graphics-levels-v1')")
    for entry in entries:
        for field in ("starter_code", "starter_code_en"):
            if field not in entry:
                entry[field] = ""
                changed = True
    if changed:
        db.execute("UPDATE state SET version=?,entries=? WHERE id=1", (version+1, json.dumps(entries)))
    db.commit()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log passwords or session cookies.

        def reply(self, status, data, cookie=None):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(body)

        def token(self, name="pyjs_session"):
            try:
                cookie = SimpleCookie(self.headers.get("Cookie", ""))
                value = cookie.get(name)
                return hashlib.sha256((value.value if value else "").encode()).hexdigest()
            except Exception:
                return ""

        def authenticated(self):
            with lock:
                return db.execute("SELECT 1 FROM sessions WHERE token=? AND expires>?", (self.token(), time.time())).fetchone() is not None

        def user(self):
            with lock:
                row = db.execute("SELECT u.id,u.username FROM users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?", (self.token("pyjs_user"),time.time())).fetchone()
            return {"id":row[0],"username":row[1]} if row else None

        def user_results(self, user_id):
            return sorted([json.loads(row[0]) for row in db.execute("SELECT result FROM user_results WHERE user_id=?", (user_id,))], key=lambda r:datetime.fromisoformat(r["savedAt"].replace("Z","+00:00")).timestamp(), reverse=True)

        def admin_users(self):
            if not self.authenticated():
                return self.reply(401,{"error":"Please sign in again."})
            identity=self.path.removeprefix("/api/admin/users").strip("/")
            with lock:
                users=db.execute("SELECT id,username FROM users ORDER BY username").fetchall()
                if identity:
                    user=next(({"id":uid,"username":name} for uid,name in users if uid==identity),None)
                    if not user:
                        return self.reply(404,{"error":"Benutzer nicht gefunden."})
                    return self.reply(200,{"user":user,"results":self.user_results(identity)})
                entries=json.loads(db.execute("SELECT entries FROM state WHERE id=1").fetchone()[0])
                current={lang:{e["id"] for e in entries if e.get("visible",True) and e.get("language","python")==lang} for lang in ("python","javascript")}
                records={uid:[] for uid,_ in users}
                for uid,raw in db.execute("SELECT user_id,result FROM user_results"):
                    if uid in records:
                        result=json.loads(raw)
                        records[uid].append((result["challengeId"],result["language"],result["savedAt"]))
                overview=[]
                for uid,name in users:
                    saved=records[uid]
                    latest=max((r[2] for r in saved),key=lambda date:datetime.fromisoformat(date.replace("Z","+00:00")).timestamp(),default=None)
                    overview.append({"id":uid,"username":name,"versions":len(saved),"lastSavedAt":latest,"progress":{lang:len({r[0] for r in saved if r[1]==lang}&current[lang]) for lang in current}})
            self.reply(200,{"users":overview,"totals":{lang:len(ids) for lang,ids in current.items()}})

        def state(self, private=False):
            with lock:
                version, entries = db.execute("SELECT version,entries FROM state WHERE id=1").fetchone()
            entries = json.loads(entries)
            if not private:
                entries = [dict(
                    {key: entry[key] for key in ("id", "title", "description", "title_en", "description_en", "level", "language", "starter_code", "starter_code_en") if key in entry},
                    solution_available=bool(entry.get("solution") and entry.get("solution_released")),
                ) for entry in entries if entry.get("visible", True)]
            return {"version": version, "entries": entries}

        def cookie(self, value, age, name="pyjs_session"):
            return f"{name}={value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age={age}" + ("; Secure" if secure else "")

        def do_GET(self):
            if self.path=="/api/admin/users" or self.path.startswith("/api/admin/users/"):
                return self.admin_users()
            if self.path == "/api/account/session":
                self.reply(200, {"user":self.user()})
            elif self.path == "/api/account/results":
                user=self.user()
                if not user:
                    return self.reply(401,{"error":"Bitte erneut anmelden."})
                with lock:
                    results=self.user_results(user["id"])
                self.reply(200,{"user":user,"results":results})
            elif self.path == "/api/learn":
                self.reply(200, self.state())
            elif self.path == "/api/admin/learn":
                if not self.authenticated():
                    return self.reply(401, {"error": "Please sign in again."})
                self.reply(200, self.state(private=True))
            elif self.path.startswith("/api/learn/") and self.path.endswith("/solution"):
                identity = unquote(self.path[len("/api/learn/"):-len("/solution")])
                entry = next((entry for entry in self.state(private=True)["entries"] if entry["id"] == identity), None)
                if not entry or not entry.get("visible", True):
                    return self.reply(404, {"error": "Aufgabe nicht gefunden."})
                if not entry.get("solution_released") or not entry.get("solution"):
                    return self.reply(403, {"error": "Diese Lösung ist noch nicht freigegeben."})
                self.reply(200, {key: entry.get(key, "") for key in ("title", "title_en", "solution", "solution_en")})
            elif self.path == "/api/admin/session":
                self.reply(200, {"authenticated": self.authenticated()})
            elif static_dir and self.path.split("?")[0] in ("/", "/index.html", "/styles.css", "/app.bundle.js", "/config.js", "/logo.svg"):
                name = self.path.split("?")[0].lstrip("/") or "index.html"
                body = (Path(static_dir) / name).read_bytes()
                self.send_response(200)
                self.send_header("Cross-Origin-Opener-Policy", "same-origin")
                self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
                self.send_header("Content-Type", "image/svg+xml" if name.endswith("svg") else "text/css" if name.endswith("css") else "text/javascript" if name.endswith("js") else "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.reply(404, {"error": "Not found."})

        def mutate(self):
            origin = self.headers.get("Origin")
            expected = ("https" if secure else "http") + "://" + self.headers.get("Host", "")
            if (origin and origin != expected) or self.headers.get("Sec-Fetch-Site") == "cross-site":
                return self.reply(403, {"error": "Request origin rejected."})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.reply(415, {"error": "JSON required."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 2097152:
                    raise ValueError()
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError()
            except (ValueError, UnicodeError):
                return self.reply(400, {"error": "Invalid request."})
            if self.path.startswith("/api/account/"):
                return self.account_mutation(data)
            if self.path.startswith("/api/admin/users/") and self.path.endswith("/password") and self.command=="POST":
                if not self.authenticated():
                    return self.reply(401,{"error":"Please sign in again."})
                user_id=self.path[len("/api/admin/users/"):-len("/password")]
                password=data.get("password")
                if not isinstance(password,str) or not 8<=len(password)<=256:
                    return self.reply(400,{"error":"Das neue Passwort muss 8–256 Zeichen lang sein."})
                with lock:
                    row=db.execute("SELECT username FROM users WHERE id=?",(user_id,)).fetchone()
                    if not row:
                        return self.reply(404,{"error":"Benutzer nicht gefunden."})
                    db.execute("UPDATE users SET password=? WHERE id=?",(password_hash(password),user_id))
                    db.execute("DELETE FROM user_sessions WHERE user_id=?",(user_id,))
                    db.commit()
                    for key in list(failures):
                        if key.startswith("account:login:") and key.endswith(":"+row[0]):
                            failures.pop(key,None)
                return self.reply(200,{"reset":True})
            if self.path == "/api/admin/login" and self.command == "POST":
                ip = self.headers.get("X-Real-IP", self.client_address[0])
                with lock:
                    attempts = [t for t in failures.get(ip, []) if t > time.time() - 300]
                    if len(attempts) >= 5:
                        return self.reply(429, {"error": "Too many attempts. Try again in five minutes."})
                    password = data.get("password")
                    valid = isinstance(password, str) and len(password) <= 256 and hmac.compare_digest(password_hash(password, salt), encoded_password)
                    if not valid:
                        failures[ip] = attempts + [time.time()]
                        return self.reply(401, {"error": "Incorrect password."})
                    failures.pop(ip, None)
                    token = secrets.token_urlsafe(32)
                    db.execute("DELETE FROM sessions WHERE expires<=? OR token=?", (time.time(), self.token()))
                    db.execute("INSERT INTO sessions VALUES (?, ?)", (hashlib.sha256(token.encode()).hexdigest(), time.time() + 28800))
                    db.commit()
                return self.reply(200, {"authenticated": True}, self.cookie(token, 28800))
            if self.path == "/api/admin/logout" and self.command == "POST":
                with lock:
                    db.execute("DELETE FROM sessions WHERE token=?", (self.token(),))
                    db.commit()
                return self.reply(200, {"authenticated": False}, self.cookie("", 0))
            if self.path != "/api/learn" or self.command != "PUT":
                return self.reply(404, {"error": "Not found."})
            if not self.authenticated():
                return self.reply(401, {"error": "Please sign in again."})
            entries = data.get("entries")
            previous = {entry["id"]: entry for entry in self.state(private=True)["entries"]}
            try:
                if not isinstance(entries, list) or len(entries) > 100:
                    raise ValueError()
                cleaned = []
                ids = set()
                for entry in entries:
                    if not isinstance(entry, dict):
                        raise ValueError()
                    title, description = entry.get("title"), entry.get("description")
                    level = entry.get("level", "")
                    identity = entry.get("id") or secrets.token_hex(12)
                    existing = previous.get(identity, {}) if isinstance(identity, str) else {}
                    language = entry.get("language", existing.get("language", "python"))
                    solution = entry.get("solution", existing.get("solution", ""))
                    translated = {key: entry.get(key, existing.get(key, ""))
                                  for key in ("title_en", "description_en", "solution_en")}
                    for key, limit in (("title_en", 100), ("description_en", 2000), ("solution_en", 20000)):
                        if not isinstance(translated[key], str) or len(translated[key]) > limit:
                            raise ValueError()
                    released = entry.get("solution_released", existing.get("solution_released", False))
                    visible = entry.get("visible", existing.get("visible", True))
                    starters = {key: entry.get(key, existing.get(key, "")) for key in ("starter_code", "starter_code_en")}
                    if type(visible) is not bool or any(not isinstance(value, str) or len(value)>10000 for value in starters.values()):
                        raise ValueError()
                    if not isinstance(identity, str) or len(identity) > 100 or identity in ids:
                        raise ValueError()
                    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 100 or not isinstance(description, str) or not 1 <= len(description.strip()) <= 2000:
                        raise ValueError()
                    if not isinstance(level, str) or len(level.strip()) > 60:
                        raise ValueError()
                    if language not in ("python", "javascript"):
                        raise ValueError()
                    if not isinstance(solution, str) or len(solution) > 20000 or type(released) is not bool or (released and not solution.strip()):
                        raise ValueError()
                    ids.add(identity)
                    cleaned.append({"id": identity, "title": title.strip(), "description": description.strip(), "level": level.strip(), "language": language, "solution": solution, "solution_released": released, "visible": visible, **translated, **starters})
            except ValueError:
                return self.reply(400, {"error": "Each task needs a title and description (up to 100 tasks)."})
            with lock:
                current = db.execute("SELECT version FROM state WHERE id=1").fetchone()[0]
                if type(data.get("version")) is not int or data["version"] != current:
                    return self.reply(409, {"error": "The list changed elsewhere. Cancel to reload it before editing again."})
                db.execute("UPDATE state SET version=?,entries=? WHERE id=1", (current+1, json.dumps(cleaned)))
                db.commit()
            self.reply(200, {"version": current+1, "entries": cleaned})

        do_POST = mutate
        do_PUT = mutate

        def account_mutation(self, data):
            if self.command != "POST":
                return self.reply(405,{"error":"POST required."})
            action=self.path.removeprefix("/api/account/")
            if action in ("register","login"):
                username=data.get("username","")
                password=data.get("password","")
                if not isinstance(username,str) or not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}",username) or not isinstance(password,str) or not 8<=len(password)<=256:
                    return self.reply(400,{"error":"Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, . _ -). Passwort: 8–256 Zeichen."})
                username=username.lower()
                key="account:"+action+":"+self.headers.get("X-Real-IP",self.client_address[0])+(':'+username if action=="login" else '')
                with lock:
                    attempts=[stamp for stamp in failures.get(key,[]) if stamp>time.time()-300]
                    if len(attempts)>=(20 if action=="login" else 120):
                        return self.reply(429,{"error":"Zu viele Versuche. Bitte in fünf Minuten erneut versuchen."})
                    failures[key]=attempts+[time.time()]
                    row=db.execute("SELECT id,password FROM users WHERE username=?",(username,)).fetchone()
                    if action=="register":
                        if row:
                            return self.reply(409,{"error":"Dieser Benutzername ist bereits vergeben."})
                        user_id=secrets.token_hex(16)
                        db.execute("INSERT INTO users VALUES (?,?,?)",(user_id,username,password_hash(password)))
                    else:
                        # Perform the same expensive hash even for unknown users.
                        stored=row[1] if row else encoded_password
                        if not hmac.compare_digest(password_hash(password,stored.split(":")[0]),stored) or not row:
                            return self.reply(401,{"error":"Benutzername oder Passwort falsch."})
                        user_id=row[0]
                        failures.pop(key,None)
                    token=secrets.token_urlsafe(32)
                    db.execute("DELETE FROM user_sessions WHERE expires<=? OR token=?",(time.time(),self.token("pyjs_user")))
                    db.execute("INSERT INTO user_sessions VALUES (?,?,?)",(hashlib.sha256(token.encode()).hexdigest(),user_id,time.time()+2592000))
                    db.commit()
                return self.reply(200,{"user":{"id":user_id,"username":username}},self.cookie(token,2592000,"pyjs_user"))
            if action=="logout":
                with lock:
                    db.execute("DELETE FROM user_sessions WHERE token=?",(self.token("pyjs_user"),))
                    db.commit()
                return self.reply(200,{"user":None},self.cookie("",0,"pyjs_user"))
            user=self.user()
            if not user:
                return self.reply(401,{"error":"Bitte erneut anmelden."})
            if action=="password":
                if data.get("userId")!=user["id"]:
                    return self.reply(409,{"error":"Das Konto wurde in einem anderen Tab gewechselt. Bitte erneut anmelden."})
                current,new=data.get("currentPassword"),data.get("newPassword")
                if not isinstance(current,str) or not 8<=len(current)<=256 or not isinstance(new,str) or not 8<=len(new)<=256:
                    return self.reply(400,{"error":"Das neue Passwort muss 8–256 Zeichen lang sein."})
                with lock:
                    key="password-change:"+user["id"]
                    attempts=[stamp for stamp in failures.get(key,[]) if stamp>time.time()-300]
                    if len(attempts)>=10:
                        return self.reply(429,{"error":"Zu viele Versuche. Bitte in fünf Minuten erneut versuchen."})
                    row=db.execute("SELECT u.password FROM users u JOIN user_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token=? AND s.expires>?",(user["id"],self.token("pyjs_user"),time.time())).fetchone()
                    if not row:
                        return self.reply(401,{"error":"Bitte erneut anmelden."})
                    if not hmac.compare_digest(password_hash(current,row[0].split(":")[0]),row[0]):
                        failures[key]=attempts+[time.time()]
                        return self.reply(403,{"error":"Das aktuelle Passwort ist falsch."})
                    token=secrets.token_urlsafe(32)
                    db.execute("UPDATE users SET password=? WHERE id=?",(password_hash(new),user["id"]))
                    db.execute("DELETE FROM user_sessions WHERE user_id=?",(user["id"],))
                    db.execute("INSERT INTO user_sessions VALUES (?,?,?)",(hashlib.sha256(token.encode()).hexdigest(),user["id"],time.time()+2592000))
                    db.commit()
                    failures.pop(key,None)
                return self.reply(200,{"user":user},self.cookie(token,2592000,"pyjs_user"))
            if action!="results":
                return self.reply(404,{"error":"Not found."})
            if data.get("userId")!=user["id"]:
                return self.reply(409,{"error":"Das Konto wurde in einem anderen Tab gewechselt. Bitte erneut anmelden."})
            try:
                upsert,deleted=data.get("upsert",[]),data.get("deleted",[])
                if not isinstance(upsert,list) or len(upsert)>1000 or not isinstance(deleted,list) or len(deleted)>1000:
                    raise ValueError()
                for result in upsert:
                    if not isinstance(result,dict):
                        raise ValueError()
                    for field,limit in (("id",100),("challengeId",100),("title",200),("code",200000),("output",200000),("savedAt",40)):
                        value=result.get(field)
                        if not isinstance(value,str) or len(value)>limit or (not value and field not in ("code","output")):
                            raise ValueError()
                    if result.get("language") not in ("python","javascript") or result.get("runStatus","Not run") not in ("Done","Error","Cancelled","Not run"):
                        raise ValueError()
                    datetime.fromisoformat(result["savedAt"].replace("Z","+00:00"))
                    for field,limit in (("description",10000),("filename",255)):
                        if not isinstance(result.get(field,""),str) or len(result.get(field,""))>limit:
                            raise ValueError()
                if any(not isinstance(identity,str) or not 1<=len(identity)<=100 for identity in deleted):
                    raise ValueError()
            except (ValueError,TypeError):
                return self.reply(400,{"error":"Ungültige Ergebnisdaten."})
            with lock:
                existing={row[0] for row in db.execute("SELECT id FROM user_results WHERE user_id=?",(user["id"],))}
                if len((existing-set(deleted))|{r["id"] for r in upsert})>1000:
                    return self.reply(400,{"error":"Maximal 1000 gespeicherte Ergebnisse pro Konto."})
                db.executemany("DELETE FROM user_results WHERE user_id=? AND id=?",[(user["id"],identity) for identity in deleted])
                db.executemany("INSERT INTO user_results VALUES (?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET result=excluded.result",[(user["id"],r["id"],json.dumps(r)) for r in upsert])
                db.commit()
                results=self.user_results(user["id"])
            self.reply(200,{"user":user,"results":results})

    server = ThreadingHTTPServer(address, Handler)
    server.daemon_threads = True
    server.database = db
    return server


if __name__ == "__main__":
    create_server(("0.0.0.0", int(os.environ.get("PORT", "8766"))), os.environ.get("PYJS_DB", "learn.sqlite3"), os.environ["PYJS_ADMIN_PASSWORD_HASH"], os.environ.get("PYJS_SECURE_COOKIE", "1") == "1", os.environ.get("PYJS_STATIC_DIR")).serve_forever()
