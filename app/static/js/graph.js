function init_graph() {
    // Dimensions for the SVG
    const width = 800;
    const height = 600;

    // Create SVG container
    const container = d3.select("#graph-container");
    container.html(""); // Clear previous content

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("class", "bg-white rounded-lg shadow-md");

    // Create a group for zoomable content
    const g = svg.append("g");

    // Fetch data from Flask endpoint
    d3.json("/data/graph").then(data => {
        console.log("Received graph data:", data); // Debug log

        // Transform node data to objects with id
        const nodes = data.nodes.map(id => ({ id }));
        const links = data.edges.map(edge => ({
            source: edge[0],
            target: edge[1]
        }));

        // Create force simulation
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(30));

        // Create links
        const link = g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", 2);

        // Create nodes
        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("r", 10)
            .attr("fill", "#2563eb")
            .attr("stroke", "#1e40af")
            .attr("stroke-width", 2)
            .call(drag(simulation));

        // Add labels
        const label = g.append("g")
            .attr("class", "labels")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .text(d => d.id)
            .attr("font-size", "12px")
            .attr("dx", 12)
            .attr("dy", 4);

        // Update positions on each tick
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

        // Zoom functionality
        const zoom = d3.zoom()
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        // Drag functions
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
    }).catch(error => {
        console.error("Error loading graph data:", error);
    });
}

// Export the init function for external access
window.init_graph = init_graph;
