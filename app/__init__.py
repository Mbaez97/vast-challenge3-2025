from flask import Flask, render_template, jsonify, request
import importlib
import logging

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# List of visualization modules
VISUALIZATIONS = ["time_patterns", "graph"]

# Load visualization modules
visualization_modules = {}
for viz_name in VISUALIZATIONS:
    try:
        module = importlib.import_module(f"app.visualizations.{viz_name}")
        visualization_modules[viz_name] = module
        logger.info(f"Loaded visualization module: {viz_name}")
    except ImportError as e:
        logger.error(f"Error loading visualization module {viz_name}: {e}")


@app.route("/")
def index():
    viz_list = []
    for name in VISUALIZATIONS:
        if name in visualization_modules:
            viz_list.append(
                {
                    "name": name,
                    "title": getattr(visualization_modules[name], "TITLE", name),
                    "description": getattr(
                        visualization_modules[name], "DESCRIPTION", ""
                    ),
                }
            )
        else:
            logger.warning(f"Visualization {name} not found in modules")

    logger.debug(
        f"Rendering index with visualizations: {[v['name'] for v in viz_list]}"
    )
    return render_template("index.html", visualizations=viz_list)


@app.route("/data/<viz_name>")
def get_data(viz_name):
    logger.debug(f"Data request for: {viz_name}")

    if viz_name not in visualization_modules:
        logger.error(f"Visualization not found: {viz_name}")
        return jsonify({"error": "Visualization not found"}), 404

    try:
        data = visualization_modules[viz_name].get_data()
        logger.debug(
            f"Returning data for {viz_name}: nodes={len(data.get('nodes', []))}, edges={len(data.get('edges', []))}"
        )
        return jsonify(data)
    except Exception as e:
        logger.exception(f"Error generating data for {viz_name}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
