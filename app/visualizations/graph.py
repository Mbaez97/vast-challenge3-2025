import networkx as nx
import logging
import json
import pandas as pd
from flask import current_app

logger = logging.getLogger(__name__)

# Visualization metadata
NAME = "graph"
TITLE = "Graph Exploration"
DESCRIPTION = "Graph exploration between entities and their interactions (Communication, Relationships, similarity, etc.)"


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

    try:
        csv_path = current_app.config["HEATMAP_SIMILARITY_FILE"]
        df = pd.read_csv(csv_path, index_col=0)
        entities = df.index.tolist()
        matrix = df.values.tolist()
    except Exception as e:
        logger.error(f"Error loading entity similarity matrix: {str(e)}")
        return {"error": f"Could not load entity similarity matrix: {str(e)}"}

    logger.debug(f"Loaded graph: {len(nodes)} nodes, {len(links)} edges")
    return {
        "nodes": nodes,
        "edges": links,
        "heatmap": {"entities": entities, "matrix": matrix},
    }
