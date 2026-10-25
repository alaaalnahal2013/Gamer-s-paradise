"""
CLIPBOARD FORMATTING & TRACKING TRASH FIXER • CLEAN PASTE INTERCEPTOR
Monitors Windows clipboard in real time.
Automatically:
1. Strips marketing tracking bloat (?utm_source=, fbclid=, gclid=, si=) from URLs.
2. Heals broken PDF line wraps and hyphenated split words.
3. Cleans ugly rich HTML formatting down to pristine plain text.
"""

import logging
import re
import threading
import time
from typing import Dict, List, Any
import urllib.parse
import pyperclip

logger = logging.getLogger("ping_radar.clean_clipboard")

# Tracking parameters to strip from URLs
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "igshid", "si", "mc_eid", "_ga", "ref", "ref_", "ocid",
    "spm", "trk", "msclkid", "dclid", "zanpid", "sc_channel", "source"
}

class CleanClipboardInterceptor:
    def __init__(self):
        self.enabled: bool = True
        self.strip_tracking: bool = True
        self.heal_pdf_wraps: bool = True
        self.strip_html: bool = True
        self.last_seen_text: str = ""
        self.items_cleaned: int = 0
        self.params_stripped_count: int = 0
        self.pdf_wraps_healed_count: int = 0
        self.recent_cleaned: List[Dict[str, Any]] = []
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

    def clean_url(self, url: str) -> tuple[str, int]:
        """Strips tracking query parameters from a single URL."""
        try:
            parsed = urllib.parse.urlsplit(url)
            if not parsed.query:
                return url, 0

            query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            cleaned_pairs = []
            stripped = 0

            for k, v in query_pairs:
                if k.lower() in TRACKING_PARAMS or k.lower().startswith("utm_"):
                    stripped += 1
                else:
                    cleaned_pairs.append((k, v))

            if stripped == 0:
                return url, 0

            new_query = urllib.parse.urlencode(cleaned_pairs)
            new_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
            return new_url, stripped
        except Exception:
            return url, 0

    def clean_text_content(self, text: str) -> tuple[str, Dict[str, Any]]:
        """Processes raw text through clean filters."""
        if not text or not isinstance(text, str):
            return text, {}

        original = text
        stripped_params = 0
        healed_pdf = False
        cleaned_html = False

        # 1. Clean URLs inside text
        if self.strip_tracking:
            url_pattern = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+')
            def replace_url(match):
                nonlocal stripped_params
                cleaned, count = self.clean_url(match.group(0))
                stripped_params += count
                return cleaned
            text = url_pattern.sub(replace_url, text)

        # 2. Heal broken PDF line wraps & hyphens
        if self.heal_pdf_wraps:
            # First stitch words split across lines with hyphen: "inter-\nceptor" -> "interceptor"
            healed_hyphens = re.sub(r'([a-zA-Z]+)-\r?\n([a-zA-Z]+)', r'\1\2', text)
            # Next convert single linebreaks inside sentences to single spaces, preserving double newlines (paragraphs)
            # Replaces single newline that does NOT follow a period or colon, followed by lowercase or normal word
            healed_lines = re.sub(r'([^\.\!\?\:\n])\r?\n([a-zA-Z0-9])', r'\1 \2', healed_hyphens)
            if healed_lines != text:
                healed_pdf = True
                text = healed_lines

        # 3. Strip HTML tags if present (e.g. copied from messy rich text)
        if self.strip_html and ('<' in text and '>' in text):
            # Check if looks like HTML
            if re.search(r'<\/?(?:span|div|p|b|i|font|table|tr|td|a|h[1-6]|style|script)\b[^>]*>', text, re.IGNORECASE):
                no_tags = re.sub(r'<[^>]+>', '', text)
                no_tags = re.sub(r'&nbsp;', ' ', no_tags)
                no_tags = re.sub(r'&amp;', '&', no_tags)
                no_tags = re.sub(r'&lt;', '<', no_tags)
                no_tags = re.sub(r'&gt;', '>', no_tags)
                if no_tags != text:
                    cleaned_html = True
                    text = no_tags

        is_modified = (text != original)
        details = {
            "was_modified": is_modified,
            "stripped_params": stripped_params,
            "healed_pdf": healed_pdf,
            "cleaned_html": cleaned_html
        }
        return text, details

    def start(self):
        if self.enabled and self._thread and self._thread.is_alive():
            return
        self.enabled = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True, name="CleanClipboard")
        self._thread.start()
        logger.info("Clean Paste Interceptor started (polling clipboard)")

    def stop(self):
        self.enabled = False
        self._stop_event.set()
        logger.info("Clean Paste Interceptor stopped")

    def _monitor_loop(self):
        while not self._stop_event.is_set():
            try:
                current = pyperclip.paste()
                if current and current != self.last_seen_text:
                    self.last_seen_text = current
                    cleaned, details = self.clean_text_content(current)

                    if details.get("was_modified"):
                        # Put clean text back into clipboard!
                        pyperclip.copy(cleaned)
                        self.last_seen_text = cleaned  # avoid loop

                        with self._lock:
                            self.items_cleaned += 1
                            self.params_stripped_count += details.get("stripped_params", 0)
                            if details.get("healed_pdf"):
                                self.pdf_wraps_healed_count += 1

                            self.recent_cleaned.insert(0, {
                                "id": int(time.time() * 1000),
                                "original_snippet": current[:100] + ("..." if len(current) > 100 else ""),
                                "cleaned_snippet": cleaned[:100] + ("..." if len(cleaned) > 100 else ""),
                                "stripped_params": details.get("stripped_params", 0),
                                "healed_pdf": details.get("healed_pdf", False),
                                "cleaned_html": details.get("cleaned_html", False),
                                "timestamp": time.strftime("%H:%M:%S")
                            })
                            if len(self.recent_cleaned) > 30:
                                self.recent_cleaned.pop()

                        logger.info(f"Clean Paste Interceptor: Cleaned clipboard content (params: {details.get('stripped_params')}, PDF heal: {details.get('healed_pdf')})")

            except Exception:
                pass

            time.sleep(0.3)  # 300ms cycle

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "enabled": self.enabled,
                "strip_tracking": self.strip_tracking,
                "heal_pdf_wraps": self.heal_pdf_wraps,
                "strip_html": self.strip_html,
                "items_cleaned": self.items_cleaned,
                "params_stripped_count": self.params_stripped_count,
                "pdf_wraps_healed_count": self.pdf_wraps_healed_count,
                "recent_cleaned": list(self.recent_cleaned)
            }

clean_clipboard = CleanClipboardInterceptor()
