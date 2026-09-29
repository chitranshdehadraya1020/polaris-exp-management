import json
import math
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
NSF_NEWS_RSS = "https://www.nsf.gov/rss/rss_www_news.xml"


def _get_json(url, timeout=10):
    req = Request(url, headers={"User-Agent": "POLAR-Expedition-Management/1.0"})
    try:
        with urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"External service unavailable: {exc}")


def fetch_weather(latitude, longitude):
    params = urlencode({
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility",
        "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,visibility,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
        "forecast_days": 3,
        "timezone": "auto",
    })
    payload = _get_json(f"{OPEN_METEO_URL}?{params}")
    current = payload.get("current") or {}
    return {
        "source": "Open-Meteo",
        "latitude": latitude,
        "longitude": longitude,
        "timezone": payload.get("timezone"),
        "updated_at": current.get("time"),
        "current": current,
        "daily": payload.get("daily") or {},
    }


def interpolate_position(start_lat, start_lon, end_lat, end_lon, period_seconds=900):
    """Deterministic demo telemetry for a moving cargo item.

    This is explicitly simulated and must not be presented as hardware GPS.
    A real tracker can send coordinates through POST /api/live/gps.
    """
    phase = (time.time() % period_seconds) / period_seconds
    progress = 0.5 - 0.5 * math.cos(2 * math.pi * phase)
    lat = start_lat + (end_lat - start_lat) * progress
    lon = start_lon + (end_lon - start_lon) * progress
    return lat, lon, progress


def fetch_research_updates(limit=8):
    """Fetch recent polar-relevant research/news updates from NSF RSS.

    NSF publishes an official news RSS feed. We filter the general feed to
    polar/Antarctic/Arctic/research terms so unrelated NSF stories do not
    dominate the POLAR dashboard.
    """
    req = Request(NSF_NEWS_RSS, headers={"User-Agent": "POLAR-Expedition-Management/1.0"})
    try:
        with urlopen(req, timeout=10) as response:
            raw = response.read()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"Research feed unavailable: {exc}")

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise RuntimeError(f"Research feed could not be parsed: {exc}")

    terms = (
        "antarctic", "antarctica", "arctic", "polar", "ice", "glacier",
        "sea ice", "climate", "ocean", "cryosphere", "snow", "research"
    )
    items = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        description = (item.findtext("description") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        haystack = f"{title} {description}".lower()
        if any(term in haystack for term in terms):
            items.append({
                "title": title,
                "summary": description,
                "url": link,
                "published_at": pub_date,
                "source": "U.S. National Science Foundation",
            })
        if len(items) >= limit:
            break
    return {
        "source": "NSF News RSS",
        "feed_url": NSF_NEWS_RSS,
        "updated_at_epoch": time.time(),
        "items": items,
    }
