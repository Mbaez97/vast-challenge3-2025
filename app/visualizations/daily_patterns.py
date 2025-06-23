import logging
from datetime import datetime
import json
import networkx as nx
import os
from flask import current_app

logger = logging.getLogger(__name__)

NAME = "daily_patterns"
TITLE = "Daily Communication Patterns"
DESCRIPTION = "Visualization of daily communication events with entity markers"


def get_data():
    logger.debug("Generating daily patterns data")

    # Get path to data file from config
    data_file = current_app.config["DATA_FILE"]
    if not data_file:
        logger.error("DATA_FILE not configured")
        return {"error": "Data file not configured"}

    # Load graph data from file
    try:
        with open(data_file, "r") as f:
            graph_data = json.load(f)
    except Exception as e:
        logger.error(f"Error loading graph data: {str(e)}")
        return {"error": f"Could not load data file: {str(e)}"}

    # Create networkx graph using the correct 'edges' key
    try:
        G = nx.node_link_graph(graph_data, edges="edges")
    except Exception as e:
        logger.error(f"Error creating graph: {str(e)}")
        return {"error": f"Could not create graph: {str(e)}"}

    october_events = []
    entities = {}

    # Process nodes to find communication events in October 2040
    for node_id, node_data in G.nodes(data=True):
        if (
            node_data.get("type") == "Event"
            and node_data.get("sub_type") == "Communication"
        ):
            # Handle different timestamp formats
            timestamp = node_data.get("timestamp") or node_data.get("date")

            if timestamp:
                try:
                    # Parse different timestamp formats
                    if "T" in timestamp:
                        # ISO format with 'T'
                        dt = datetime.fromisoformat(timestamp)
                    elif " " in timestamp:
                        # Space-separated format "YYYY-MM-DD HH:MM:SS"
                        dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
                    else:
                        # Date-only format
                        dt = datetime.strptime(timestamp, "%Y-%m-%d")

                    # Filter for October 2040
                    if dt.year == 2040 and dt.month == 10:
                        # Find source entity by looking for "sent" edges
                        source_entity = None
                        target_entities = []
                        content = node_data.get("content", "")

                        # Check all incoming edges to this event
                        for predecessor, _, edge_data in G.in_edges(node_id, data=True):
                            if edge_data.get("type") == "sent":
                                pred_data = G.nodes[predecessor]
                                if pred_data.get("type") == "Entity":
                                    source_entity = {
                                        "id": predecessor,
                                        "sub_type": pred_data.get("sub_type"),
                                        "label": pred_data.get("label", ""),
                                    }
                                    entities[predecessor] = source_entity
                                    break

                        # Find target entities by looking for "received" edges
                        for _, successor, edge_data in G.out_edges(node_id, data=True):
                            if edge_data.get("type") == "received":
                                succ_data = G.nodes[successor]
                                if succ_data.get("type") == "Entity":
                                    target_entity = {
                                        "id": successor,
                                        "sub_type": succ_data.get("sub_type"),
                                        "label": succ_data.get("label", ""),
                                    }
                                    entities[successor] = target_entity
                                    target_entities.append(successor)

                        if source_entity:
                            # Convert datetime objects to string representations
                            october_events.append(
                                {
                                    "id": node_id,
                                    "timestamp": timestamp,
                                    "entity_id": source_entity["id"],
                                    "entity_sub_type": source_entity["sub_type"],
                                    "time": dt.time().isoformat(),  # Convert to ISO time string
                                    "day": dt.day,
                                    "datetime": dt.isoformat(),  # Full datetime for frontend
                                    "content": content,
                                    "target_entities": target_entities,
                                }
                            )
                except (ValueError, TypeError) as e:
                    logger.debug(f"Skipping invalid timestamp: {timestamp} - {str(e)}")
                    continue

    logger.info(f"Found {len(october_events)} communication events in October 2040")

    # Prepare JSON-serializable response
    return {"events": october_events, "entities": list(entities.values())}
