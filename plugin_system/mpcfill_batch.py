"""Reviewable, scoped MPCFill batch choices. Originals download only on apply."""
from contextlib import closing
from uuid import uuid4

from flask import jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from . import mpcfill
from .mpcfill_selection import best_match, criteria_from, eligible, preference_misses


def register_mpcfill_batch_routes(app, editor_class, get_connection, isolation_guard, get_epoch, api_route):
    signer = URLSafeTimedSerializer(app.secret_key, salt="mpcfill-batch-v1")

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("Expected batch options.")
        mpcfill.require_ready()
        return value

    def editor_for(data):
        owner = data.get("owner") or {}
        if not isinstance(owner, dict):
            raise ValueError("Invalid image owner.")
        return editor_class(str(owner.get("kind") or ""), str(owner.get("id") or ""))

    def scope_for(editor, conn):
        return dict(token=editor.repository(conn).context.scope_id or "global",
                    epoch=get_epoch(editor.owner_kind, editor.owner_id, conn) if editor.owner_kind else 0)

    def snapshot(editor, uuid, face, scope):
        with closing(get_connection()) as conn:
            conn.execute("BEGIN")
            current_scope = scope_for(editor, conn)
            if current_scope != scope:
                raise RuntimeError("The collection's image library changed. Close the batch and review new matches.")
            card = conn.execute("SELECT * FROM chaos_cards WHERE card_uuid = ?", (uuid,)).fetchone()
            if card is None:
                raise LookupError("This card no longer exists.")
            repository = editor.repository(conn)
            active = repository.find_enabled(card, face)
            signature = dict(active) if active else None
            return dict(card), signature, [dict(row) for row in repository.list_for_card(uuid)]

    @app.post("/plugins/mpcfill-browser/batch/context")
    @api_route
    def mpcfill_batch_context():
        editor = editor_for(body())
        with isolation_guard(), closing(get_connection()) as conn:
            conn.execute("BEGIN")
            return jsonify(ok=True, scope=scope_for(editor, conn))

    @app.post("/plugins/mpcfill-browser/batch/match")
    @api_route
    def mpcfill_batch_match():
        data = body()
        uuid = str(data.get("card_uuid") or "")
        editor = editor_for(data)
        criteria = criteria_from(data.get("criteria"), mpcfill.favorite_creators())
        scope = data.get("scope")
        with isolation_guard():
            card, _, _ = snapshot(editor, uuid, "front", scope)
            dual = bool(card.get("is_dual_faced"))
            faces = ["front", "back"] if dual else ["single"]
            if criteria["faces"] != "both":
                faces = [face for face in faces if face == criteria["faces"] or face == "single" and criteria["faces"] == "front"]
            snapshots = {face: snapshot(editor, uuid, face, scope)[1] for face in faces}
        rows = []
        for face in faces:
            name = (card.get(face + "_face_name") or card["card_name"].split(" // ")[0 if face == "front" else -1]) if dual else card["card_name"]
            row = dict(card_uuid=uuid, name=name, face=face, status="skipped")
            if snapshots[face] and not criteria["replace_existing"]:
                rows.append(dict(row, message="Already has an alternate image"))
                continue
            result = mpcfill.search(name, "TOKEN" if "token" in str(card.get("type_line") or "").lower() else "CARD")
            match = best_match(result["cards"], criteria)
            if not match:
                rows.append(dict(row, message="No artwork meets the required criteria" if result["cards"] else "No MPCFill artwork found"))
                continue
            ticket = dict(card_uuid=uuid, face=face, key=match["key"], owner=data.get("owner"), scope=scope,
                          previous=snapshots[face], criteria=criteria, operation_id=uuid4().hex)
            misses = preference_misses(match, criteria)
            rows.append(dict(row, status="ready", artwork=match, ticket=signer.dumps(ticket),
                             fallback=bool(misses), message="; ".join(misses) if misses else "Meets all preferences",
                             stale=result.get("stale", False)))
        if not faces:
            rows.append(dict(card_uuid=uuid, name=card["card_name"], face="single", status="skipped", message="No back face to update"))
        return jsonify(ok=True, rows=rows)

    @app.post("/plugins/mpcfill-browser/batch/apply")
    @api_route
    def mpcfill_batch_apply():
        data = body()
        try:
            ticket = signer.loads(str(data.get("ticket") or ""), max_age=24 * 60 * 60)
        except BadSignature:
            raise ValueError("This selection expired or changed. Find matches again.") from None
        editor = editor_for(ticket)
        editor.expected_scope = ticket["scope"]["token"]
        uuid, face = ticket["card_uuid"], ticket["face"]
        marker = "MPCFill batch: " + ticket["operation_id"]

        def validate():
            _, active, sources = snapshot(editor, uuid, face, ticket["scope"])
            # A lost HTTP response can be retried without adding another source.
            if any(marker in (source.get("notes") or "").splitlines() for source in sources):
                return True
            if active != ticket["previous"]:
                raise RuntimeError("This card's artwork changed after review. Find matches again before applying it.")
            return False

        with isolation_guard():
            already_applied = validate()
        if not already_applied:
            record = mpcfill.record_for(ticket["key"])
            if not eligible(record, ticket["criteria"]):
                raise ValueError("This artwork no longer meets the required criteria. Find matches again.")
            # Network I/O is outside the image lock. Recheck the scope and
            # source after the download before the normal full-bleed import.
            mpcfill.image_path(ticket["key"], "original")
            with isolation_guard():
                already_applied = validate()
                if not already_applied:
                    editor.add_from_form(uuid, form=dict(mpcfill_key=ticket["key"], face_kind=face,
                                         export_frame_template="auto", mpcfill_batch_id=ticket["operation_id"]))
        return jsonify(**editor.payload(uuid), already_applied=already_applied)
