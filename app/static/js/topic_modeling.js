function init_topic_modeling() {
    const width = 800;
    const height = 600;
    const container = d3.select("#graph-container");
    container.html("");

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, width, height])
        .attr("class", "bg-white");

    let g = svg.append("g");
    let topicData = {};
    let currentTopic = null;
    let currentMethod = "lda?vectorizer=bow";
    let allMessages = [];
    let filteredMessages = [];
    let currentPage = 1;
    const messagesPerPage = 10;
    let currentEntityFilter = null;

    // Method change handler
    const methodSelector = d3.select("#topic-method");
    methodSelector.on("change", function () {
        currentMethod = this.value;
        loadTopicData();
    });

    // Topic count handlers
    const topicCountSlider = d3.select("#topic-count");
    const topicCountAuto = d3.select("#topic-count-auto");
    const topicCountDisplay = d3.select("#topic-count-display");

    // Handle auto checkbox toggle
    topicCountAuto.on("change", function() {
        const isAuto = this.checked;
        topicCountSlider.property("disabled", isAuto);
        updateTopicCountDisplay();
        loadTopicData();
    });

    // Handle slider change
    topicCountSlider.on("input", function() {
        updateTopicCountDisplay();
    });

    topicCountSlider.on("change", function() {
        loadTopicData();
    });

    // Update display function
    function updateTopicCountDisplay() {
        const isAuto = topicCountAuto.property("checked");
        if (isAuto) {
            topicCountDisplay.text("Auto");
        } else {
            const value = topicCountSlider.property("value");
            topicCountDisplay.text(value);
        }
    }

    function loadTopicData() {
        const isAuto = topicCountAuto.property("checked");
        const topicCount = isAuto ? "auto" : topicCountSlider.property("value");
        const url = `/data/topic_modeling?method=${currentMethod}&num_topics=${topicCount}`;

        // Show loading indicator
        container.html(`<div class="text-center py-10"><div class="spinner"></div>Loading data...</div>`);

        d3.json(url).then(data => {
            if (data.error) {
                console.error("Error loading data:", data.error);
                container.html(`<div class="error-message p-4 text-red-600">Error: ${data.error}</div>`);
                return;
            }

            const { graph, topics, entity_topic_scores, method_used, vectorizer_used, total_communications, messages, topic_metrics, model_metrics } = data;
            topicData = {
                topics,
                entity_topic_scores,
                topic_metrics: topic_metrics.reduce((acc, metric) => {
                    acc[metric.id] = metric;
                    return acc;
                }, {})
            };

            // Store all messages
            allMessages = messages;
            filteredMessages = [];
            currentPage = 1;
            currentEntityFilter = null;

            // Update message count
            d3.select("#message-count").text("0");

            // Update info display
            let methodInfo = `Method: ${method_used}`;
            if (method_used === "lda") {
                methodInfo += ` (${vectorizer_used.toUpperCase()})`;
            }
            methodInfo += ` | Communications: ${total_communications} | Topics: ${topics.length}`;

            d3.select("#method-info").html(methodInfo);
            
            // Update model metrics display
            const metricsDisplay = d3.select("#model-metrics");
            if (model_metrics && Object.keys(model_metrics).length > 0) {
                metricsDisplay.html(`
                    <div>Coherence: ${model_metrics.coherence || '--'}</div>
                    <div>Perplexity: ${model_metrics.perplexity || '--'}</div>
                    <div>Diversity: ${model_metrics.diversity || '--'}</div>
                `);
            } else {
                metricsDisplay.html(`
                    <div>Coherence: --</div>
                    <div>Perplexity: --</div>
                    <div>Diversity: --</div>
                `);
            }
            
            // Update topic count display to reflect actual topics generated
            if (method_used === "bertopic") {
                // For BERTopic, show actual count since it auto-determines topics
                topicCountDisplay.text(`${topics.length} (Auto)`);
                topicCountAuto.property("checked", true);
                topicCountSlider.property("disabled", true);
            }

            // Recreate SVG structure (in case it was replaced by loading message)
            container.html("");
            const svg = container.append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", [0, 0, width, height])
                .attr("class", "bg-white");
            const g = svg.append("g");

            // Populate topic selector
            const topicSelector = d3.select("#topic-selector");
            topicSelector.html("");
            topicSelector.append("option").text("-- Select Topic --").attr("value", "");

            topics.forEach(topic => {
                if (topic.keywords && topic.keywords.length > 0) {
                    topicSelector.append("option")
                        .text(`Topic ${topic.id}: ${topic.keywords.slice(0, 3).join(", ")}`)
                        .attr("value", topic.id);
                }
            });

            // Prepare nodes and links
            const nodes = graph.nodes.map(n => ({
                ...n,
                type: n.sub_type || "Entity",
                topicScores: entity_topic_scores[n.id] || {}
            }));

            const links = graph.edges.map(e => ({
                ...e,
                source: e.source,
                target: e.target
            }));

            // Create color scale for entity types
            const allTypes = Array.from(new Set(nodes.map(d => d.type)));
            const color = d3.scaleOrdinal(d3.schemeCategory10).domain(allTypes);

            // Calculate circular layout similar to network exploration
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 80;
            const bundlingRadius = radius * 0.15;

            // Group nodes by type for circular arrangement
            const nodesByType = d3.group(nodes, d => d.type);
            
            // Create connection counts for node sizing
            const nodeConnectionCounts = new Map();
            links.forEach(link => {
                nodeConnectionCounts.set(link.source, (nodeConnectionCounts.get(link.source) || 0) + 1);
                nodeConnectionCounts.set(link.target, (nodeConnectionCounts.get(link.target) || 0) + 1);
            });

            // Position nodes in circular layout
            let nodePositions = new Map();
            let allLeafNodes = [];
            const totalNodes = nodes.length;
            let currentAngle = -Math.PI / 2;

            // Calculate angles for each type
            allTypes.forEach(typeName => {
                const nodesOfType = nodesByType.get(typeName) || [];
                if (nodesOfType.length === 0) return;

                const proportion = nodesOfType.length / totalNodes;
                const sectorAngle = 2 * Math.PI * proportion;

                // Sort nodes by connection count
                const sortedNodes = nodesOfType.sort((a, b) =>
                    (nodeConnectionCounts.get(b.id) || 0) - (nodeConnectionCounts.get(a.id) || 0)
                );

                sortedNodes.forEach((node, nodeIndex) => {
                    const t = sortedNodes.length > 1 ? nodeIndex / (sortedNodes.length - 1) : 0.5;
                    const angle = currentAngle + (t * sectorAngle * 0.95);
                    
                    const x = centerX + Math.cos(angle) * radius;
                    const y = centerY + Math.sin(angle) * radius;
                    
                    const nodeData = {
                        ...node,
                        x, y, angle,
                        connectionCount: nodeConnectionCounts.get(node.id) || 1,
                        topicScores: node.topicScores || {}
                    };
                    
                    nodePositions.set(node.id, nodeData);
                    allLeafNodes.push(nodeData);
                });

                currentAngle += sectorAngle;
            });

            // Hierarchical edge bundling path creation
            function createHierarchicalBundledPath(source, target) {
                const sx = source.x, sy = source.y;
                const tx = target.x, ty = target.y;

                const sourceAngle = Math.atan2(sy - centerY, sx - centerX);
                const targetAngle = Math.atan2(ty - centerY, tx - centerX);

                let angleSpan = Math.abs(targetAngle - sourceAngle);
                if (angleSpan > Math.PI) {
                    angleSpan = 2 * Math.PI - angleSpan;
                }

                const bundlingIntensity = Math.min(angleSpan / Math.PI, 1.0);
                const steps = 5;
                const controlPoints = [];

                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const currentAngle = sourceAngle + (targetAngle - sourceAngle) * t;

                    let currentRadius;
                    if (i === 0 || i === steps) {
                        currentRadius = radius;
                    } else {
                        const bundleDepth = Math.sin(t * Math.PI) * bundlingIntensity;
                        currentRadius = radius - (bundleDepth * (radius - bundlingRadius));
                    }

                    controlPoints.push({
                        x: centerX + Math.cos(currentAngle) * currentRadius,
                        y: centerY + Math.sin(currentAngle) * currentRadius
                    });
                }

                let path = `M${sx},${sy}`;
                if (controlPoints.length > 2) {
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

            // Create bundled links with topic density calculation
            const bundledLinks = links.map(link => {
                const source = nodePositions.get(link.source);
                const target = nodePositions.get(link.target);
                if (source && target) {
                    // Calculate topic density for this link
                    const sourceTopicScores = source.topicScores || {};
                    const targetTopicScores = target.topicScores || {};
                    
                    // Calculate maximum shared topic score across all topics
                    let maxSharedScore = 0;
                    let totalSharedScore = 0;
                    let sharedTopicCount = 0;
                    
                    const allTopicIds = new Set([...Object.keys(sourceTopicScores), ...Object.keys(targetTopicScores)]);
                    
                    allTopicIds.forEach(topicId => {
                        const sourceScore = sourceTopicScores[topicId] || 0;
                        const targetScore = targetTopicScores[topicId] || 0;
                        
                        if (sourceScore > 0 && targetScore > 0) {
                            const sharedScore = Math.min(sourceScore, targetScore);
                            maxSharedScore = Math.max(maxSharedScore, sharedScore);
                            totalSharedScore += sharedScore;
                            sharedTopicCount++;
                        }
                    });
                    
                    // Use average of shared scores, with a minimum baseline
                    const avgSharedScore = sharedTopicCount > 0 ? totalSharedScore / sharedTopicCount : 0;
                    const topicDensity = Math.max(0.1, Math.min(1.0, avgSharedScore));
                    
                    return {
                        ...link,
                        source: source,
                        target: target,
                        path: createHierarchicalBundledPath(source, target),
                        topicDensity: topicDensity,
                        maxSharedScore: maxSharedScore,
                        sharedTopicCount: sharedTopicCount
                    };
                }
                return null;
            }).filter(d => d !== null);

            // Draw bundled links with variable thickness
            const link = g.append("g")
                .attr("class", "links")
                .selectAll("path")
                .data(bundledLinks)
                .join("path")
                .attr("d", d => d.path)
                .attr("fill", "none")
                .attr("stroke-width", d => {
                    // Calculate message count between entities
                    const messageCount = allMessages.filter(msg => 
                        (msg.source === d.source.id && msg.target === d.target.id) ||
                        (msg.source === d.target.id && msg.target === d.source.id)
                    ).length;
                    
                    // More dramatic variation: base width of 0.5, scale up to 8 based on message count
                    const baseWidth = 0.5;
                    const maxWidth = 8;
                    const maxMessages = 30; // Lower threshold for more variation
                    const intensity = Math.min(1, messageCount / maxMessages);
                    
                    return baseWidth + (intensity * (maxWidth - baseWidth));
                })
                .attr("opacity", 0.5)
                .attr("stroke", "#888888")
                .style("stroke-linecap", "round")
                .style("stroke-linejoin", "round");

            // Draw nodes with proper shapes and colors
            const node = g.append("g")
                .attr("class", "nodes")
                .selectAll("path")
                .data(allLeafNodes)
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
                .style("cursor", "pointer");

            // Add node click handler
            node.on("click", function (event, d) {
                // Toggle entity filter
                currentEntityFilter = currentEntityFilter === d.id ? null : d.id;
                updateTopicVisualization(currentTopic);

                // Highlight selected node
                node.attr("class", null);
                d3.select(this).attr("class", "selected");
            });

            // Draw labels positioned outside the circle
            const label = g.append("g")
                .attr("class", "labels")
                .selectAll("text")
                .data(allLeafNodes)
                .join("text")
                .text(d => {
                    const maxLength = 10;
                    const name = d.name || d.id;
                    return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
                })
                .attr("x", d => {
                    const labelRadius = radius + 30;
                    return centerX + Math.cos(d.angle) * labelRadius;
                })
                .attr("y", d => {
                    const labelRadius = radius + 30;
                    return centerY + Math.sin(d.angle) * labelRadius;
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

            // Add zooming
            svg.call(d3.zoom().on("zoom", (event) => {
                g.attr("transform", event.transform);
            }));

            // Create tooltip
            const tooltip = d3.select("body").append("div")
                .attr("class", "topic-tooltip")
                .style("position", "absolute")
                .style("visibility", "hidden")
                .style("background", "rgba(0, 0, 0, 0.8)")
                .style("color", "white")
                .style("padding", "8px 12px")
                .style("border-radius", "4px")
                .style("font-size", "12px")
                .style("pointer-events", "none")
                .style("z-index", "1000");

            // Enhanced interactive features
            node
                .on("mouseover", function (event, d) {
                    // Show tooltip
                    const connections = bundledLinks.filter(link =>
                        link.source.id === d.id || link.target.id === d.id).length;

                    tooltip
                        .html(`
                            <strong>${d.name || d.id}</strong><br/>
                            Type: ${d.type}<br/>
                            ${d.is_pseudonym ? 'Pseudonym' : 'Real Name'}<br/>
                            Connections: ${connections}
                        `)
                        .style("visibility", "visible");

                    // Highlight connected edges - no color changes

                    // Highlight connected nodes
                    node
                        .attr("opacity", n => {
                            if (n.id === d.id) return 1;
                            const isConnected = bundledLinks.some(l =>
                                (l.source.id === d.id && l.target.id === n.id) ||
                                (l.target.id === d.id && l.source.id === n.id)
                            );
                            return isConnected ? 1 : 0.3;
                        });
                })
                .on("mousemove", function (event) {
                    tooltip
                        .style("top", (event.pageY - 10) + "px")
                        .style("left", (event.pageX + 10) + "px");
                })
                .on("mouseout", function (event, d) {
                    // Hide tooltip
                    tooltip.style("visibility", "hidden");

                    // Reset edge highlighting - no changes needed

                    // Reset node opacity
                    node.attr("opacity", 0.9);
                });

            // Topic selection handler
            topicSelector.on("change", function () {
                currentTopic = this.value;
                updateTopicVisualization(currentTopic);
            });

            // Reset view button
            d3.select("#reset-view").on("click", () => {
                currentTopic = null;
                currentEntityFilter = null;
                updateTopicVisualization(null);
                topicSelector.property("value", "");
                node.attr("class", null);
            });

            // Pagination handlers
            d3.select("#prev-page").on("click", () => {
                if (currentPage > 1) {
                    currentPage--;
                    displayMessages();
                }
            });

            d3.select("#next-page").on("click", () => {
                const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    displayMessages();
                }
            });

            // Update visualization based on topic selection
            function updateTopicVisualization(topicId) {
                // Reset all to full opacity
                node.attr("opacity", 1);
                label.attr("opacity", 1);

                // Update topic details panel
                const topicDetails = d3.select("#topic-details");
                const entityRanking = d3.select("#entity-ranking");

                if (!topicId) {
                    topicDetails.html("<p class='text-gray-500'>Select a topic to view details</p>");
                    entityRanking.html("<p class='text-gray-500'>Entities will appear here</p>");

                    // Clear messages
                    d3.select("#messages-container").html("<p class='text-gray-500'>Select a topic to view related messages</p>");
                    d3.select("#message-count").text("0");
                    d3.select("#page-start").text("0");
                    d3.select("#page-end").text("0");
                    d3.select("#prev-page").attr("disabled", true);
                    d3.select("#next-page").attr("disabled", true);
                    d3.select("#page-buttons").html("");

                    // Reset edge visibility
                    g.select(".links").selectAll("path").style("visibility", "visible");

                    return;
                }

                // Find selected topic
                const topic = topicData.topics.find(t => t.id == topicId);
                if (!topic) return;

                // Get topic metrics
                const topicMetrics = topicData.topic_metrics[topicId] || {
                    message_count: 0,
                    avg_message_length: 0,
                    avg_topic_score: 0
                };

                // Update topic details
                topicDetails.html(`
                    <h4 class="font-bold text-lg">Topic ${topic.id}</h4>
                    <p class="text-sm mb-2">Method: ${method_used}${method_used === "lda" ? ` (${vectorizer_used.toUpperCase()})` : ''}</p>
                    
                    <div class="topic-metrics">
                        <div class="metric">
                            <div class="metric-label">Messages</div>
                            <div class="metric-value">${topicMetrics.message_count}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Avg. Length</div>
                            <div class="metric-value">${topicMetrics.avg_message_length.toFixed(1)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Avg. Score</div>
                            <div class="metric-value">${topicMetrics.avg_topic_score.toFixed(3)}</div>
                        </div>
                    </div>
                    
                    <div class="keyword-list">
                        ${topic.keywords.slice(0, 15).map(k =>
                    `<span class="topic-keyword">${k}</span>`
                ).join("")}
                    </div>
                `);

                // Update entity ranking
                const topEntities = Object.entries(topicData.entity_topic_scores)
                    .filter(([_, scores]) => scores[topicId] && scores[topicId] > 0)
                    .map(([entityId, scores]) => ({
                        id: entityId,
                        name: nodes.find(n => n.id === entityId)?.name || entityId,
                        score: scores[topicId]
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 15);

                entityRanking.html("");
                if (topEntities.length === 0) {
                    entityRanking.html("<p class='text-gray-500'>No entities found for this topic</p>");
                } else {
                    entityRanking.selectAll(".entity-rank-item")
                        .data(topEntities)
                        .join("div")
                        .attr("class", "entity-rank-item")
                        .html(d => `
                            <span class="entity-name">${d.name}</span>
                            <span class="entity-score">${d.score.toFixed(3)}</span>
                        `);
                }

                // Update node opacity based on topic usage
                node.attr("opacity", d => {
                    const score = d.topicScores[topicId] || 0;
                    return score > 0 ? 0.3 + (0.7 * Math.min(1, score * 5)) : 0.1;
                });

                label.attr("opacity", d => {
                    const score = d.topicScores[topicId] || 0;
                    return score > 0 ? 1 : 0.2;
                });

                // Update link styling based on actual topic usage between entity pairs
                
                // Re-select the link elements to ensure we have the correct reference
                const linkElements = g.select(".links").selectAll("path");
                
                linkElements
                    .transition()
                    .duration(500)
                    .style("visibility", l => {
                        // Calculate topic usage between this specific pair of entities
                        const pairMessages = allMessages.filter(msg => 
                            (msg.source === l.source.id && msg.target === l.target.id) ||
                            (msg.source === l.target.id && msg.target === l.source.id)
                        );
                        
                        const topicMessages = pairMessages.filter(msg => msg.dominant_topic == parseInt(topicId));
                        const topicUsage = pairMessages.length > 0 ? topicMessages.length / pairMessages.length : 0;
                        
                        return topicUsage > 0 ? "visible" : "hidden";
                    })
                    .attr("stroke-width", l => {
                        // Calculate topic usage between this specific pair of entities
                        const pairMessages = allMessages.filter(msg => 
                            (msg.source === l.source.id && msg.target === l.target.id) ||
                            (msg.source === l.target.id && msg.target === l.source.id)
                        );
                        
                        const topicMessages = pairMessages.filter(msg => msg.dominant_topic == parseInt(topicId));
                        const topicUsage = pairMessages.length > 0 ? topicMessages.length / pairMessages.length : 0;
                        
                        const newWidth = topicUsage > 0 ? 2 + (topicUsage * 7) : 0;
                        
                        
                        return newWidth;
                    })
                    ;

                // Filter messages by topic and entity
                filteredMessages = allMessages.filter(msg => {
                    const matchesTopic = msg.dominant_topic == parseInt(topicId);
                    const matchesEntity = !currentEntityFilter ||
                        msg.source === currentEntityFilter ||
                        msg.target === currentEntityFilter;
                    return matchesTopic && matchesEntity;
                });
                
                
                // Sort by topic confidence (highest first)
                filteredMessages = filteredMessages.sort((a, b) => {
                    // Use dominant_weight when the message's dominant_topic matches the selected topic
                    const aScore = a.dominant_topic == parseInt(topicId) ? a.dominant_weight : 0;
                    const bScore = b.dominant_topic == parseInt(topicId) ? b.dominant_weight : 0;
                    
                    
                    return bScore - aScore;
                });

                // Update message count will be handled in updatePagination

                // Reset to first page
                currentPage = 1;
                displayMessages();
            }

            // Update pagination controls
            function updatePagination() {
                const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                
                // Update message count
                d3.select("#message-count").text(filteredMessages.length);
                
                // Clear page buttons
                const pageButtons = d3.select("#page-buttons");
                pageButtons.html("");
                
                if (totalPages <= 1) {
                    d3.select("#page-start").text(filteredMessages.length > 0 ? "1" : "0");
                    d3.select("#page-end").text(filteredMessages.length);
                    d3.select("#prev-page").attr("disabled", true);
                    d3.select("#next-page").attr("disabled", true);
                    return;
                }
                
                // Calculate range of pages to show (max 5 pages)
                let startPage = Math.max(1, currentPage - 2);
                let endPage = Math.min(totalPages, startPage + 4);
                
                // Adjust if we're at the beginning
                if (endPage - startPage < 4 && startPage > 1) {
                    startPage = Math.max(1, endPage - 4);
                }
                
                // Create page buttons
                for (let i = startPage; i <= endPage; i++) {
                    const button = pageButtons.append("button")
                        .attr("class", `px-3 py-1 border rounded-md ${i === currentPage ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`)
                        .text(i)
                        .on("click", () => {
                            currentPage = i;
                            displayMessages();
                        });
                }
                
                // Update start/end indicators
                const startIdx = (currentPage - 1) * messagesPerPage + 1;
                const endIdx = Math.min(currentPage * messagesPerPage, filteredMessages.length);
                d3.select("#page-start").text(startIdx);
                d3.select("#page-end").text(endIdx);
                
                // Enable/disable navigation buttons
                d3.select("#prev-page").attr("disabled", currentPage <= 1 ? true : null);
                d3.select("#next-page").attr("disabled", currentPage >= totalPages ? true : null);
            }

            // Display paginated messages
            function displayMessages() {
                const messagesContainer = d3.select("#messages-container");
                messagesContainer.html("");

                if (filteredMessages.length === 0) {
                    messagesContainer.html("<p class='text-gray-500'>No messages found for current filters</p>");
                    d3.select("#page-start").text("0");
                    d3.select("#page-end").text("0");
                    d3.select("#prev-page").attr("disabled", true);
                    d3.select("#next-page").attr("disabled", true);
                    return;
                }

                const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                const startIdx = (currentPage - 1) * messagesPerPage;
                const endIdx = Math.min(startIdx + messagesPerPage, filteredMessages.length);
                const pageMessages = filteredMessages.slice(startIdx, endIdx);

                // Display messages
                pageMessages.forEach(msg => {
                    const messageEl = messagesContainer.append("div")
                        .attr("class", "message-item")
                        .html(`
                            <div class="message-header">
                                <div class="message-participants">${msg.source} → ${msg.target || 'N/A'}</div>
                                <div class="message-datetime">${new Date(msg.datetime).toLocaleString()}</div>
                            </div>
                            <div class="message-content">${msg.content}</div>
                            <div class="message-footer">
                                <div class="message-id">ID: ${msg.id}</div>
                                <div class="topic-confidence">Topic confidence: ${(msg.dominant_weight * 100).toFixed(1)}%</div>
                            </div>
                        `);
                });
                
                // Update pagination controls
                updatePagination();
            }

            // Add animation for links on load
            link
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

        }).catch(err => {
            console.error("Error loading topic modeling data:", err);
            container.html(`<div class="error-message p-4 text-red-600">Error loading data: ${err.message}</div>`);
        });
    }

    // Initial load
    loadTopicData();
}