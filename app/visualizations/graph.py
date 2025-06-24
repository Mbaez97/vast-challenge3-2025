import networkx as nx
import logging
import json
from flask import current_app

logger = logging.getLogger(__name__)

# Visualization metadata
NAME = "graph"
TITLE = "Communication Graph"
DESCRIPTION = "Visualize the communication graph of the dataset, showing nodes and edges representing entities and their communications."


def get_data():
    logger.debug("Generating graph data")

    logger.debug("Loading graph data from static/graph.json")
    data_file = current_app.config["COMMUNICATION_FILE"]
    if not data_file:
        logger.error("COMMUNICATION_FILE not configured")
        return {"error": "Data file not configured"}

    # Load graph data from file
    try:
        with open(data_file, "r") as f:
            graph_data = json.load(f)
    except Exception as e:
        logger.error(f"Error loading graph data: {str(e)}")
        return {"error": f"Could not load data file: {str(e)}"}
    # breakpoint()
    nodes = graph_data.get("nodes", [])
    links = graph_data.get("links", graph_data.get("edges", []))

    logger.debug(f"Loaded graph: {len(nodes)} nodes, {len(links)} edges")
    return {"nodes": nodes, "edges": links}
