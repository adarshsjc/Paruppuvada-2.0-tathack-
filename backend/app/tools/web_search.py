from html.parser import HTMLParser
from base64 import urlsafe_b64decode
import re
from typing import Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import requests

SEARCH_URL = "https://www.bing.com/search"
QUERY_STOP_WORDS = {
    "a", "about", "and", "answer", "are", "can", "could", "do", "does", "find",
    "for", "from", "give", "how", "i", "in", "include", "internet", "into", "is",
    "it", "me", "my", "of", "on", "or", "please", "provide", "search", "show",
    "solution", "source", "sources", "tell", "task", "that", "the", "this", "to",
    "trustworthy", "use", "using", "web", "what", "when", "where", "which", "who", "why",
    "with", "would", "you", "your", "configure", "implement", "write", "create",
    "documentation", "official", "marker", "explain", "explains", "explaining",
}


class _SearchResultsParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results: List[Dict[str, str]] = []
        self._current: Optional[Dict[str, str]] = None
        self._capture: Optional[str] = None
        self._capture_depth = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = attributes.get("class", "").split()
        if tag == "li" and "b_algo" in classes:
            self._current = {"title": "", "url": "", "snippet": ""}
            self.results.append(self._current)
        elif self._current and tag == "h2":
            self._capture = "title"
        elif self._current and tag == "a" and self._capture == "title":
            self._current["url"] = attributes.get("href", "")
        elif self._current and tag == "p" and self._current["title"]:
            self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "li" and self._current:
            self._current = None
            self._capture = None
        elif (tag == "h2" and self._capture == "title") or (
            tag == "p" and self._capture == "snippet"
        ):
            self._capture = None

    def handle_data(self, data):
        if self._current and self._capture:
            self._current[self._capture] += data


def _result_url(href: str) -> str:
    if href.startswith("//"):
        href = f"https:{href}"
    parsed = urlparse(href)
    if parsed.hostname and parsed.hostname.endswith("duckduckgo.com") and parsed.path == "/l/":
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        if target:
            href = target
    elif parsed.hostname and parsed.hostname.endswith("bing.com") and parsed.path == "/ck/a":
        target = parse_qs(parsed.query).get("u", [""])[0]
        if target.startswith("a1"):
            encoded = target[2:]
            try:
                decoded = urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
                if decoded.startswith(("http://", "https://")):
                    href = decoded
            except (UnicodeDecodeError, ValueError):
                pass
    parsed = urlparse(href)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return href


def build_search_query(request: str) -> str:
    """Keep topical terms while dropping conversational and search-instruction filler."""
    safe_request = re.sub(
        r"\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b",
        "",
        request,
    )
    terms = re.findall(r"[A-Za-z][A-Za-z0-9+#-]{1,}", safe_request)
    query_terms = [
        term for term in terms
        if term.casefold() not in QUERY_STOP_WORDS and not term.isnumeric()
    ]
    return " ".join(query_terms[:12]) or " ".join(terms[:8])


def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Search the public web and return titles, URLs, and excerpts."""
    search_query = build_search_query(query)
    response = requests.get(
        SEARCH_URL,
        params={"q": search_query},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
            )
        },
        timeout=8,
    )
    response.raise_for_status()

    parser = _SearchResultsParser()
    parser.feed(response.text)
    results = []
    seen_urls = set()
    for result in parser.results:
        url = _result_url(result["url"])
        title = " ".join(result["title"].split())
        snippet = " ".join(result["snippet"].split())
        if url and url not in seen_urls and title:
            seen_urls.add(url)
            results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= max_results:
            break
    if not results:
        raise requests.RequestException("The web search provider returned no parseable results.")
    return results
