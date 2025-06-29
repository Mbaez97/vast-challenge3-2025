function init_graph() {
  // Set up main SVG
  const container = d3.select("#graph-container-2");
  const width = container.node().clientWidth;
  const height = 600;
  container.html("");
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "bg-white rounded-lg shadow-md");
  const g = svg.append("g");

  d3.json("/data/graph").then(data => {
    const allEdges = data.edges;
    let selectedNodes = new Set();
    let selectedTypes = new Set();

    // Prepare nodes & links
    const nodesData = data.nodes.map(n => ({ id: n.id, type: n.sub_type }));
    const entityTypeMap = new Map(nodesData.map(d => [d.id, d.type]));
    const links = allEdges.map(e => ({
      id: e.event_id, source: e.source, target: e.target
    }));

    // Tooltip for heatmap
    const tooltip = d3.select("body").append("div")
      .attr("class", "heatmap-tooltip")
      .style("visibility", "hidden");

    // Force simulation
    const sim = d3.forceSimulation(nodesData)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width/2, height/2))
      .force("collision", d3.forceCollide().radius(30));

    // Draw links
    const link = g.append("g").attr("class","links")
      .selectAll("line")
      .data(links).join("line")
        .attr("stroke","#999")
        .attr("stroke-width",2);

    // Draw nodes
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const node = g.append("g").attr("class","nodes")
      .selectAll("circle")
      .data(nodesData).join("circle")
        .attr("r",10)
        .attr("fill", d=>color(d.type))
        .attr("stroke","#1e40af")
        .attr("stroke-width",2)
        .call(d3.drag()
          .on("start", e => { if (!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx=e.subject.x; e.subject.fy=e.subject.y; })
          .on("drag",  e => { e.subject.fx=e.x; e.subject.fy=e.y; })
          .on("end",   e => { if (!e.active) sim.alphaTarget(0); e.subject.fx=null; e.subject.fy=null; })
        );

    // Type legend for graph
    const types = Array.from(new Set(nodesData.map(d=>d.type)));
    const legend = svg.append("g").attr("transform", `translate(${width-140},20)`);
    const legendItems = legend.selectAll("g")
      .data(types).join("g")
        .attr("transform",(d,i)=>`translate(0,${i*20})`)
        .style("cursor","pointer")
        .on("click",(e,t)=>{
          if (selectedTypes.has(t)) selectedTypes.delete(t);
          else selectedTypes.add(t);
          updateHighlights();
          updateLegendStyles();
          renderHeatmap();
        });
    legendItems.append("rect")
      .attr("width",14).attr("height",14)
      .attr("fill",d=>color(d));
    legendItems.append("text")
      .attr("x",18).attr("y",12)
      .text(d=>d)
      .attr("font-size","12px")
      .attr("fill","#1f2937");
    function updateLegendStyles(){
      legendItems.select("rect")
        .attr("stroke", d=>selectedTypes.has(d)?"#1e40af":"none")
        .attr("stroke-width", d=>selectedTypes.has(d)?2:0);
    }
    updateLegendStyles();

    // Labels
    const label = g.append("g").attr("class","labels")
      .selectAll("text")
      .data(nodesData).join("text")
        .text(d=>d.id)
        .attr("dx",12).attr("dy",4)
        .attr("font-size","12px");

    // Tick
    sim.on("tick",()=>{
      link
        .attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
        .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      node
        .attr("cx",d=>d.x).attr("cy",d=>d.y);
      label
        .attr("x",d=>d.x).attr("y",d=>d.y);
    });

    // Zoom
    svg.call(d3.zoom().on("zoom", ev=> g.attr("transform", ev.transform)));

    // Chat rendering
    const chatWindow = d3.select("#chat-window");
    function renderChat(){
      chatWindow.html("");
      if (!selectedNodes.size) return;
      allEdges
        .filter(e => selectedNodes.has(e.source) || selectedNodes.has(e.target))
        .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
        .forEach(msg => {
          const sent = selectedNodes.has(msg.source);
          const b = chatWindow.append("div")
            .attr("class", `message ${sent?"sent":"received"}`);
          b.append("div").attr("class","chat-header")
            .text(`${msg.source} → ${msg.target}:`);
          b.append("div").attr("class","content")
            .text(msg.content);
          b.append("div").attr("class","timestamp")
            .text(new Date(msg.datetime).toLocaleString());
        });
    }

    // Selected‐nodes display
    const selDisp = d3.select("#selected-nodes-display");
    function updateSelectedDisplay(){
      const names = Array.from(selectedNodes);
      selDisp.text(
        names.length
          ? "Selected nodes: " + names.join(", ")
          : "Selected nodes:"
      );
    }

    // Graph highlight
    function updateHighlights(){
      if (selectedNodes.size) {
        const nbr = new Set([...selectedNodes]);
        allEdges.forEach(e => {
          if (selectedNodes.has(e.source)) nbr.add(e.target);
          if (selectedNodes.has(e.target)) nbr.add(e.source);
        });
        node
          .attr("opacity", d=>nbr.has(d.id)?1:0.2)
          .attr("r", d=>selectedNodes.has(d.id)?14:10);
        label.attr("opacity", d=>nbr.has(d.id)?1:0.2);
        link.attr("opacity", l=> 
          (selectedNodes.has(l.source.id) || selectedNodes.has(l.target.id))?1:0.1
        );
      } else if (selectedTypes.size) {
        node.attr("opacity",d=>selectedTypes.has(d.type)?1:0.2).attr("r",10);
        label.attr("opacity",d=>selectedTypes.has(d.type)?1:0.2);
        link.attr("opacity",l=>{
          const t0=entityTypeMap.get(l.source.id),
                t1=entityTypeMap.get(l.target.id);
          return (selectedTypes.has(t0)&&selectedTypes.has(t1))?1:0.1;
        });
      } else {
        node.attr("opacity",1).attr("r",10);
        label.attr("opacity",1);
        link.attr("opacity",0.6);
      }
    }

    // Node‐click
    node.on("click",(e,d)=>{
      if (selectedNodes.has(d.id)) selectedNodes.delete(d.id);
      else selectedNodes.add(d.id);
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    // Clear‐filter
    d3.select("#clear-filter-btn").on("click", ()=>{
      selectedNodes.clear();
      updateSelectedDisplay();
      renderChat();
      updateHighlights();
      renderHeatmap();
    });

    //
    // Heatmap
    //
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
            W = Math.min(panel.clientWidth, 600),
            n = ents.length;

      // band scales
      const xScale = d3.scaleBand().domain(ents).range([0, W]).padding(0),
            yScale = d3.scaleBand().domain(ents).range([0, W]).padding(0);

      // clear & create SVG
      const svgHM = d3.select(panel).html("")
        .append("svg")
          .attr("width", W + 80)     // room for right legend
          .attr("height", W + 60);

      const scale = d3.scaleSequential([0,1], d3.interpolateViridis);

      // draw cells
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
            // toggle that entity
            if (selectedNodes.has(d.row)) selectedNodes.delete(d.row);
            else selectedNodes.add(d.row);
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
      const legendDef = svgHM.append("defs")
        .append("linearGradient")
          .attr("id","heatmap-vert-grad")
          .attr("x1","0%").attr("y1","100%")
          .attr("x2","0%").attr("y2","0%");
      legendDef.append("stop").attr("offset","0%").attr("stop-color", scale(0));
      legendDef.append("stop").attr("offset","100%").attr("stop-color", scale(1));

      const fullH = W,
            lgH   = Math.min(fullH, 300),
            lgY   = (fullH - lgH)/2;

      svgHM.append("rect")
        .attr("class","heatmap-legend")
        .attr("x", W+20)
        .attr("y", lgY)
        .attr("width", 10)
        .attr("height", lgH)
        .style("fill","url(#heatmap-vert-grad)");

      const legendScale = d3.scaleLinear()
        .domain([0,1]).range([lgY+lgH, lgY]);
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
