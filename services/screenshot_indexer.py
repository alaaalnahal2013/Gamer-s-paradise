"""
SCREENSHOT GRAVEYARD FIXER • SMART SCREENSHOT INDEXER
Monitors screenshots directory via watchdog.
Automatically extracts text inside screenshots using AI OCR (winocr) and stores
them in a searchable local SQLite database.
Auto-detects receipts, Wi-Fi credentials, error logs, and code snippets,
offering smart content-based auto-renaming and instant keyword search.
"""

import asyncio
import logging
import os
import re
import sqlite3
import threading
import time
from typing import Dict, List, Optional, Any
from pathlib import Path
from PIL import Image
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import winocr

logger = logging.getLogger("ping_radar.screenshot_indexer")

DEFAULT_SCREENSHOT_DIR = os.path.join(os.path.expanduser("~"), "Pictures", "Screenshots")
DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots.db")

class ScreenshotHandler(FileSystemEventHandler):
    def __init__(self, indexer):
        self.indexer = indexer

    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp')):
            # Allow file to finish writing
            threading.Timer(1.0, lambda: self.indexer.index_single_file(event.src_path)).start()


class ScreenshotIndexer:
    def __init__(self, watch_dir: Optional[str] = None):
        self.watch_dir = watch_dir if watch_dir and os.path.exists(watch_dir) else DEFAULT_SCREENSHOT_DIR
        self.observer: Optional[Observer] = None
        self.is_watching: bool = False
        self._db_lock = threading.Lock()
        self._init_db()
        self.auto_rename_enabled: bool = False

    def _init_db(self):
        with self._db_lock:
            conn = sqlite3.connect(DB_FILE)
            cur = conn.cursor()
            cur.execute('''
                CREATE TABLE IF NOT EXISTS screenshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT UNIQUE,
                    file_path TEXT,
                    file_size INTEGER,
                    width INTEGER,
                    height INTEGER,
                    created_at TEXT,
                    extracted_text TEXT,
                    category TEXT,
                    suggested_name TEXT
                )
            ''')
            conn.commit()
            conn.close()

    def categorize_text(self, text: str) -> tuple[str, str]:
        """Classifies text into category and generates a smart suggested filename."""
        t_low = text.lower()
        date_str = time.strftime("%Y-%m-%d")

        if any(k in t_low for k in ["total", "subtotal", "invoice", "receipt", "payment", "order #", "usd", "eur", "$"]):
            # Find dollar or total amount if possible
            amt_match = re.search(r'(\$\s*[0-9]+(?:\.[0-9]{2})?)', text)
            amt = amt_match.group(1).replace(" ", "") if amt_match else "Receipt"
            return "Receipt", f"{date_str}_Receipt_{amt}.png"

        if any(k in t_low for k in ["wifi", "wi-fi", "password", "ssid", "wpa2", "wpa3", "network security key"]):
            return "Wi-Fi & Credentials", f"{date_str}_WiFi_Credentials.png"

        if any(k in t_low for k in ["error", "exception", "traceback", "failed", "crash", "critical", "status 500", "404"]):
            # Extract first error phrase
            err_match = re.search(r'(error[:\s]+[^\n]+)', text, re.IGNORECASE)
            err_title = re.sub(r'[^a-zA-Z0-9_-]', '_', err_match.group(1)[:30]) if err_match else "Error"
            return "Error Log", f"{date_str}_{err_title}.png"

        if any(k in t_low for k in ["import ", "function ", "class ", "const ", "def ", "select *", "git clone"]):
            return "Code Snippet", f"{date_str}_Code_Snippet.png"

        # General
        first_line = re.sub(r'[^a-zA-Z0-9_-]', '_', text.split('\n')[0][:25]).strip('_') if text else "Screenshot"
        return "General", f"{date_str}_{first_line or 'Screenshot'}.png"

    def index_single_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        clean_path = os.path.abspath(file_path)
        if not os.path.exists(clean_path):
            return None

        filename = os.path.basename(clean_path)

        # Check if already indexed
        with self._db_lock:
            conn = sqlite3.connect(DB_FILE)
            cur = conn.cursor()
            cur.execute("SELECT id FROM screenshots WHERE file_path = ?", (clean_path,))
            row = cur.fetchone()
            conn.close()
            if row:
                return None

        try:
            stat = os.stat(clean_path)
            created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
            file_size = stat.st_size

            img = Image.open(clean_path)
            width, height = img.size

            # Run OCR
            extracted_text = ""
            try:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                res = loop.run_until_complete(winocr.recognize_pil(img, 'en'))
                extracted_text = res.text.strip()
                loop.close()
            except Exception as e:
                logger.warning(f"OCR failed for {filename}: {e}")

            category, suggested_name = self.categorize_text(extracted_text)

            with self._db_lock:
                conn = sqlite3.connect(DB_FILE)
                cur = conn.cursor()
                cur.execute('''
                    INSERT OR REPLACE INTO screenshots
                    (filename, file_path, file_size, width, height, created_at, extracted_text, category, suggested_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (filename, clean_path, file_size, width, height, created_at, extracted_text, category, suggested_name))
                conn.commit()
                conn.close()

            logger.info(f"Screenshot Indexed: {filename} [{category}] -> {suggested_name} ({len(extracted_text)} chars)")
            return {
                "filename": filename,
                "file_path": clean_path,
                "category": category,
                "suggested_name": suggested_name,
                "extracted_text": extracted_text[:200]
            }
        except Exception as e:
            logger.error(f"Error indexing {clean_path}: {e}")
            return None

    def scan_all_existing(self) -> int:
        """Indexes all existing screenshots in watch directory."""
        if not os.path.exists(self.watch_dir):
            try:
                os.makedirs(self.watch_dir, exist_ok=True)
            except Exception:
                return 0

        count = 0
        for entry in os.scandir(self.watch_dir):
            if entry.is_file() and entry.name.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp')):
                res = self.index_single_file(entry.path)
                if res:
                    count += 1
        return count

    def search(self, query: str = "", category: str = "") -> List[Dict[str, Any]]:
        """Instant search by keyword or category."""
        with self._db_lock:
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            sql = "SELECT * FROM screenshots WHERE 1=1"
            params = []

            if query:
                sql += " AND (extracted_text LIKE ? OR filename LIKE ? OR suggested_name LIKE ?)"
                q_param = f"%{query.strip()}%"
                params.extend([q_param, q_param, q_param])

            if category and category != "All":
                sql += " AND category = ?"
                params.append(category)

            sql += " ORDER BY id DESC LIMIT 50"

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return rows

    def rename_file(self, screenshot_id: int) -> Dict[str, Any]:
        """Renames a screenshot to its smart AI-detected name."""
        with self._db_lock:
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM screenshots WHERE id = ?", (screenshot_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return {"success": False, "error": "Record not found"}

            old_path = row["file_path"]
            suggested = row["suggested_name"]
            directory = os.path.dirname(old_path)
            new_path = os.path.join(directory, suggested)

            # Avoid collision
            if os.path.exists(new_path) and new_path != old_path:
                base, ext = os.path.splitext(suggested)
                new_path = os.path.join(directory, f"{base}_{int(time.time())}{ext}")

            try:
                os.rename(old_path, new_path)
                new_filename = os.path.basename(new_path)
                cur.execute("UPDATE screenshots SET filename = ?, file_path = ? WHERE id = ?", (new_filename, new_path, screenshot_id))
                conn.commit()
                conn.close()
                return {"success": True, "old_name": row["filename"], "new_name": new_filename, "new_path": new_path}
            except Exception as e:
                conn.close()
                return {"success": False, "error": str(e)}

    def start_watcher(self):
        if self.is_watching:
            return
        if not os.path.exists(self.watch_dir):
            try:
                os.makedirs(self.watch_dir, exist_ok=True)
            except Exception:
                return

        event_handler = ScreenshotHandler(self)
        self.observer = Observer()
        self.observer.schedule(event_handler, self.watch_dir, recursive=False)
        self.observer.start()
        self.is_watching = True
        logger.info(f"Smart Screenshot Indexer watching: {self.watch_dir}")

    def stop_watcher(self):
        if self.observer and self.is_watching:
            self.observer.stop()
            self.observer.join()
            self.is_watching = False
            logger.info("Smart Screenshot Indexer stopped")

    def get_status(self) -> Dict[str, Any]:
        with self._db_lock:
            conn = sqlite3.connect(DB_FILE)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*), category FROM screenshots GROUP BY category")
            counts = {row[1]: row[0] for row in cur.fetchall()}
            cur.execute("SELECT COUNT(*) FROM screenshots")
            total = cur.fetchone()[0]
            conn.close()

        return {
            "watch_dir": self.watch_dir,
            "is_watching": self.is_watching,
            "total_indexed": total,
            "category_counts": counts
        }

screenshot_indexer = ScreenshotIndexer()
