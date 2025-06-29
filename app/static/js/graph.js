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
  // ─────────────────────────────────────────────────────────────────

 d3.json("/data/graph").then(data => {
    // Shared state
    let selectedNodes = new Set();
    let selectedTypes = new Set();

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
      id: e.event_id, source: e.source, target: e.target
    }));

    // Type → color
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const entityTypeMap = new Map(commNodes.map(d => [d.id, d.type]));

    // Tooltip for heatmap
    const tooltip = d3.select("body").append("div")
      .attr("class", "heatmap-tooltip")
      .style("visibility", "hidden");

    // ── COMMUNICATION GRAPH ────────────────────────────────────────────
    const commSim = d3.forceSimulation(commNodes)
      .force("link", d3.forceLink(commLinks).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(commWidth/2, height/2))
      .force("collision", d3.forceCollide().radius(30));

    // Links
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
        .attr("stroke", "#1e40af")
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
      .force("collision", d3.forceCollide().radius(25));

    const relLinkSel = relG.append("g").attr("class", "links")
      .selectAll("line")
      .data(relLinks)
      .join("line")
        .attr("stroke", "#666")
        .attr("stroke-width", 1.5);

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
      relLinkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
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
      .attr("transform", `translate(${commWidth - 140},20)`);
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
      chatWindow.html("");
      if (!selectedNodes.size) return;
      data.communication.links
        .filter(e => selectedNodes.has(e.source) || selectedNodes.has(e.target))
        .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
        .forEach(msg => {
          const sent = selectedNodes.has(msg.source);
          const bubble = chatWindow.append("div")
            .attr("class", `message ${sent?"sent":"received"}`);
          bubble.append("div")
            .attr("class","chat-header")
            .text(`${msg.source} → ${msg.target}:`);
          bubble.append("div")
            .attr("class","content")
            .text(msg.content);
          bubble.append("div")
            .attr("class","timestamp")
            .text(new Date(msg.datetime).toLocaleString());
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
      if (selectedNodes.size) {
        const nbr = new Set([...selectedNodes]);
        data.communication.links.forEach(e => {
          if (selectedNodes.has(e.source)) nbr.add(e.target);
          if (selectedNodes.has(e.target)) nbr.add(e.source);
        });
        commNode.attr("opacity",d=>nbr.has(d.id)?1:0.2);
        commLabel.attr("opacity",d=>nbr.has(d.id)?1:0.2);
        commLinkSel.attr("opacity",l=>
          (selectedNodes.has(l.source.id)||selectedNodes.has(l.target.id))?1:0.1
        );
      } else if (selectedTypes.size) {
        commNode.attr("opacity",d=>selectedTypes.has(d.type)?1:0.2);
        commLabel.attr("opacity",d=>selectedTypes.has(d.type)?1:0.2);
        commLinkSel.attr("opacity",l=>{
          const t0 = entityTypeMap.get(l.source.id),
                t1 = entityTypeMap.get(l.target.id);
          return (selectedTypes.has(t0)&&selectedTypes.has(t1))?1:0.1;
        });
      } else {
        commNode.attr("opacity",1);
        commLabel.attr("opacity",1);
        commLinkSel.attr("opacity",0.6);
      }
      // relationship graph remains static—no filtering here
    }

    // Node click on communication only
    commNode.on("click",(e,d)=>{
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

      const svgHM = d3.select(panel).html("")
        .append("svg")
          .attr("width", W + 80)     // room for right legend
          .attr("height", W + 60);

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
        .data(ents).join("text")
          .attr("x", d=> xScale(d) + xScale.bandwidth()/2)
          .attr("y",-5)
          .text(d=>d)
          .attr("font-size","10px")
          .attr("text-anchor","start")
          .attr("transform", d=>`translate(${xScale(d)+xScale.bandwidth()/2},10) rotate(-40)`)
          .attr("pointer-events","none");

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
