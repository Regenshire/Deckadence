"""Deterministic MPCFill eligibility and ranking, independent of downloads."""
import re


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", str(value).casefold())


def tag_names(card):
    return [str(tag) for tag in (card.get("tags") or []) if isinstance(tag, str)]


def is_ai_art(card):
    # MPCFill's AI Art aliases and descendants, including AI-created frames.
    # Use whole tags: "Fantasy" and "Fairy" must never match the letters AI.
    return any(normalized(tag) in {"ai", "aiart", "airemaster", "aiframe", "midjourney", "genai"}
               for tag in tag_names(card))


def criteria_from(data, favorites):
    if not isinstance(data, dict):
        raise ValueError("Expected selection criteria.")
    result = {}
    for field in ("exclude_ai", "prioritize_favorites", "strict", "only_creators", "replace_existing"):
        value = data.get(field, False)
        if not isinstance(value, bool):
            raise ValueError("Invalid selection option: " + field)
        result[field] = value
    for field in ("tags", "creators"):
        value = data.get(field, [])
        if not isinstance(value, list) or len(value) > 250 or any(not isinstance(v, str) or len(v) > 200 for v in value):
            raise ValueError("Choose valid " + field + ".")
        result[field] = list(dict.fromkeys(v for v in value if v))
    result["target_dpi"] = str(data.get("target_dpi", "highest"))
    if result["target_dpi"] not in {"highest", "300", "600", "800", "1200"}:
        raise ValueError("Choose a supported target DPI.")
    result["favorite_ids"] = sorted(str(item["id"]) for item in favorites)
    result["preferred_creator"] = str(data.get("preferred_creator") or "")
    if result["preferred_creator"] and result["preferred_creator"] not in result["favorite_ids"]:
        raise ValueError("Choose a favorite creator, or clear the specific creator preference.")
    if result["prioritize_favorites"] and not result["favorite_ids"]:
        raise ValueError("Star a creator first, or turn off Prioritize favorite creators.")
    if result["only_creators"] and not result["creators"]:
        raise ValueError("Select at least one allowed creator.")
    result["language"] = str(data.get("language") or "")
    if len(result["language"]) > 30:
        raise ValueError("Choose a valid language.")
    result["faces"] = data.get("faces", "both")
    if result["faces"] not in {"both", "front", "back"}:
        raise ValueError("Choose which card faces to update.")
    return result


def preference_misses(card, criteria):
    misses = []
    source = str(card.get("sourceId"))
    if criteria["preferred_creator"] and source != criteria["preferred_creator"]:
        misses.append("Specific favorite unavailable")
    if criteria["prioritize_favorites"] and source not in criteria["favorite_ids"]:
        misses.append("Not a favorite creator")
    available_tags = {normalized(t) for t in tag_names(card)}
    missing_tags = [t for t in criteria["tags"] if normalized(t) not in available_tags]
    if missing_tags:
        misses.append("Missing tags: " + ", ".join(missing_tags))
    if criteria["target_dpi"] != "highest" and float(card.get("dpi") or 0) < int(criteria["target_dpi"]):
        misses.append("Below target DPI")
    return misses


def eligible(card, criteria):
    if criteria["exclude_ai"] and is_ai_art(card):
        return False
    if criteria["only_creators"] and str(card.get("sourceId")) not in criteria["creators"]:
        return False
    if criteria["language"] and card.get("language") != criteria["language"]:
        return False
    return not criteria["strict"] or not preference_misses(card, criteria)


def best_match(cards, criteria):
    candidates = [card for card in cards if eligible(card, criteria)]
    def rank(card):
        source = str(card.get("sourceId"))
        tags = {normalized(t) for t in tag_names(card)}
        dpi = float(card.get("dpi") or 0)
        target = criteria["target_dpi"]
        # Numeric targets prefer the nearest DPI at or above the target;
        # otherwise the highest available. Highest has no upper bound.
        resolution = (1, dpi) if target == "highest" else (int(dpi >= int(target)), -dpi if dpi >= int(target) else dpi)
        return (int(bool(criteria["preferred_creator"]) and source == criteria["preferred_creator"]),
                int(criteria["prioritize_favorites"] and source in criteria["favorite_ids"]),
                sum(normalized(t) in tags for t in criteria["tags"]), *resolution)
    # Stable cache keys break ties independently of upstream result order.
    candidates.sort(key=lambda card: card["key"])
    candidates.sort(key=rank, reverse=True)
    return candidates[0] if candidates else None
