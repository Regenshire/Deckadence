"""Read-only UI scenarios, installed only by the isolated UX review server."""
from pathlib import Path

from flask import abort, g, render_template, render_template_string, request, send_file


class UXReviewFixtures:
    def __init__(self, application):
        self.application = application

    def register(self):
        self.application.app.add_url_rule(
            "/ux-fixture/<scenario>", "ux_fixture", self.render,
        )

    @staticmethod
    def repaired_pack_source():
        source = (Path(__file__).resolve().parents[1] / "templates/chaos_pack_view.html").read_text(encoding="utf-8")
        old = '''                {% if card.sheet_is_foil %}
                <div class="chaos-pack-view-badges">
                    <span class="chaos-pack-view-badge">Foil</span>
                </div>
                {% endif %}
                    {% for badge in card.special_badges %}
                    <span class="chaos-pack-view-badge">{{ badge }}</span>
                    {% endfor %}
                </div>
                {% endif %}'''
        new = '''                {% if card.sheet_is_foil or card.special_badges %}
                <div class="chaos-pack-view-badges">
                    {% if card.sheet_is_foil %}
                    <span class="chaos-pack-view-badge">Foil</span>
                    {% endif %}
                    {% for badge in card.special_badges %}
                    <span class="chaos-pack-view-badge">{{ badge }}</span>
                    {% endfor %}
                </div>
                {% endif %}'''
        if old in source:
            return source.replace(old, new, 1)
        if new in source:
            return source
        raise ValueError("Pack template changed; review fixture needs rebasing.")

    def render(self, scenario):
        app = self.application
        if scenario == "card-art":
            return send_file(Path(__file__).resolve().parents[1] / "data/image_cache/Serra_Redeemer_dmu.jpg")
        if scenario in {"chaos", "preprint"}:
            g._config_cache = dict(app.get_request_config())
            g._config_cache["chaos_draft_mode"] = "chaos_draft" if scenario == "chaos" else "preprint_chaos_draft"
            return app.play_draft()
        if scenario == "first-run":
            return render_template("home.html", card_database_ready=False)
        if scenario == "momir-empty":
            return render_template("result.html", card=None, mana_value="3", card_database_ready=True,
                                   current_game_mode="momir_basic", enabled_type_options=[],
                                   selected_type_value="", card_print_href="", open_print_in_new_tab=False)
        if scenario in {"momir-card", "momir-select", "tower-card"}:
            rendered = render_template("result.html",
                card=dict(card_key="ux-fixture", name="Review creature", type_line="Creature — Review",
                          image_blob=None, image_url="fixture-image-not-copied"),
                mana_value="3", card_database_ready=True,
                current_game_mode="tower_of_power" if scenario == "tower-card" else
                    "momir_select" if scenario == "momir-select" else "momir_basic",
                enabled_type_options=[dict(value="creature", label="Creature"), dict(value="artifact", label="Artifact")],
                selected_type_value="creature", card_print_href="/ux-review/demos.html#output",
                open_print_in_new_tab=False)
            return rendered.replace('/card-image/ux-fixture', '/ux-fixture/card-art')
        if scenario == "backup-progress":
            return render_template("backup_in_progress.html")
        if scenario == "pack-fixed":
            foil = request.args.get("foil") == "1"
            badges = ["Review special badge"] if request.args.get("special") == "1" else []
            return render_template_string(self.repaired_pack_source(),
                pack_display_name="Review fixture — proposed template repair", pack_total_cards=1,
                bonus_pack_opened=False, display_pack_prices=False,
                cards=[dict(card_uuid="ux-fixture", card_name="Review card", tracked_pack_card_id=0,
                            sheet_is_foil=foil, special_badges=badges)])
        abort(404)
