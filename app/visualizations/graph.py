import networkx as nx
import logging

logger = logging.getLogger(__name__)

# Visualization metadata
NAME = "graph"
TITLE = "Demo Graph"
DESCRIPTION = "Force-directed visualization of random network connections"


def get_data():
    logger.debug("Generating graph data")
    graph = nx.erdos_renyi_graph(20, 0.2)
    nodes = list(graph.nodes())
    edges = list(graph.edges())
    logger.debug(f"Generated graph: {len(nodes)} nodes, {len(edges)} edges")
    return {"nodes": nodes, "edges": edges}
