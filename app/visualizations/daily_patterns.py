import logging
from datetime import datetime
import json
import networkx as nx
import os
from flask import current_app
from sklearn.feature_extraction.text import TfidfVectorizer
import re
import numpy as np
import pandas as pd
from .topic_modeling import (
    extract_topics_bertopic,
    extract_topics_lda,
    extract_topics_tfidf,
)

logger = logging.getLogger(__name__)

NAME = "daily_patterns"
TITLE = "Daily Communication Patterns"
DESCRIPTION = "Visualization of daily communication events with entity markers"


def load_and_organize_communications(graph_path):
    """
    Loads a graph from a JSON file, organizes communication events, and enhances each event with detailed attributes of the source, target, and communication itself.

    Args:
        graph_path (str): Path to the JSON file containing the graph data.

    Returns:
        list: A list of dictionaries. Each dictionary represents a communication event
             with its basic information and enhanced attributes.
    """
    with open(graph_path) as f:
        json_data = json.load(f)

    G = nx.json_graph.node_link_graph(json_data, edges="edges")
    communications = []

    for node_id in G.nodes():
        node_data = G.nodes[node_id]

        if (
            node_data.get("type") == "Event"
            and node_data.get("sub_type") == "Communication"
        ):
            comm_data = {
                "id": node_id,
                "timestamp": node_data.get("timestamp"),
                "content": node_data.get("content", ""),
                "source": None,
                "target": None,
                "source_attrs": {},
                "target_attrs": {},
            }

            # Extract source entity attributes from incoming edges
            for predecessor in G.predecessors(node_id):
                pred_node = G.nodes[predecessor]
                if pred_node.get("type") == "Entity":
                    comm_data["source"] = pred_node.get("label", "")
                    comm_data["source_attrs"] = pred_node.copy()
                    break

            # Extract target entity attributes from outgoing edges
            for successor in G.successors(node_id):
                succ_node = G.nodes[successor]
                if succ_node.get("type") == "Entity":
                    comm_data["target"] = succ_node.get("label", "")
                    comm_data["target_attrs"] = succ_node.copy()
                    break

            communications.append(comm_data)

    return communications


def calculate_hourly_density(october_events):
    """
    Calculate hourly communication density data for visualization.

    Args:
        october_events (list): List of communication events

    Returns:
        dict: Hourly density data for visualization
    """
    if not october_events:
        return {"dates": [], "hours": [], "density_data": []}

    # Create DataFrame from events
    df_data = []
    for event in october_events:
        try:
            # Parse datetime
            if "T" in event["timestamp"]:
                dt = datetime.fromisoformat(event["timestamp"])
            elif " " in event["timestamp"]:
                dt = datetime.strptime(event["timestamp"], "%Y-%m-%d %H:%M:%S")
            else:
                dt = datetime.strptime(event["timestamp"], "%Y-%m-%d")

            df_data.append(
                {
                    "event_id": event["id"],
                    "timestamp": dt,
                    "date": dt.date(),
                    "hour_of_day": dt.hour,
                    "content": event.get("content", ""),
                    "entity_id": event.get("entity_id", ""),
                    "target_entities": event.get("target_entities", []),
                }
            )
        except (ValueError, TypeError) as e:
            logger.debug(
                f"Skipping event with invalid timestamp: {event.get('timestamp')} - {str(e)}"
            )
            continue

    if not df_data:
        return {"dates": [], "hours": [], "density_data": []}

    df = pd.DataFrame(df_data)

    # Filter to hours 8-14 (8AM-2PM) for business hours analysis
    df_filtered = df[(df["hour_of_day"] >= 8) & (df["hour_of_day"] <= 14)]

    # Group by date and hour to get communication counts
    aggregated_df = (
        df_filtered.groupby(["date", "hour_of_day"]).size().reset_index(name="count")
    )

    # Create complete grid of dates and hours (8-14)
    all_dates = sorted(df_filtered["date"].unique())
    all_hours = list(range(8, 15))  # Hours 8 to 14 inclusive

    complete_grid = pd.DataFrame(
        [(date, hour) for date in all_dates for hour in all_hours],
        columns=["date", "hour_of_day"],
    )

    # Merge with actual data and fill missing values with 0
    complete_df = pd.merge(
        complete_grid, aggregated_df, on=["date", "hour_of_day"], how="left"
    ).fillna(0)

    # Sort by date for consistent ordering
    complete_df = complete_df.sort_values(["date", "hour_of_day"])

    # Convert to format suitable for frontend visualization
    dates = [date.strftime("%Y-%m-%d") for date in all_dates]
    hours = all_hours

    # Create density data as a list of series for each date
    density_data = []
    for date in all_dates:
        date_data = complete_df[complete_df["date"] == date]
        density_data.append(
            {"date": date.strftime("%Y-%m-%d"), "counts": date_data["count"].tolist()}
        )

    return {
        "dates": dates,
        "hours": hours,
        "density_data": density_data,
        "total_events": len(df_filtered),
    }


