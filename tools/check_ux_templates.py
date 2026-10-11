"""Read-only release check: parse every Jinja template and inventory page routes."""
import ast
import json
from pathlib import Path

from jinja2 import Environment, TemplateSyntaxError

ROOT = Path(__file__).resolve().parents[1]


def inspect_templates():
    environment = Environment()
    results = []
    for path in sorted((ROOT / "templates").glob("*.html")):
        record = {"template": path.name, "status": "pass"}
        try:
            environment.parse(path.read_text(encoding="utf-8"))
        except TemplateSyntaxError as error:
            record.update(status="fail", line=error.lineno, error=error.message)
        results.append(record)
    return results


def inspect_routes():
    source = ast.parse((ROOT / "app.py").read_text(encoding="utf-8-sig"))
    pages = {}
    for node in source.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        routes = []
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute) and decorator.func.attr == "route":
                if decorator.args and isinstance(decorator.args[0], ast.Constant):
                    routes.append(decorator.args[0].value)
        for call in ast.walk(node):
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == "render_template":
                if call.args and isinstance(call.args[0], ast.Constant):
                    pages.setdefault(call.args[0].value, []).append({"function": node.name, "routes": routes, "line": call.lineno})
    return pages


if __name__ == "__main__":
    report = {"templates": inspect_templates(), "page_routes": inspect_routes()}
    destination = ROOT / "docs/ux-review/template-check.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failures = [entry for entry in report["templates"] if entry["status"] != "pass"]
    print(f"Parsed {len(report['templates'])} templates; {len(failures)} failure(s).")
    for entry in failures:
        print(f"{entry['template']}:{entry['line']}: {entry['error']}")
    raise SystemExit(bool(failures))
