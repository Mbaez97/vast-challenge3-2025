function init_graph() {
  // ── Containers and SVG setup ─────────────────────────────────────────
  const commContainer = d3.select("#graph-container-2");
  const relContainer  = d3.select("#relationship-container");
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

  // ── Static Shape Legend on Communication ────────────────────────────
  const shapeLegend = commSvg.append("g")
    .attr("transform", "translate(20,20)");
  const shapeItems = [
    { label: "Real Name",  symbol: d3.symbolCircle },
    { label: "Pseudonym",  symbol: d3.symbolStar   }
  ];
  shapeLegend.selectAll("g.legend-shape-item")
    .data(shapeItems)
    .join("g")
      .attr("transform", (_, i) => `translate(0,${i * 24})`)
    .call(item => {
      item.append("path")
        .attr("d", d3.symbol().type(d => d.symbol).size(100))
        .attr("fill", "#eee")
        .attr("stroke", "#333");
      item.append("text")
        .attr("x", 20)
        .attr("y", 4)
        .text(d => d.label)
        .attr("font-size", "12px")
        .attr("alignment-baseline", "middle");
    });

  
  d3.json("/data/graph").then(data => {
    // Shared state
    let selectedNodes = new Set();
    let selectedTypes = new Set();
    // new filter state:
    let filterStart = null,
        filterEnd   = null,
        filterEventId = "",
        filterSource  = "";

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
      filterStart   = sd ? new Date(sd) : null;
      filterEnd     = ed ? new Date(ed) : null;
      filterEventId = document.getElementById("filter-event-id").value.trim();
      filterSource  = document.getElementById("filter-source").value;
      renderChat();
    });
    d3.select("#clear-chat-filters").on("click", () => {
      filterStart = filterEnd = null;
      filterEventId = filterSource = "";
      document.getElementById("filter-start").value = "";
      document.getElementById("filter-end").value   = "";
      document.getElementById("filter-event-id").value = "";
      document.getElementById("filter-source").value   = "";
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
        .attr("transform", (_,i) => `translate(0,${i*20})`)
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

    // Type → color
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const entityTypeMap = new Map(commNodes.map(d => [d.id, d.type]));

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

    console.log(commNodes);
    // ── COMMUNICATION GRAPH ────────────────────────────────────────────
    const commSim = d3.forceSimulation(commNodes)
      .force("link", d3.forceLink(commLinks).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(commWidth/2, height/2))
      .force("collision", d3.forceCollide().radius(30))
      .force("radial", d3.forceRadial(d => radialRadius[d.type] || 150, commWidth/2, height/2).strength(0.8));

    const commLinkSel = commG.append("g").attr("class", "links")
      .selectAll("line")
      .data(commLinks)
      .join("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);

    // Nodes (circle vs star)
    const commNode = commG.append("g").attr("class", "nodes")
      .selectAll("path")
      .data(commNodes)
      .join("path")
        .attr("d", d => d3.symbol()
                         .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
                         .size(100)()
        )
        .attr("fill", d => color(d.type))
        .attr("stroke", "#333")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .call(d3.drag()
          .on("start", e => { if (!e.active) commSim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
          .on("drag",  e => { e.subject.fx = e.x; e.subject.fy = e.y; })
          .on("end",   e => { if (!e.active) commSim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; })
        );

    // Labels
    const commLabel = commG.append("g").attr("class", "labels")
      .selectAll("text")
      .data(commNodes)
      .join("text")
        .text(d => d.id)
        .attr("dx", 12)
        .attr("dy", 4)
        .attr("font-size", "12px");

    // Tick
    commSim.on("tick", () => {
      commLinkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      commNode
        .attr("transform", d => `translate(${d.x},${d.y})`);
      commLabel
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    // Zoom
    commSvg.call(d3.zoom().on("zoom", ev => {
      commG.attr("transform", ev.transform);
    }));

    // ── RELATIONSHIP GRAPH (static) ───────────────────────────────────
    const relSim = d3.forceSimulation(relNodes)
      .force("link", d3.forceLink(relLinks).id(d => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(relWidth/2, height/2))
      .force("collision", d3.forceCollide().radius(25))
      .force("radial", d3.forceRadial(d => radialRadius[d.type] || 150, relWidth/2, height/2).strength(0.8));

    const relLinkSel = relG.append("g").attr("class", "links")
      .selectAll("path")
      .data(relLinks)
      .join("path")
        .attr("fill", "none")
        .attr("stroke", d => linkColor(d.type))
        .attr("stroke-width", 2)
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
          .style("top",   `${e.pageY+10}px`)
          .style("left",  `${e.pageX+10}px`);
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

    const relNode = relG.append("g").attr("class", "nodes")
      .selectAll("path")
      .data(relNodes)
      .join("path")
        .attr("d", d => d3.symbol()
                         .type(d.is_pseudonym ? d3.symbolStar : d3.symbolCircle)
                         .size(80)()
        )
        .attr("fill", d => color(d.type))
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5)
        .style("cursor", "grab")
        .call(d3.drag()
          .on("start", e => { if (!e.active) relSim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
          .on("drag",  e => { e.subject.fx = e.x; e.subject.fy = e.y; })
          .on("end",   e => { if (!e.active) relSim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; })
        );

    const relLabel = relG.append("g").attr("class", "labels")
      .selectAll("text")
      .data(relNodes)
      .join("text")
        .text(d => d.id)
        .attr("dx", 12)
        .attr("dy", 4)
        .attr("font-size", "11px");

    relSim.on("tick", () => {
      relLinkSel.attr("d", d => {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const dr = Math.hypot(dx, dy)
                / (1 + Math.abs(d._parallelIndex - (d._parallelTotal-1)/2));  
        // the denominator staggers the radius for each parallel link
        
        // SVG arc: rx, ry, x-axis-rotation, large-arc-flag, sweep-flag, x, y
        return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
      });
      relNode
        .attr("transform", d => `translate(${d.x},${d.y})`);
      relLabel
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    relSvg.call(d3.zoom().on("zoom", ev => {
      relG.attr("transform", ev.transform);
    }));

    // ── Interactive Type Legend on Communication ──────────────────────
    const types = Array.from(new Set(commNodes.map(d => d.type)));
    const legend = commSvg.append("g")
      .attr("transform", `translate(12,65)`)
      // .attr("transform", `translate(${commWidth - 130},20)`);
    const legendItems = legend.selectAll("g.type-item")
      .data(types)
      .join("g")
        .attr("transform", (_, i) => `translate(0,${i * 20})`)
        .style("cursor", "pointer")
        .on("click", (e, t) => {
          if (selectedTypes.has(t)) selectedTypes.delete(t);
          else selectedTypes.add(t);
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
          .sort((a,b) => a - b);
        const min = dates[0], max = dates[dates.length - 1];
        filterStart = min;
        filterEnd   = max;
        // set inputs to ISO‐local strings (yyyy-MM-ddTHH:mm)
        document.getElementById("filter-start").value = min.toISOString().slice(0,16);
        document.getElementById("filter-end").value   = max.toISOString().slice(0,16);
      }
      // 3) Rebuild Source dropdown from **baseMsgs**'s sources
      const sourceSelect = d3.select("#filter-source");
      sourceSelect.selectAll("option").remove();
      sourceSelect.append("option").attr("value","").text("All");
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
            .attr("class", `message ${sent?"sent":"received"}`);
          bubble.append("div").attr("class","chat-header")
            .text(`${msg.source} → ${msg.target}: (${msg.event_id})`);
          bubble.append("div").attr("class","content")
            .text(msg.content);
          bubble.append("div").attr("class","timestamp")
            .text(new Date(msg.datetime).toLocaleString("en-GB"));
      });
    }

    const selDisp = d3.select("#selected-nodes-display");
    function updateSelectedDisplay(){
      const names = Array.from(selectedNodes);
      selDisp.text(
        names.length
          ? "Selected nodes: " + names.join(", ")
          : "Selected nodes:"
      );
    }

    function updateHighlights(){
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
                          .size(selectedNodes.has(d.id) ? 2000 : 100)()
          );

        commLabel
          .style("display", d => nbr.has(d.id) ? null : "none")
          .attr("dx",    d => selectedNodes.has(d.id) ? 32 : 12);
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
                          .size(100)()
          );
        commLabel
          .style("display", d => selectedTypes.has(d.type) ? null : "none")
          .attr("dx", 12)
          // .attr("opacity", d => selectedTypes.has(d.type) ? 1 : 0.2);
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
                          .size(100)()
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
        .size(selectedNodes.has(d.id) ? 2000 : 80)()
          );

        relLabel
          .style("display", d => nbr.has(d.id) ? null : "none")
          .attr("dx",    d => selectedNodes.has(d.id) ? 32 : 12);

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
          .style("display", d => selectedTypes.has(d.type) ? null : "none")
          .attr("dx", 12);

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

        relLabel.style("display", null)
          .attr("dx", 12);
        relLinkSel.style("display", null);
      }
    }

    // Node click
    commNode.on("click",(e,d)=>{
      if (selectedNodes.has(d.id)) selectedNodes.delete(d.id);
      else selectedNodes.add(d.id);
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });
    relNode.on("click",(e,d)=>{
      if (selectedNodes.has(d.id)) selectedNodes.delete(d.id);
      else selectedNodes.add(d.id);
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    d3.select("#clear-filter-btn").on("click",()=>{
      selectedNodes.clear();
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    // Heatmap rendering
    function renderHeatmap() {
      const hm = data.heatmap;
      let ents = hm.entities.slice(),
          mat  = hm.matrix.map(r=>r.slice());

      // filter rows & cols by type
      if (selectedTypes.size) {
        const keep = ents
          .map((e,i)=> selectedTypes.has(entityTypeMap.get(e))? i : -1 )
          .filter(i=>i>=0);
        ents = keep.map(i=>hm.entities[i]);
        mat  = keep.map(i=> keep.map(j=>hm.matrix[i][j]) );
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
          .style("overflow","visible");

      const scale = d3.scaleSequential([0,1], d3.interpolateViridis);

      // draw cells with click
      svgHM.append("g").attr("class","cells")
        .selectAll("rect")
        .data(ents.flatMap((row,i)=>
          ents.map((col,j)=>({ row, col, value: mat[i][j] }))
        ))
        .join("rect")
          .attr("x", d=> xScale(d.col))
          .attr("y", d=> yScale(d.row))
          .attr("width",  xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", d=> scale(d.value))
          .style("cursor","pointer")
          .on("click", (e,d)=> {
            if (selectedNodes.has(d.row)) selectedNodes.delete(d.row);
            else selectedNodes.add(d.row);
            if (selectedNodes.has(d.col)) selectedNodes.delete(d.col);
            else selectedNodes.add(d.col);
            updateSelectedDisplay();
            renderChat();
            updateHighlights();
            renderHeatmap();
          })
          .on("mouseover", (e,d)=> {
            tooltip.style("visibility","visible")
                   .html(`${d.row} → ${d.col}<br>Value: ${d.value.toFixed(2)}`);
          })
          .on("mousemove", e=> {
            tooltip.style("top",(e.pageY+10)+"px")
                   .style("left",(e.pageX+10)+"px");
          })
          .on("mouseout", ()=> tooltip.style("visibility","hidden"));

      // column labels rotated
      svgHM.append("g")
          .selectAll("text")
          .data(ents, d => {
            let entityNode = commNodes.find(n => n.id === d);
            if (!entityNode) return d; // skip if not found
            return `* ${entityNode.id}` ? entityNode.is_pseudonym : d; // add asterisk for pseudonyms
          })
          .join("text")
            .attr("transform", (d,i) =>
              // place at mid‐cell, down near bottom margin, then rotate
              `translate(${xScale(d) + xScale.bandwidth()/2}, ${W + labelMargin - 35}) rotate(-40)`
            )
            .text(d => d)
            .attr("font-size", "10px")
            .attr("text-anchor", "end")
            .attr("pointer-events", "none");

      // right‐side vertical legend
      const fullH = W,
            lgH   = Math.min(fullH, 300),
            lgY   = (fullH - lgH)/2;

      const defs = svgHM.append("defs");
      const grad = defs.append("linearGradient")
        .attr("id","heatmap-vert-grad")
        .attr("x1","0%").attr("y1","100%")
        .attr("x2","0%").attr("y2","0%");
      grad.append("stop").attr("offset","0%").attr("stop-color",scale(0));
      grad.append("stop").attr("offset","100%").attr("stop-color",scale(1));

      svgHM.append("rect")
        .attr("class","heatmap-legend")
        .attr("x", W+20)
        .attr("y", lgY)
        .attr("width", 10)
        .attr("height", lgH)
        .style("fill","url(#heatmap-vert-grad)");

      const legendScale = d3.scaleLinear().domain([0,1]).range([lgY+lgH, lgY]);
      svgHM.append("g")
        .attr("transform", `translate(${W+30},0)`)
        .call(d3.axisRight(legendScale).ticks(5).tickFormat(d3.format(".2f")));
    }

    // initial draws
    updateSelectedDisplay();
    renderChat();
    updateHighlights();
    renderHeatmap();

  }).catch(err=>console.error("Error loading graph data:",err));
}
