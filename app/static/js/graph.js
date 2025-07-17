function init_graph() {
  console.log('🚀 Initializing hierarchical edge bundling graph...');
  // ── Containers and SVG setup ─────────────────────────────────────────
  const commContainer = d3.select("#graph-container-2");
  const relContainer = d3.select("#relationship-container");
  const height = 600;

  commContainer.html("");
  relContainer.html("");

  // Communication SVG (left)
  const commWidth = commContainer.node().clientWidth;
  const commSvg = commContainer.append("svg")
    .attr("width", commWidth)
    .attr("height", height)
    .attr("class", "bg-white rounded-lg shadow-md");
  const commG = commSvg.append("g");

  // Relationship SVG (right)
  const relWidth = relContainer.node().clientWidth;
  const relSvg = relContainer.append("svg")
    .attr("width", relWidth)
    .attr("height", height)
    .attr("class", "bg-white rounded-lg shadow-md");
  const relG = relSvg.append("g");


  // Clean visualization without duplicate legend - using only category labels


  d3.json("/data/graph").then(data => {
    console.log('📊 Graph data loaded:', data);
    // Shared state
    let selectedNodes = new Set();
    let selectedTypes = new Set();
    // new filter state:
    let filterStart = null,
      filterEnd = null,
      filterEventId = "",
      filterSource = "";

    // populate Source dropdown from your communication nodes:
    const commIds = Array.from(new Set(data.communication.nodes.map(n => n.id)));
    const sourceSelect = d3.select("#filter-source");
    commIds.forEach(id =>
      sourceSelect.append("option").attr("value", id).text(id)
    );

    // wire up buttons:
    d3.select("#apply-chat-filters").on("click", () => {
      const sd = document.getElementById("filter-start").value;
      const ed = document.getElementById("filter-end").value;
      filterStart = sd ? new Date(sd) : null;
      filterEnd = ed ? new Date(ed) : null;
      filterEventId = document.getElementById("filter-event-id").value.trim();
      filterSource = document.getElementById("filter-source").value;
      renderChat();
    });
    d3.select("#clear-chat-filters").on("click", () => {
      filterStart = filterEnd = null;
      filterEventId = filterSource = "";
      document.getElementById("filter-start").value = "";
      document.getElementById("filter-end").value = "";
      document.getElementById("filter-event-id").value = "";
      document.getElementById("filter-source").value = "";
      renderChat();
    });


    // Communication graph data
    const commNodes = data.communication.nodes.map(n => ({
      id: n.id,
      type: n.sub_type,
      is_pseudonym: n.is_pseudonym
    }));
    const commLinks = data.communication.links.map(e => ({
      id: e.event_id, source: e.source, target: e.target
    }));

    // Relationship graph data
    const relNodes = data.relationships.nodes.map(n => ({
      id: n.id,
      type: n.sub_type,
      is_pseudonym: n.is_pseudonym
    }));
    const relLinks = data.relationships.links.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      evidence: e.evidence,
      participants: e.participants,
      info: e.info
    }));

    const linkCounts = {};
    relLinks.forEach(l => {
      const key = [l.source, l.target].sort().join("::");
      linkCounts[key] = (linkCounts[key] || 0) + 1;
    });

    // 1b) assign each link an index 0…(total−1)
    const linkIndex = {};
    relLinks.forEach(l => {
      const key = [l.source, l.target].sort().join("::");
      linkIndex[key] = linkIndex[key] || 0;
      l._parallelIndex = linkIndex[key]++;
      l._parallelTotal = linkCounts[key];
    });

    const linkTypes = Array.from(new Set(relLinks.map(d => d.type)));
    const linkColor = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(linkTypes);
    const legendRelation = relSvg.append("g")
      .attr("class", "link-legend")
      .attr("transform", "translate(20,20)");

    legendRelation.selectAll("g")
      .data(linkTypes)
      .join("g")
      .attr("transform", (_, i) => `translate(0,${i * 20})`)
      .call(g => {
        g.append("line")
          .attr("x1", 0).attr("y1", 5)
          .attr("x2", 20).attr("y2", 5)
          .attr("stroke", d => linkColor(d))
          .attr("stroke-width", 2);
        g.append("text")
          .attr("x", 25).attr("y", 5)
          .text(d => d)
          .attr("alignment-baseline", "middle")
          .attr("font-size", "12px");
      });

    // Type → color - use consistent domain ordering
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const entityTypeMap = new Map(commNodes.map(d => [d.id, d.type]));

    // Debug: Check types order - maintain original order from data
    const allTypes = Array.from(new Set(commNodes.map(d => d.type)));

    // Set explicit domain for color scale to ensure consistent ordering
    color.domain(allTypes);

    console.log(`📋 All entity types found (sorted):`, allTypes);
    console.log(`🎨 Color mapping:`, allTypes.map(t => ({ type: t, color: color(t) })));

    // Radial radii for nodes
    const radialRadius = {
      Person: 350,
      Vessel: 200,
      Location: 100,
      Organization: 50,
      Group: 50
    }

    // Tooltip for heatmap
    const tooltip = d3.select("body").append("div")
      .attr("class", "heatmap-tooltip")
      .style("visibility", "hidden");

    // ── COMMUNICATION GRAPH - CITATION PATTERNS (WELL-FORMED STYLE) ──────────

    // Group nodes by type for citation-style arrangement
    const nodesByType = d3.group(commNodes, d => d.type);

    // Calculate positions for elegant circular hierarchical edge bundling
    const centerX = commWidth / 2;
    const centerY = height / 2;
    const radius = Math.min(commWidth, height) / 2 - 80; // Single perimeter circle
    const bundlingRadius = radius * 0.15; // Much tighter bundling radius for elegant curves

    // Create nodes with connection counts for sizing
    const nodeConnectionCounts = new Map();
    commLinks.forEach(link => {
      nodeConnectionCounts.set(link.source, (nodeConnectionCounts.get(link.source) || 0) + 1);
      nodeConnectionCounts.set(link.target, (nodeConnectionCounts.get(link.target) || 0) + 1);
    });

    // Create sophisticated radial layout - use allTypes directly in sorted order
    let allLeafNodes = [];
    let nodePositions = new Map();
    let typeGroups = [];

    // Use only types that have nodes, but maintain the sorted order
    const activeTypes = allTypes.filter(typeName => nodesByType.has(typeName));
    console.log(`🔄 ActiveTypes order:`, activeTypes);

    // Arrange all nodes on the perimeter, grouped by type
    const totalNodes = commNodes.length;

    // Calculate how much arc each type should occupy
    const typeAngles = new Map();
    let currentAngle = -Math.PI / 2; // Start at top

    activeTypes.forEach((typeName) => {
      const nodesOfType = nodesByType.get(typeName) || [];
      if (nodesOfType.length === 0) return;

      // Allocate angle proportional to number of nodes
      const proportion = nodesOfType.length / totalNodes;
      const sectorAngle = 2 * Math.PI * proportion;

      typeAngles.set(typeName, {
        startAngle: currentAngle,
        endAngle: currentAngle + sectorAngle,
        sectorAngle: sectorAngle
      });

      currentAngle += sectorAngle;
    });

    activeTypes.forEach((typeName, typeIndex) => {
      const nodesOfType = nodesByType.get(typeName) || [];
      if (nodesOfType.length === 0) return;

      const angleInfo = typeAngles.get(typeName);
      const { startAngle, sectorAngle } = angleInfo;

      // Sort nodes by connection count for better visual hierarchy
      const sortedNodes = nodesOfType.sort((a, b) =>
        (nodeConnectionCounts.get(b.id) || 0) - (nodeConnectionCounts.get(a.id) || 0)
      );

      const nodeCount = sortedNodes.length;

      sortedNodes.forEach((node, nodeIndex) => {
        const connectionCount = nodeConnectionCounts.get(node.id) || 1;
        const maxConnections = Math.max(...Array.from(nodeConnectionCounts.values()));
        const importance = connectionCount / maxConnections;

        // Distribute nodes evenly along the arc assigned to this type
        const t = nodeCount > 1 ? nodeIndex / (nodeCount - 1) : 0.5;
        const angle = startAngle + (t * sectorAngle * 0.95); // Use 95% of arc to leave small gaps

        // All nodes on the same radius (perimeter)
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        const nodeData = {
          x, y,
          angle,
          radius,
          typeCategory: typeName,
          sectorStart: startAngle,
          sectorEnd: startAngle + sectorAngle,
          ...node,
          connectionCount,
          size: connectionCount,
          typeColor: color(typeName),
          typeLightColor: color(typeName),
          typeSymbol: d3.symbolCircle,
          importance
        };

        nodePositions.set(node.id, nodeData);
        allLeafNodes.push(nodeData);
      });

      // Store type group info for sector labels
      typeGroups.push({
        name: typeName,
        color: color(typeName), // Use same color scale as legend
        lightColor: color(typeName),
        angle: angleInfo.startAngle + angleInfo.sectorAngle / 2,
        radius: radius + 60, // Outside the perimeter
        nodeCount: nodesOfType.length,
        sectorStart: angleInfo.startAngle,
        sectorEnd: angleInfo.endAngle,
        sectorAngle: angleInfo.sectorAngle
      });
    });

    console.log(`🌐 Created ${allLeafNodes.length} nodes in circular layout`);
    console.log(`🗺️ Entity types:`, typeGroups.map(t => `${t.name}: ${t.nodeCount}`));
    console.log(`🎨 Type groups with angles:`, typeGroups.map(t => ({
      name: t.name,
      color: t.color,
      startAngle: t.sectorStart,
      endAngle: t.sectorEnd,
      angleInDegrees: (t.angle * 180 / Math.PI)
    })));
    console.log(`🔄 TypeGroups order:`, typeGroups.map(t => t.name));

    // Debug: Check specific nodes and their sectors
    const debugNodes = ["Nadia Conti", "Himark Harbor", "The Intern"];
    debugNodes.forEach(nodeName => {
      const node = allLeafNodes.find(n => n.id === nodeName);
      if (node) {
        const sector = typeGroups.find(t => t.name === node.type);
        console.log(`🔍 ${nodeName} debug:`, {
          id: node.id,
          type: node.type,
          typeCategory: node.typeCategory,
          angle: node.angle,
          angleInDegrees: (node.angle * 180 / Math.PI),
          color: color(node.type),
          sectorStart: node.sectorStart,
          sectorEnd: node.sectorEnd,
          sectorColor: sector ? sector.color : 'NOT_FOUND',
          sectorAngle: sector ? (sector.angle * 180 / Math.PI) : 'NOT_FOUND'
        });
      }
    });

    // Classic Hierarchical Edge Bundling algorithm
    function createHierarchicalBundledPath(source, target) {
      const sx = source.x, sy = source.y;
      const tx = target.x, ty = target.y;

      // Calculate angles for source and target
      const sourceAngle = Math.atan2(sy - centerY, sx - centerX);
      const targetAngle = Math.atan2(ty - centerY, tx - centerX);

      // Calculate angular distance (shortest path)
      let angleSpan = Math.abs(targetAngle - sourceAngle);
      if (angleSpan > Math.PI) {
        angleSpan = 2 * Math.PI - angleSpan;
      }

      // Create elegant bundling like the reference image
      const bundlingIntensity = Math.min(angleSpan / Math.PI, 1.0);

      // Multiple control points for very smooth curves
      const steps = 5;
      const controlPoints = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const currentAngle = sourceAngle + (targetAngle - sourceAngle) * t;

        // Variable radius for smooth bundling toward center
        let currentRadius;
        if (i === 0) {
          currentRadius = radius; // Start at perimeter
        } else if (i === steps) {
          currentRadius = radius; // End at perimeter
        } else {
          // Curve toward center with varying intensity
          const bundleDepth = Math.sin(t * Math.PI) * bundlingIntensity;
          currentRadius = radius - (bundleDepth * (radius - bundlingRadius));
        }

        controlPoints.push({
          x: centerX + Math.cos(currentAngle) * currentRadius,
          y: centerY + Math.sin(currentAngle) * currentRadius
        });
      }

      // Create smooth spline through control points
      let path = `M${sx},${sy}`;

      if (controlPoints.length > 2) {
        // Use quadratic curves for smoothness
        for (let i = 1; i < controlPoints.length - 1; i++) {
          const cp = controlPoints[i];
          const nextCp = controlPoints[i + 1];
          const midX = (cp.x + nextCp.x) / 2;
          const midY = (cp.y + nextCp.y) / 2;
          path += ` Q${cp.x},${cp.y} ${midX},${midY}`;
        }
        path += ` Q${controlPoints[controlPoints.length - 1].x},${controlPoints[controlPoints.length - 1].y} ${tx},${ty}`;
      } else {
        path += ` Q${centerX},${centerY} ${tx},${ty}`;
      }

      return path;
    }

    // Create links with hierarchical edge bundling
    console.log(`📊 Creating ${commLinks.length} bundled links`);
    const bundledLinks = commLinks.map(link => {
      const source = nodePositions.get(link.source);
      const target = nodePositions.get(link.target);
      if (source && target) {
        return {
          ...link,
          source: source,
          target: target,
          path: createHierarchicalBundledPath(source, target)
        };
      }
      return null;
    }).filter(d => d !== null);
    console.log(`✅ Created ${bundledLinks.length} valid bundled links`);

    // Optional: sector separators (commented out for cleaner look like reference)
    /*
    const sectorLines = commG.append("g").attr("class", "sector-lines")
      .selectAll("line")
      .data(typeGroups)
      .join("line")
        .attr("x1", d => centerX + Math.cos(d.sectorStart) * bundlingRadius)
        .attr("y1", d => centerY + Math.sin(d.sectorStart) * bundlingRadius)
        .attr("x2", d => centerX + Math.cos(d.sectorStart) * (radius + 30))
        .attr("y2", d => centerY + Math.sin(d.sectorStart) * (radius + 30))
        .attr("stroke", d => d.color)
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.2);
    */

    // Remove colored arcs - show only individual nodes with their colors

    // Draw elegant hierarchical edge bundling connections like the reference
    const commLinkSel = commG.append("g").attr("class", "links")
      .selectAll("path")
      .data(bundledLinks)
      .join("path")
      .attr("d", d => d.path)
      .attr("fill", "none")
      .attr("stroke", "#888888")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.4)
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round");

    // Visible nodes with colors and shapes based on type and pseudonym status
    // Circles for normal entities, stars for pseudonyms, colored by type
    const commNode = commG.append("g").attr("class", "nodes")
      .selectAll("path")
      .data(allLeafNodes)
      .join("path")
      .attr("d", d => {
        const size = 80; // Base size for nodes
        const symbolType = d.is_pseudonym ? d3.symbolStar : d3.symbolCircle;
        return d3.symbol().type(symbolType).size(size)();
      })
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("fill", d => color(d.type))
      .attr("stroke", "#333")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.9)
      .attr("data-type", d => d.type)
      .attr("data-pseudonym", d => d.is_pseudonym)
      .attr("data-category", d => d.typeCategory)
      .style("cursor", "pointer");

    // Individual node labels with pseudonym indicators
    const commLabel = commG.append("g").attr("class", "labels")
      .selectAll("text")
      .data(allLeafNodes)
      .join("text")
      .text(d => {
        // Truncate long names for cleaner look
        const maxLength = 10;
        return d.id.length > maxLength ? d.id.substring(0, maxLength) + "..." : d.id;
      })
      .attr("x", d => {
        // Position labels at fixed distance outside circle
        const labelRadius = radius + 30;
        return centerX + Math.cos(d.angle) * labelRadius;
      })
      .attr("y", d => {
        const labelRadius = radius + 30;
        return centerY + Math.sin(d.angle) * labelRadius;
      })
      .attr("text-anchor", d => {
        // Proper text anchoring based on quadrant
        const degrees = (d.angle * 180 / Math.PI + 360) % 360;
        if (degrees > 90 && degrees < 270) {
          return "end"; // Right side of circle
        }
        return "start"; // Left side of circle
      })
      .attr("dy", "0.35em")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("fill", d => color(d.type))
      .attr("opacity", 1)
      .style("font-family", "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .style("text-shadow", "1px 1px 2px rgba(255,255,255,0.8)");

    // Category labels removed - shown in legend only

    // Communication graph tooltip
    const commTooltip = d3.select("body").append("div")
      .attr("class", "comm-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("z-index", "1000");

    // Interactive features
    commNode
      .on("mouseover", function (event, d) {
        // Visual feedback handled by CSS hover

        // Show tooltip
        const connections = bundledLinks.filter(link =>
          link.source.id === d.id || link.target.id === d.id).length;

        commTooltip
          .html(`
            <strong>${d.id}</strong><br/>
            Category: ${d.typeCategory}<br/>
            ${d.is_pseudonym ? 'Pseudonym' : 'Real Name'}<br/>
            Connections: ${connections}
          `)
          .style("visibility", "visible");

        // Highlight connected edges
        commLinkSel
          .attr("opacity", link =>
            (link.source.id === d.id || link.target.id === d.id) ? 1 : 0.1
          )
          .attr("stroke-width", link =>
            (link.source.id === d.id || link.target.id === d.id) ? 3 : 1.5
          )
          .attr("stroke", link =>
            (link.source.id === d.id || link.target.id === d.id) ? "#1f4e79" :
              (link.source.type ? color(link.source.type) : "#6c757d")
          );

        // Highlight connected nodes
        commNode
          .attr("opacity", node => {
            if (node.id === d.id) return 1;
            const isConnected = bundledLinks.some(link =>
              (link.source.id === d.id && link.target.id === node.id) ||
              (link.target.id === d.id && link.source.id === node.id)
            );
            return isConnected ? 1 : 0.3;
          });
      })
      .on("mousemove", function (event) {
        commTooltip
          .style("top", (event.pageY - 10) + "px")
          .style("left", (event.pageX + 10) + "px");
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("stroke-width", 2);

        // Hide tooltip
        commTooltip.style("visibility", "hidden");

        // Reset edge highlighting
        commLinkSel
          .attr("opacity", 0.6)
          .attr("stroke-width", 1.5)
          .attr("stroke", "#999999");

        // Reset node opacity
        commNode.attr("opacity", 1);
      });

    // Add edge bundling animation on load
    commLinkSel
      .attr("stroke-dasharray", function () {
        return this.getTotalLength() + " " + this.getTotalLength();
      })
      .attr("stroke-dashoffset", function () {
        return this.getTotalLength();
      })
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attr("stroke-dashoffset", 0);

    // Zoom
    commSvg.call(d3.zoom().on("zoom", ev => {
      commG.attr("transform", ev.transform);
    }));

    // ── RELATIONSHIP GRAPH (hierarchical edge bundling) ───────────────────────────────────
    console.log('🚀 Creating Relationship Graph with hierarchical edge bundling...');
    
    // Calculate positions for relationship nodes using same logic as communication
    const relCenterX = relWidth / 2;
    const relCenterY = height / 2;
    const relRadius = Math.min(relWidth, height) / 2 - 80;
    const relBundlingRadius = relRadius * 0.15;
    
    // Group relationship nodes by type
    const relNodesByType = d3.group(relNodes, d => d.type);
    const relActiveTypes = allTypes.filter(typeName => relNodesByType.has(typeName));
    
    // Create circular layout for relationship nodes
    let relAllLeafNodes = [];
    let relNodePositions = new Map();
    
    const relTotalNodes = relNodes.length;
    let relCurrentAngle = -Math.PI / 2; // Start at top
    
    relActiveTypes.forEach((typeName) => {
      const nodesOfType = relNodesByType.get(typeName) || [];
      if (nodesOfType.length === 0) return;
      
      // Allocate angle proportional to number of nodes
      const proportion = nodesOfType.length / relTotalNodes;
      const sectorAngle = 2 * Math.PI * proportion;
      
      // Sort nodes by id for consistent positioning
      const sortedNodes = nodesOfType.sort((a, b) => a.id.localeCompare(b.id));
      const nodeCount = sortedNodes.length;
      
      sortedNodes.forEach((node, nodeIndex) => {
        // Distribute nodes evenly along the arc assigned to this type
        const t = nodeCount > 1 ? nodeIndex / (nodeCount - 1) : 0.5;
        const angle = relCurrentAngle + (t * sectorAngle * 0.95);
        
        // Position on perimeter
        const x = relCenterX + Math.cos(angle) * relRadius;
        const y = relCenterY + Math.sin(angle) * relRadius;
        
        const nodeData = {
          x, y,
          angle,
          radius: relRadius,
          ...node
        };
        
        relNodePositions.set(node.id, nodeData);
        relAllLeafNodes.push(nodeData);
      });
      
      relCurrentAngle += sectorAngle;
    });
    
    // Create bundled relationship links
    const relBundledLinks = relLinks.map(link => {
      const source = relNodePositions.get(link.source);
      const target = relNodePositions.get(link.target);
      if (source && target) {
        return {
          ...link,
          source: source,
          target: target,
          path: createHierarchicalBundledPath(source, target)
        };
      }
      return null;
    }).filter(d => d !== null);
    
    // Draw relationship links with hierarchical edge bundling
    const relLinkSel = relG.append("g").attr("class", "links")
      .selectAll("path")
      .data(relBundledLinks)
      .join("path")
      .attr("d", d => d.path)
      .attr("fill", "none")
      .attr("stroke", d => linkColor(d.type))
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.6)
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round")
      .on("mouseover", (e, d) => {
        tooltip
          .html(
            `
          <strong>Relationship:</strong> ${d.info.id}<br/>
          <strong>Type:</strong> ${d.type}<br/>
          <strong>Participants:</strong><br/>
          ${Array.isArray(d.participants)
              ? d.participants.map(p => `<div>${p}</div>`).join("")
              : d.participants}
          <strong>Evidence:</strong><br/>
          ${Array.isArray(d.evidence)
              ? d.evidence.map(ev => `<div>${ev}</div>`).join("")
              : d.evidence}
          `
          )
          .style("visibility", "visible");
      })
      .on("mousemove", e => {
        tooltip
          .style("top", `${e.pageY + 10}px`)
          .style("left", `${e.pageX + 10}px`);
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    // Draw relationship nodes with same style as communication graph
    const relNode = relG.append("g").attr("class", "nodes")
      .selectAll("path")
      .data(relAllLeafNodes)
      .join("path")
      .attr("d", d => {
        const size = 80;
        const symbolType = d.is_pseudonym ? d3.symbolStar : d3.symbolCircle;
        return d3.symbol().type(symbolType).size(size)();
      })
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("fill", d => color(d.type))
      .attr("stroke", "#333")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.9)
      .attr("data-type", d => d.type)
      .attr("data-pseudonym", d => d.is_pseudonym)
      .style("cursor", "pointer");

    // Add relationship node labels
    const relLabel = relG.append("g").attr("class", "labels")
      .selectAll("text")
      .data(relAllLeafNodes)
      .join("text")
      .text(d => {
        const maxLength = 10;
        return d.id.length > maxLength ? d.id.substring(0, maxLength) + "..." : d.id;
      })
      .attr("x", d => {
        const labelRadius = relRadius + 30;
        return relCenterX + Math.cos(d.angle) * labelRadius;
      })
      .attr("y", d => {
        const labelRadius = relRadius + 30;
        return relCenterY + Math.sin(d.angle) * labelRadius;
      })
      .attr("text-anchor", d => {
        const degrees = (d.angle * 180 / Math.PI + 360) % 360;
        if (degrees > 90 && degrees < 270) {
          return "end";
        }
        return "start";
      })
      .attr("dy", "0.35em")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("fill", d => color(d.type))
      .attr("opacity", 1)
      .style("font-family", "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .style("text-shadow", "1px 1px 2px rgba(255,255,255,0.8)");

    // Add zoom for relationship graph
    relSvg.call(d3.zoom().on("zoom", ev => {
      relG.attr("transform", ev.transform);
    }));
    
    console.log(`✅ Relationship graph: ${relAllLeafNodes.length} nodes, ${relBundledLinks.length} bundled links`);

    // ── Interactive Type Legend on Communication ──────────────────────
    const types = allTypes; // Use same order as arcs
    console.log(`🔄 Legend types order:`, types);
    const legend = commSvg.append("g")
      .attr("transform", `translate(12,65)`)
    // .attr("transform", `translate(${commWidth - 130},20)`);
    const legendItems = legend.selectAll("g.type-item")
      .data(types)
      .join("g")
      .attr("transform", (_, i) => `translate(0,${i * 20})`)
      .style("cursor", "pointer")
      .on("click", (e, t) => {
        console.log(`🎯 Legend clicked:`, t);
        if (selectedTypes.has(t)) {
          selectedTypes.delete(t);
          console.log(`❌ Removed type:`, t);
        } else {
          selectedTypes.add(t);
          console.log(`✅ Added type:`, t);
        }
        console.log(`📋 Current selectedTypes:`, Array.from(selectedTypes));
        updateHighlights();
        updateLegendStyles();
        renderHeatmap();
      });
    legendItems.append("rect")
      .attr("width", 14)
      .attr("height", 14)
      .attr("fill", d => color(d));
    legendItems.append("text")
      .attr("x", 18)
      .attr("y", 12)
      .text(d => d)
      .attr("font-size", "12px")
      .attr("fill", "#1f2937");
    function updateLegendStyles() {
      legendItems.select("rect")
        .attr("stroke", d => selectedTypes.has(d) ? "#1e40af" : "none")
        .attr("stroke-width", d => selectedTypes.has(d) ? 2 : 0);
    }
    updateLegendStyles();

    // ── Chat, Selected Display, Highlights, Heatmap ───────────────────
    // (these remain exactly as before, driving only the communication graph)
    const chatWindow = d3.select("#chat-window");
    function renderChat() {
      const baseMsgs = data.communication.links.filter(
        e => selectedNodes.has(e.source) || selectedNodes.has(e.target)
      );
      chatWindow.html("");
      if (!selectedNodes.size) return;

      // 2) On first render after selection, init date inputs from baseMsgs
      if (filterStart === null && filterEnd === null && baseMsgs.length) {
        // sort by datetime
        const dates = baseMsgs
          .map(e => new Date(e.datetime))
          .sort((a, b) => a - b);
        const min = dates[0], max = dates[dates.length - 1];
        filterStart = min;
        filterEnd = max;
        // set inputs to ISO‐local strings (yyyy-MM-ddTHH:mm)
        document.getElementById("filter-start").value = min.toISOString().slice(0, 16);
        document.getElementById("filter-end").value = max.toISOString().slice(0, 16);
      }
      // 3) Rebuild Source dropdown from **baseMsgs**'s sources
      const sourceSelect = d3.select("#filter-source");
      sourceSelect.selectAll("option").remove();
      sourceSelect.append("option").attr("value", "").text("All");
      const sources = Array.from(new Set(baseMsgs.map(e => e.source)));
      sources.forEach(src =>
        sourceSelect.append("option").attr("value", src).text(src)
      );
      // if the user already had chosen a filterSource that no longer exists, reset:
      if (filterSource && !sources.includes(filterSource)) {
        filterSource = "";
        sourceSelect.property("value", "");
      }

      // 4) Now apply your filters against baseMsgs
      let msgs = baseMsgs.slice();

      // datetime range
      if (filterStart)
        msgs = msgs.filter(e => new Date(e.datetime) >= filterStart);
      if (filterEnd)
        msgs = msgs.filter(e => new Date(e.datetime) <= filterEnd);

      // event_id filter (substring match)
      if (filterEventId)
        msgs = msgs.filter(e => e.event_id.includes(filterEventId));

      // source filter (exact match)
      if (filterSource)
        msgs = msgs.filter(e => e.source === filterSource);

      // now sort & render
      msgs.sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
        .forEach(msg => {
          const sent = selectedNodes.has(msg.source);
          const bubble = chatWindow.append("div")
            .attr("class", `message ${sent ? "sent" : "received"}`);
          bubble.append("div").attr("class", "chat-header")
            .text(`${msg.source} → ${msg.target}: (${msg.event_id})`);
          bubble.append("div").attr("class", "content")
            .text(msg.content);
          bubble.append("div").attr("class", "timestamp")
            .text(new Date(msg.datetime).toLocaleString("en-GB"));
        });
    }

    const selDisp = d3.select("#selected-nodes-display");
    function updateSelectedDisplay() {
      const names = Array.from(selectedNodes);
      selDisp.text(
        names.length
          ? "Selected nodes: " + names.join(", ")
          : "Selected nodes:"
      );
    }

    function updateHighlights() {
      // COMM GRAPH -------------------------
      if (selectedNodes.size) {
        const nbr = new Set([...selectedNodes]);
        data.communication.links.forEach(e => {
          if (selectedNodes.has(e.source)) nbr.add(e.target);
          if (selectedNodes.has(e.target)) nbr.add(e.source);
        });

        // COMM NODES: fade & resize
        commNode
          .style("display", d => nbr.has(d.id) ? null : "none")
          // .attr("opacity", d => nbr.has(d.id) ? 1 : 0.2)
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            // <-- double the area for selected nodes (200 vs. 100)
            .size(selectedNodes.has(d.id) ? 200 : 80)()
          );

        commLabel
          .style("display", d => nbr.has(d.id) ? null : "none")
          .attr("dx", d => selectedNodes.has(d.id) ? 32 : 12);
        // .attr("opacity", d => nbr.has(d.id) ? 1 : 0.2);

        commLinkSel
          .style("display", l =>
            (selectedNodes.has(l.source.id) || selectedNodes.has(l.target.id))
              ? null : "none"
          );

      } else if (selectedTypes.size) {
        // reset to default size & opacity when using type-filter
        commNode
          .style("display", d => selectedTypes.has(d.type) ? null : "none")
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            .size(80)()
          );
        commLabel
          .style("display", d => selectedTypes.has(d.type) ? null : "none");
        commLinkSel
          .style("display", l => {
            const t0 = entityTypeMap.get(l.source.id),
              t1 = entityTypeMap.get(l.target.id);
            return (selectedTypes.has(t0) && selectedTypes.has(t1)) ? null : "none";
          });

      } else {
        // no filter → all default
        commNode
          .style("display", null)
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            .size(80)()
          );

        commLabel.style("display", null)
          .attr("dx", 12);
        commLinkSel.style("display", null);
      }

      // ── REL GRAPH: highlight like COMM graph ──
      if (selectedNodes.size) {
        const nbr = new Set([...selectedNodes]);
        data.relationships.links.forEach(l => {
          if (selectedNodes.has(l.source)) nbr.add(l.target);
          if (selectedNodes.has(l.target)) nbr.add(l.source);
        });

        relNode
          .style("display", d => nbr.has(d.id) ? null : "none")
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            .size(selectedNodes.has(d.id) ? 200 : 80)()
          );

        relLabel
          .style("display", d => nbr.has(d.id) ? null : "none");

        relLinkSel
          .style("display", l =>
            (selectedNodes.has(l.source.id) || selectedNodes.has(l.target.id))
              ? null : "none"
          );

      } else if (selectedTypes.size) {
        relNode
          .style("display", d => selectedTypes.has(d.type) ? null : "none")
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            .size(80)()
          );

        relLabel
          .style("display", d => selectedTypes.has(d.type) ? null : "none");

        relLinkSel
          .style("display", l => {
            const t0 = entityTypeMap.get(l.source.id);
            const t1 = entityTypeMap.get(l.target.id);
            return (selectedTypes.has(t0) && selectedTypes.has(t1)) ? null : "none";
          });

      } else {
        relNode
          .style("display", null)
          .attr("d", d => d3.symbol()
            .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
            .size(80)()
          );

        relLabel.style("display", null);
        relLinkSel.style("display", null);
      }
    }

    // Node click
    commNode.on("click", (e, d) => {
      if (selectedNodes.has(d.id)) selectedNodes.delete(d.id);
      else selectedNodes.add(d.id);
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });
    relNode.on("click", (e, d) => {
      if (selectedNodes.has(d.id)) selectedNodes.delete(d.id);
      else selectedNodes.add(d.id);
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    d3.select("#clear-filter-btn").on("click", () => {
      selectedNodes.clear();
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    // Heatmap rendering
    function renderHeatmap() {
      console.log(`🔄 renderHeatmap() called`);
      const hm = data.heatmap;
      let ents = hm.entities.slice(),
        mat = hm.matrix.map(r => r.slice());
      
      console.log(`🗺️ Heatmap entities sample:`, ents.slice(0, 5));
      console.log(`🗺️ EntityTypeMap sample:`, Array.from(entityTypeMap.entries()).slice(0, 5));
      console.log(`📊 selectedTypes.size:`, selectedTypes.size, `selectedNodes.size:`, selectedNodes.size);

      // filter rows & cols by type or selected nodes
      if (selectedTypes.size) {
        console.log(`🔍 Filtering heatmap by selected types:`, Array.from(selectedTypes));
        const keep = ents
          .map((e, i) => selectedTypes.has(entityTypeMap.get(e)) ? i : -1)
          .filter(i => i >= 0);
        console.log(`📊 Original entities: ${ents.length}, Filtered entities: ${keep.length}`);
        ents = keep.map(i => hm.entities[i]);
        mat = keep.map(i => keep.map(j => hm.matrix[i][j]));
      } else if (selectedNodes.size) {
        console.log(`🔍 Filtering heatmap by selected nodes:`, Array.from(selectedNodes));
        const keep = ents
          .map((e, i) => selectedNodes.has(e) ? i : -1)
          .filter(i => i >= 0);
        console.log(`📊 Original entities: ${ents.length}, Filtered entities: ${keep.length}`);
        ents = keep.map(i => hm.entities[i]);
        mat = keep.map(i => keep.map(j => hm.matrix[i][j]));
      }

      // size
      const panel = document.getElementById("heatmap-container"),
        W = Math.min(panel.clientWidth, 600);

      // band scales for equal cell sizes
      const xScale = d3.scaleBand().domain(ents).range([0, W]).padding(0),
        yScale = d3.scaleBand().domain(ents).range([0, W]).padding(0);

      const labelMargin = 40;
      const svgHM = d3.select(panel).html("")
        .append("svg")
        .attr("width", W + 80)     // room for right legend
        .attr("height", W + labelMargin)
        .style("overflow", "visible");

      const scale = d3.scaleSequential([0, 1], d3.interpolateViridis);

      // draw cells with click
      svgHM.append("g").attr("class", "cells")
        .selectAll("rect")
        .data(ents.flatMap((row, i) =>
          ents.map((col, j) => ({ row, col, value: mat[i][j] }))
        ))
        .join("rect")
        .attr("x", d => xScale(d.col))
        .attr("y", d => yScale(d.row))
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => scale(d.value))
        .style("cursor", "pointer")
        .on("click", (e, d) => {
          if (selectedNodes.has(d.row)) selectedNodes.delete(d.row);
          else selectedNodes.add(d.row);
          if (selectedNodes.has(d.col)) selectedNodes.delete(d.col);
          else selectedNodes.add(d.col);
          updateSelectedDisplay();
          renderChat();
          updateHighlights();
          renderHeatmap();
        })
        .on("mouseover", (e, d) => {
          tooltip.style("visibility", "visible")
            .html(`${d.row} → ${d.col}<br>Value: ${d.value.toFixed(2)}`);
        })
        .on("mousemove", e => {
          tooltip.style("top", (e.pageY + 10) + "px")
            .style("left", (e.pageX + 10) + "px");
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

      // column labels rotated
      svgHM.append("g")
        .selectAll("text")
        .data(ents)
        .join("text")
        .attr("transform", (d, i) =>
          // place at mid‐cell, down near bottom margin, then rotate
          `translate(${xScale(d) + xScale.bandwidth() / 2}, ${W + labelMargin - 35}) rotate(-40)`
        )
        .text(d => d)
        .attr("font-size", "10px")
        .attr("text-anchor", "end")
        .attr("pointer-events", "none")
        .attr("font-weight", "400")
        .attr("fill", "#333");

      // row labels (left side) - made invisible
      svgHM.append("g")
        .selectAll("text")
        .data(ents)
        .join("text")
        .attr("x", -5)
        .attr("y", d => yScale(d) + yScale.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text(d => d)
        .attr("font-size", "10px")
        .attr("text-anchor", "end")
        .attr("pointer-events", "none")
        .attr("font-weight", "400")
        .attr("fill", "#333")
        .style("opacity", 0); // Make row labels invisible

      // right‐side vertical legend
      const fullH = W,
        lgH = Math.min(fullH, 300),
        lgY = (fullH - lgH) / 2;

      const defs = svgHM.append("defs");
      const grad = defs.append("linearGradient")
        .attr("id", "heatmap-vert-grad")
        .attr("x1", "0%").attr("y1", "100%")
        .attr("x2", "0%").attr("y2", "0%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", scale(0));
      grad.append("stop").attr("offset", "100%").attr("stop-color", scale(1));

      svgHM.append("rect")
        .attr("class", "heatmap-legend")
        .attr("x", W + 20)
        .attr("y", lgY)
        .attr("width", 10)
        .attr("height", lgH)
        .style("fill", "url(#heatmap-vert-grad)");

      const legendScale = d3.scaleLinear().domain([0, 1]).range([lgY + lgH, lgY]);
      svgHM.append("g")
        .attr("transform", `translate(${W + 30},0)`)
        .call(d3.axisRight(legendScale).ticks(5).tickFormat(d3.format(".2f")));
    }

    // initial draws
    updateSelectedDisplay();
    renderChat();
    updateHighlights();
    renderHeatmap();

  }).catch(err => console.error("Error loading graph data:", err));
}

// Confirm function is loaded
console.log('✅ init_graph function defined and ready');
