from flask import Flask, render_template, jsonify, request
import importlib
import logging
import os
import json

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Suppress numba debug messages
logging.getLogger("numba").setLevel(logging.WARNING)
logging.getLogger("numba.core").setLevel(logging.WARNING)
logging.getLogger("numba.typed").setLevel(logging.WARNING)

# Define base directory and data file paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(base_dir, "data", "MC3_graph.json")
COMMUNICATION_FILE = os.path.join(
    base_dir, "data", "MC3_graph_communication.json"
)  # noqa
HEATMAP_SIMILARITY_FILE = os.path.join(
    base_dir, "data", "MC3_entity_similarity_matrix.csv"
)
RELATIONSHIPS_FILE = os.path.join(
    base_dir, "data", "MC3_graph_relationships.json"
)  # noqa

# Assign configuration values
app.config["DATA_FILE"] = DATA_FILE
app.config["COMMUNICATION_FILE"] = COMMUNICATION_FILE
app.config["HEATMAP_SIMILARITY_FILE"] = HEATMAP_SIMILARITY_FILE
app.config["RELATIONSHIPS_FILE"] = RELATIONSHIPS_FILE

# List of visualization modules
VISUALIZATIONS = ["daily_patterns", "topic_modeling", "graph", "nadia_analysis"]

# Cache for loaded modules
visualization_modules = {}


def load_visualization_module(viz_name):
    """Lazy load visualization module when needed."""
    if viz_name not in visualization_modules:
        try:
            module = importlib.import_module(f"app.visualizations.{viz_name}")
            visualization_modules[viz_name] = module
            logger.info(f"Loaded visualization module: {viz_name}")
        except ImportError as e:
            logger.error(f"Error loading visualization module {viz_name}: {e}")
            return None
    return visualization_modules.get(viz_name)


@app.route("/")
def index():
    viz_list = []
    for name in VISUALIZATIONS:
        # Try to load module to get metadata
        module = load_visualization_module(name)
        if module:
            viz_list.append(
                {
                    "name": name,
                    "title": getattr(module, "TITLE", name),
                    "description": getattr(module, "DESCRIPTION", ""),
                }
            )
        else:
            logger.warning(f"Visualization {name} could not be loaded")

    logger.debug(
        f"Rendering index with visualizations: {[v['name'] for v in viz_list]}"
    )
    return render_template("index.html", visualizations=viz_list)


@app.route("/data/<viz_name>", methods=["GET", "POST"])
def get_data(viz_name):
    logger.debug(f"Data request for: {viz_name}")

    # Check if visualization name is valid
    if viz_name not in VISUALIZATIONS:
        logger.error(f"Visualization not found: {viz_name}")
        return jsonify({"error": "Visualization not found"}), 404

    # Lazy load the module
    module = load_visualization_module(viz_name)
    if not module:
        logger.error(f"Failed to load visualization module: {viz_name}")
        return jsonify({"error": "Visualization module could not be loaded"}), 500

    try:
        # Extract parameters from both GET and POST requests
        params = {}

        # GET parameters from query string
        params.update(request.args.to_dict())

        # POST parameters from form data or JSON
        if request.method == "POST":
            if request.is_json:
                params.update(request.get_json() or {})
            else:
                params.update(request.form.to_dict())

        # Pass parameters as kwargs to get_data function
        data = module.get_data(**params)

        logger.debug(
            f"Returning data for {viz_name} with params {params}: nodes={len(data.get('nodes', []))}, edges={len(data.get('edges', []))}"
        )
        return jsonify(data)
    except Exception as e:
        logger.exception(f"Error generating data for {viz_name}")
        return jsonify({"error": str(e)}), 500


@app.route("/wordcloud/<viz_name>", methods=["GET", "POST"])
def get_wordcloud(viz_name):
    """Get filtered wordcloud for a specific visualization"""
    logger.debug(f"Wordcloud request for: {viz_name}")

    if viz_name not in VISUALIZATIONS:
        logger.error(f"Visualization not found: {viz_name}")
        return jsonify({"error": "Visualization not found"}), 404

    # Load the visualization module
    module = load_visualization_module(viz_name)
    if not module:
        logger.error(f"Failed to load visualization module: {viz_name}")
        return jsonify({"error": "Visualization module could not be loaded"}), 500

    # Check if the module has wordcloud generation capability
    if not hasattr(module, "generate_wordcloud_image"):
        logger.error(f"Visualization {viz_name} does not support wordcloud generation")
        return jsonify({"error": "Wordcloud not supported for this visualization"}), 400

    try:
        # Extract parameters
        params = {}
        params.update(request.args.to_dict())

        if request.method == "POST":
            if request.is_json:
                params.update(request.get_json() or {})
            else:
                params.update(request.form.to_dict())

        # Check if communications are provided in POST body
        if request.method == "POST" and request.is_json and "communications" in params:
            # Use communications from POST body (for filtered requests)
            communications = params["communications"]
            logger.debug(f"Using {len(communications)} communications from POST body")
        else:
            # Get the base data first
            data = module.get_data()

            # Find communications from the data
            communications = []

            # Try to get communications from the analysis data
            if data.get("graph_data") and data["graph_data"].get("links"):
                # Extract communications from graph links
                nadia_links = []
                for link in data["graph_data"]["links"]:
                    if (
                        link.get("source") == "Nadia Conti"
                        or link.get("target") == "Nadia Conti"
                    ):
                        nadia_links.append(
                            {
                                "source": link.get("source", ""),
                                "target": link.get("target", ""),
                                "content": link.get(
                                    "content", link.get("message", link.get("text", ""))
                                ),
                                "datetime": link.get("datetime", ""),
                                "is_sender": link.get("source") == "Nadia Conti",
                            }
                        )
                communications = nadia_links
            elif "timeline" in data:
                # Use timeline data if available
                communications = [
                    {
                        "source": (
                            "Nadia Conti"
                            if event.get("is_sender")
                            else event.get("other_party", "")
                        ),
                        "target": (
                            event.get("other_party", "")
                            if event.get("is_sender")
                            else "Nadia Conti"
                        ),
                        "content": event.get("content", ""),
                        "datetime": event.get("datetime", ""),
                        "is_sender": event.get("is_sender", False),
                    }
                    for event in data["timeline"]
                ]

        # Get filter parameters
        filter_person = params.get("filter_person")
        include_indirect = params.get("include_indirect") == "true"
        width = int(params.get("width", 800))
        height = int(params.get("height", 400))

        logger.debug(
            f"Wordcloud params: filter_person={filter_person}, include_indirect={include_indirect}"
        )

        # Generate wordcloud
        wordcloud_result = module.generate_wordcloud_image(
            communications,
            filter_person=filter_person,
            width=width,
            height=height,
            include_indirect=include_indirect,
        )

        logger.debug(f"Generated wordcloud for {viz_name} with filter: {filter_person}")
        return jsonify(wordcloud_result)

    except Exception as e:
        logger.exception(f"Error generating wordcloud for {viz_name}")
        return jsonify({"error": str(e)}), 500


@app.route("/data/relationships")
def get_relationships():
    """Serve relationship data for color mapping"""
    try:
        with open(app.config.get("RELATIONSHIPS_FILE"), "r") as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error loading relationships: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