def get_data(include_topics=False, method="bertopic", **kwargs):
    logger.debug(f"Generating daily patterns data, include_topics: {include_topics}")

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
    event_types = set()

    # Process nodes to find all events in October 2040
    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") == "Event":
            # Handle different timestamp formats
            timestamp = node_data.get("timestamp") or node_data.get("date")
            event_sub_type = node_data.get("sub_type")
            event_types.add(event_sub_type)

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
                        # Find source entity by looking for "sent" edges (for Communication events)
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

                        # For non-Communication events, try to find any connected entities
                        if not source_entity and event_sub_type != "Communication":
                            # Look for any connected entities (incoming or outgoing)
                            for predecessor, _, edge_data in G.in_edges(
                                node_id, data=True
                            ):
                                pred_data = G.nodes[predecessor]
                                if pred_data.get("type") == "Entity":
                                    source_entity = {
                                        "id": predecessor,
                                        "sub_type": pred_data.get("sub_type"),
                                        "label": pred_data.get("label", ""),
                                    }
                                    entities[predecessor] = source_entity
                                    break

                            # If still no source entity, look at outgoing edges
                            if not source_entity:
                                for _, successor, edge_data in G.out_edges(
                                    node_id, data=True
                                ):
                                    succ_data = G.nodes[successor]
                                    if succ_data.get("type") == "Entity":
                                        source_entity = {
                                            "id": successor,
                                            "sub_type": succ_data.get("sub_type"),
                                            "label": succ_data.get("label", ""),
                                        }
                                        entities[successor] = source_entity
                                        break

                        # Include event if we have a source entity OR if it's a standalone event
                        if source_entity or event_sub_type != "Communication":
                            # For events with source entities, use the real entity ID
                            # For truly standalone events, use synthetic ID
                            entity_id = source_entity["id"] if source_entity else f"standalone_{node_id}"
                            entity_sub_type = source_entity["sub_type"] if source_entity else "Standalone"
                            
                            # Convert datetime objects to string representations
                            october_events.append(
                                {
                                    "id": node_id,
                                    "timestamp": timestamp,
                                    "entity_id": entity_id,
                                    "entity_sub_type": entity_sub_type,
                                    "event_type": event_sub_type,
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

    logger.info(f"Found {len(october_events)} events in October 2040")
    logger.info(f"Found event types: {sorted(event_types)}")

    # Calculate hourly density data for visualization
    hourly_density_data = calculate_hourly_density(october_events)

    # Base response with events and entities
    response = {
        "events": october_events,
        "entities": list(entities.values()),
        "event_types": sorted([t for t in event_types if t is not None]),
        "hourly_density": hourly_density_data,
    }

    # Only include topic/keyword data if requested
    if include_topics:
        response.update(get_topic_data(october_events, method, **kwargs))
    else:
        # Include basic keywords for backward compatibility
        keywords = extract_keywords(
            [e["content"] for e in october_events if e.get("content")],
            max_keywords=15,
            ngram_range=(1, 2),
        )
        response["keywords"] = keywords

    return response


def get_topic_data(october_events, method="bertopic", **kwargs):
    """Get topic modeling data for events"""
    logger.debug(f"Generating topic data with method: {method}")

    # Extract topics using the specified method
    topics = []
    event_contents = [e["content"] for e in october_events if e.get("content")]

    if len(event_contents) >= 5:  # Need minimum events for topic modeling
        # Get topic count parameters
        num_topics = kwargs.get("num_topics", "auto")
        min_topic_size = kwargs.get("min_topic_size", 3)

        try:
            if method == "tfidf":
                # Handle auto topic count for TF-IDF
                tfidf_num_topics = num_topics
                if num_topics == "auto":
                    tfidf_num_topics = max(3, min(8, len(event_contents) // 5))
                else:
                    try:
                        tfidf_num_topics = int(num_topics)
                    except:
                        tfidf_num_topics = 5

                topics_list, doc_topics = extract_topics_tfidf(
                    event_contents, num_topics=tfidf_num_topics
                )

            elif method.startswith("lda"):
                # Parse vectorizer for LDA
                vectorizer_type = "tfidf"
                if "?" in method:
                    parts = method.split("?")
                    if len(parts) > 1:
                        vectorizer_type = (
                            parts[1].split("=")[1] if "=" in parts[1] else "tfidf"
                        )

                topics_list, doc_topics, _, _ = extract_topics_lda(
                    event_contents, num_topics=num_topics, vectorizer=vectorizer_type
                )

            else:  # Default to BERTopic
                topics_list, doc_topics, _ = extract_topics_bertopic(
                    event_contents, min_topic_size=min_topic_size
                )

            # Format topics for frontend
            for i, keywords in enumerate(topics_list):
                if keywords and len(keywords) > 0:
                    topics.append(
                        {
                            "id": i + 1,
                            "keywords": keywords,
                            "name": f"Topic {i + 1}: {', '.join(keywords[:3])}",
                        }
                    )

            # Create event topic assignments
            event_topic_data = []
            content_index = 0
            for event in october_events:
                if event.get("content"):
                    if content_index < len(doc_topics):
                        topic_weights = doc_topics[content_index]
                        # Find dominant topic
                        if topic_weights:
                            dominant_topic_index = int(np.argmax(topic_weights))
                            dominant_topic = (
                                dominant_topic_index + 1
                            )  # Convert to 1-based indexing
                            dominant_weight = float(topic_weights[dominant_topic_index])
                        else:
                            dominant_topic = -1
                            dominant_weight = 0.0

                        event_topic_data.append(
                            {
                                "event_id": event["id"],
                                "topic_weights": [float(w) for w in topic_weights],
                                "dominant_topic": dominant_topic,
                                "dominant_weight": dominant_weight,
                            }
                        )
                    content_index += 1

        except Exception as e:
            logger.error(f"Topic modeling failed: {str(e)}")
            # Fallback to simple keyword extraction
            keywords = extract_keywords(event_contents, max_keywords=10)
            topics = [
                {"id": i + 1, "keywords": [kw["term"]], "name": kw["term"]}
                for i, kw in enumerate(keywords)
            ]
            event_topic_data = []
    else:
        # Not enough content for topic modeling
        logger.warning(
            f"Not enough content for topic modeling ({len(event_contents)} events)"
        )
        topics = []
        event_topic_data = []

    return {
        "topics": topics,
        "method_used": method,
        "total_communications": len(event_contents),
        "event_topic_data": event_topic_data,
    }


def extract_keywords(contents, max_keywords=15, ngram_range=(1, 3)):
    """Extract important keywords using TF-IDF with n-grams"""
    if not contents:
        return []

    # Preprocess text
    processed_contents = [
        re.sub(r"[^\w\s]", "", content).lower().strip() for content in contents
    ]

    # Create TF-IDF matrix
    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_features=500,
        ngram_range=ngram_range,  # 1,2 and 3-grams
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(processed_contents)
    except ValueError:
        return []

    # Get feature names
    feature_names = vectorizer.get_feature_names_out()

    # Get top keywords across all documents
    tfidf_scores = np.sum(tfidf_matrix, axis=0)
    top_indices = np.argsort(tfidf_scores).tolist()[0][-max_keywords:]
    top_indices.reverse()

    # Prepare keyword data
    keywords = []
    for idx in top_indices:
        keyword = feature_names[idx]
        score = float(tfidf_scores[0, idx])
        keywords.append(
            {
                "term": keyword,
                "score": score,
                "id": f"kw_{len(keywords)}",  # Generate unique ID
            }
        )

    return keywords
