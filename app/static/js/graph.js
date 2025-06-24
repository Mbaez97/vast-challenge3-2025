
function init_graph() {
  const width = 700;
  const height = 600;

  // Clear and set up SVG
  const container = d3.select("#graph-container");
  container.html("");
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("class", "bg-white rounded-lg shadow-md");
  const g = svg.append("g");

  // Load data
  d3.json("/data/graph").then(data => {
    const allEdges = data.edges;
    let selectedNodes = new Set();  // now a Set for multi-selection

    // Prepare nodes & links
    const nodesData = data.nodes.map(n => ({ id: n.id }));
    const links = allEdges.map(e => ({
      id: e.event_id,
      source: e.source,
      target: e.target
    }));

    // Force simulation
    const simulation = d3.forceSimulation(nodesData)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    // Draw links
    const link = g.append("g").attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);

    // Draw nodes
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const node = g.append("g").attr("class", "nodes")
      .selectAll("circle")
      .data(nodesData)
      .join("circle")
        .attr("r", 10)
        .attr("fill", d => color(d.id))
        .attr("stroke", "#1e40af")
        .attr("stroke-width", 2)
        .call(drag(simulation));

    // Draw labels
    const label = g.append("g").attr("class", "labels")
      .selectAll("text")
      .data(nodesData)
      .join("text")
        .text(d => d.id)
        .attr("font-size", "12px")
        .attr("dx", 12)
        .attr("dy", 4);

    // Tick handler
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    // Zoom behavior
    svg.call(d3.zoom().on("zoom", event => {
      g.attr("transform", event.transform);
    }));

    // Table rendering
    const tbody = d3.select("#message-table tbody");
    function renderTable(rows) {
      const tr = tbody.selectAll("tr")
        .data(rows, d => d.event_id);

      // Enter
      const trEnter = tr.enter().append("tr");
      trEnter.append("td").text(d => d.source);
      trEnter.append("td").text(d => d.target);
      trEnter.append("td").text(d => d.datetime);
      trEnter.append("td").text(d => d.content);

      // Update
      tr.select("td:nth-child(1)").text(d => d.source);
      tr.select("td:nth-child(2)").text(d => d.target);
      tr.select("td:nth-child(3)").text(d => d.datetime);
      tr.select("td:nth-child(4)").text(d => d.content);

      // Exit
      tr.exit().remove();
    }

    // Highlight logic for multi-select
    function updateHighlights() {
      if (selectedNodes.size === 0) {
        node.attr("opacity", 1).attr("r", 10);
        label.attr("opacity", 1);
        link.attr("opacity", 0.6);
      } else {
        // build neighbor set: selected + their direct neighbors
        const neighborSet = new Set([...selectedNodes]);
        allEdges.forEach(e => {
          if (selectedNodes.has(e.source)) neighborSet.add(e.target);
          if (selectedNodes.has(e.target)) neighborSet.add(e.source);
        });

        node
          .attr("opacity", d => neighborSet.has(d.id) ? 1 : 0.2)
          .attr("r", d => selectedNodes.has(d.id) ? 14 : 10);

        label.attr("opacity", d => neighborSet.has(d.id) ? 1 : 0.2);

        link.attr("opacity", l =>
          (selectedNodes.has(l.source.id) || selectedNodes.has(l.target.id))
            ? 1 : 0.1
        );
      }
    }

    // Initial full render
    renderTable(allEdges);
    updateHighlights();

    // Node click: toggle in Set and re-render
    node.on("click", (event, d) => {
      if (selectedNodes.has(d.id)) {
        selectedNodes.delete(d.id);
      } else {
        selectedNodes.add(d.id);
      }

      // Filter table: any edge touching any selected node
      const toShow = selectedNodes.size === 0
        ? allEdges
        : allEdges.filter(e =>
            selectedNodes.has(e.source) ||
            selectedNodes.has(e.target)
          );

      renderTable(toShow);
      updateHighlights();
    });

    // Clear filter button
    d3.select("#clear-filter-btn").on("click", () => {
      selectedNodes.clear();
      renderTable(allEdges);
      updateHighlights();
    });

  }).catch(err => console.error("Error loading graph data:", err));
}

// Drag helpers (unchanged)
function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}