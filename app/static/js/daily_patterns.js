function init_daily_patterns() {
    // Updated Configuration
    const bandHeight = 110; // Height of each day band
    const hourWidth = 140; // Width per hour
    const markerSize = 15; // Size of event markers
    const markerSpacing = 3; // Spacing between stacked markers
    const maxStackHeight = bandHeight - 20; // Max height for stacking markers

    // Color variables
    const backgroundColor = "#ffffff"; // White background
    const daySeparatorColor = "#94a3b8"; // Bold day separator
    const hourLineColor = "#e2e8f0"; // Faint hour lines
    const textColor = "#334155"; // Dark text
    const axisColor = "#000000"; // Black axis
    const legendBackground = "#f9fafb"; // Light legend background
    const legendBorder = "#e2e8f0"; // Legend border

    const colors = {
        'Person': '#4f46e5',
        'Organization': '#dc2626',
        'Vessel': '#059669',
        'Group': '#d97706',
        'Location': '#0284c7'
    };

    // Select containers
    const visContainer = d3.select("#daily-patterns-vis");
    const legendContainer = d3.select("#daily-patterns-legend");
    visContainer.html("");
    legendContainer.html("");

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "absolute bg-white p-3 rounded shadow-lg border border-gray-200 text-sm max-w-xs z-50 hidden")
        .style("pointer-events", "none");

    // Store visualization state
    let allEvents = [];
    let allEntities = [];
    let selectedEntityIds = [];
    let letterMaps = {};

    // Fetch data from Flask endpoint
    d3.json("/data/daily_patterns").then(data => {
        allEvents = data.events;
        allEntities = data.entities;

        // Calculate communication count for each entity
        const commCount = {};
        allEntities.forEach(entity => commCount[entity.id] = 0);

        allEvents.forEach(event => {
            // Count source entity
            commCount[event.entity_id] = (commCount[event.entity_id] || 0) + 1;

            // Count target entities
            event.target_entities.forEach(targetId => {
                commCount[targetId] = (commCount[targetId] || 0) + 1;
            });
        });

        // Sort entities by communication count (descending)
        allEntities.sort((a, b) => commCount[b.id] - commCount[a.id]);

        // Group events by day
        const eventsByDay = {};
        allEvents.forEach(event => {
            const day = event.day;
            if (!eventsByDay[day]) {
                eventsByDay[day] = [];
            }
            eventsByDay[day].push(event);
        });

        // Get sorted days (numerically)
        const days = Object.keys(eventsByDay)
            .map(Number)
            .sort((a, b) => a - b);

        // Find min/max hours from data
        let minHour = 24, maxHour = 0;
        allEvents.forEach(event => {
            const hour = new Date(event.datetime).getHours();
            if (hour < minHour) minHour = hour;
            if (hour > maxHour) maxHour = hour;
        });

        // Add 1-hour padding on each side
        minHour = Math.max(0, minHour);
        maxHour = Math.min(24, maxHour + 1);
        const hourRange = maxHour - minHour;

        // Create SVG dimensions
        const svgHeight = days.length * bandHeight + 50;
        const svgWidth = hourRange * hourWidth + 100;

        // Create SVG
        const svg = visContainer.append("svg")
            .attr("width", "100%")
            .attr("height", svgHeight)
            .attr("viewBox", [0, 0, svgWidth, svgHeight])
            .attr("class", "bg-white rounded-lg shadow-md");

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([minHour, maxHour])
            .range([60, svgWidth - 20]); // Left padding increased for rotated labels

        // Create axes
        const hourTicks = d3.range(minHour, maxHour + 1);
        const xAxis = d3.axisTop(xScale)
            .tickValues(hourTicks)
            .tickFormat(d => `${d}:00`);

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0, 30)")
            .call(xAxis)
            .attr("color", axisColor);

        // Draw hour lines (faint vertical lines)
        hourTicks.forEach(hour => {
            svg.append("line")
                .attr("x1", xScale(hour))
                .attr("y1", 40)
                .attr("x2", xScale(hour))
                .attr("y2", svgHeight)
                .attr("stroke", hourLineColor)
                .attr("stroke-width", 1);
        });

        // Create unique letter mapping per entity subtype
        letterMaps = {
            'Person': {},
            'Organization': {},
            'Vessel': {},
            'Group': {},
            'Location': {}
        };

        // Assign unique letters within each subtype
        allEntities.forEach(entity => {
            const subType = entity.sub_type;
            if (letterMaps[subType]) {
                const usedLetters = new Set(Object.values(letterMaps[subType]));
                let letter = entity.id.charAt(0).toUpperCase();

                // If first letter is taken, find next available letter
                if (usedLetters.has(letter)) {
                    let charCode = 65; // 'A'
                    while (usedLetters.has(String.fromCharCode(charCode))) {
                        charCode++;
                        if (charCode > 90) break; // Stop at 'Z'
                    }
                    letter = String.fromCharCode(charCode);
                }

                letterMaps[subType][entity.id] = letter;
            }
        });

        // Draw visualization
        function drawVisualization() {
            // Clear existing markers
            svg.selectAll(".marker-group").remove();

            // Filter events based on selection
            let eventsToShow;
            if (selectedEntityIds.length > 0) {
                eventsToShow = allEvents.filter(event =>
                    selectedEntityIds.includes(event.entity_id) ||
                    event.target_entities.some(targetId => selectedEntityIds.includes(targetId))
                );
            } else {
                eventsToShow = allEvents;
            }

            // Re-group events by day
            const filteredEventsByDay = {};
            eventsToShow.forEach(event => {
                const day = event.day;
                if (!filteredEventsByDay[day]) {
                    filteredEventsByDay[day] = [];
                }
                filteredEventsByDay[day].push(event);
            });

            // Draw day separators and markers
            days.forEach((day, i) => {
                const yPos = i * bandHeight + 60;

                // Draw bold day separator at the bottom
                if (i > 0) {
                    svg.append("line")
                        .attr("x1", 40)
                        .attr("y1", yPos - 10)
                        .attr("x2", svgWidth - 20)
                        .attr("y2", yPos - 10)
                        .attr("stroke", daySeparatorColor)
                        .attr("stroke-width", 2);
                }

                // Add rotated day label at center of band
                const yCenter = yPos + bandHeight / 2 - 10;
                svg.append("text")
                    .attr("class", "axis font-medium")
                    .attr("x", 20)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("transform", `rotate(-90, 20, ${yCenter})`)
                    .attr("text-anchor", "middle")
                    .attr("fill", textColor)
                    .text(`Oct ${day}`);

                // Skip if no events for this day
                if (!filteredEventsByDay[day] || filteredEventsByDay[day].length === 0) {
                    return;
                }

                // Group events by hour
                const hourGroups = {};
                filteredEventsByDay[day].forEach(event => {
                    const hour = new Date(event.datetime).getHours();
                    if (!hourGroups[hour]) hourGroups[hour] = [];
                    hourGroups[hour].push(event);
                });

                // Draw event markers
                Object.entries(hourGroups).forEach(([hour, hourEvents]) => {
                    const hourNum = Number(hour);
                    const xPos = xScale(hourNum);

                    // Calculate stacking positions
                    const stacks = [];
                    let currentStack = [];
                    let currentHeight = 0;

                    hourEvents.forEach(event => {
                        if (currentHeight + markerSize + markerSpacing > maxStackHeight) {
                            stacks.push(currentStack);
                            currentStack = [];
                            currentHeight = 0;
                        }
                        currentStack.push(event);
                        currentHeight += markerSize + markerSpacing;
                    });
                    if (currentStack.length > 0) stacks.push(currentStack);

                    // Draw stacks
                    stacks.forEach((stack, stackIndex) => {
                        const stackXPos = xPos + stackIndex * (markerSize + 5);

                        stack.forEach((event, eventIndex) => {
                            const yPosInStack = yPos + eventIndex * (markerSize + markerSpacing);
                            const entityLetter = letterMaps[event.entity_sub_type]?.[event.entity_id] ||
                                event.entity_id.charAt(0).toUpperCase();

                            // Create marker group
                            const markerGroup = svg.append("g")
                                .attr("class", "marker-group")
                                .attr("transform", `translate(${stackXPos},${yPosInStack})`)
                                .attr("data-entity", event.entity_id)
                                .attr("data-event", event.id);

                            // Draw marker
                            markerGroup.append("rect")
                                .attr("class", "marker")
                                .attr("width", markerSize)
                                .attr("height", markerSize)
                                .attr("rx", 4)
                                .attr("fill", colors[event.entity_sub_type] || "#777")
                                .on("mouseover", function (event, d) {
                                    // Show tooltip
                                    const source = event.entity_id;
                                    const targets = event.target_entities.join(', ');
                                    const message = event.content || 'No message content';

                                    tooltip.html(`
                                        <div class="font-semibold">Communication Details</div>
                                        <div class="mt-1"><span class="font-medium">Source:</span> ${source}</div>
                                        <div><span class="font-medium">Targets:</span> ${targets}</div>
                                        <div class="mt-2"><span class="font-medium">Message:</span> ${message}</div>
                                        <div class="mt-1 text-xs text-gray-500">${event.datetime}</div>
                                    `)
                                        .style("left", (d.pageX + 10) + "px")
                                        .style("top", (d.pageY + 10) + "px")
                                        .classed("hidden", false);

                                    // Highlight marker
                                    d3.select(this)
                                        .attr("stroke", "#000")
                                        .attr("stroke-width", 1);

                                    // Show box coordinates
                                    const coords = `(${stackXPos.toFixed(0)},${yPosInStack.toFixed(0)})`;
                                    markerGroup.append("text")
                                        .attr("class", "coords-label")
                                        .attr("x", markerSize / 2)
                                        .attr("y", -5)
                                        .attr("text-anchor", "middle")
                                        .attr("fill", "#555")
                                        .text(coords);
                                })
                                .on("mouseout", function () {
                                    // Hide tooltip
                                    tooltip.classed("hidden", true);

                                    // Unhighlight marker
                                    d3.select(this).attr("stroke", null);
                                    markerGroup.select(".coords-label").remove();
                                });

                            // Add entity label
                            markerGroup.append("text")
                                .attr("x", markerSize / 2)
                                .attr("y", markerSize / 2)
                                .attr("dy", "0.35em")
                                .attr("text-anchor", "middle")
                                .attr("fill", "white")
                                .attr("font-weight", "bold")
                                .attr("font-size", "10px")
                                .text(entityLetter);
                        });
                    });
                });
            });
        }

        // Initial draw
        drawVisualization();

        // Create legend with scroll container
        const legendHeader = legendContainer.append("div")
            .attr("class", "font-semibold mb-3")
            .text("Entities (sorted by activity)");

        // Create scrollable area for legend items
        const legendScrollContainer = legendContainer.append("div")
            .attr("class", "overflow-y-auto")
            .style("max-height", "500px"); // Adjust based on your needs

        const legendItems = legendScrollContainer.selectAll(".legend-item")
            .data(allEntities)
            .enter()
            .append("div")
            .attr("class", "legend-item cursor-pointer p-2 rounded hover:bg-gray-100 flex items-center")
            .on("click", function (event, d) {
                // Toggle selection
                const index = selectedEntityIds.indexOf(d.id);
                if (index > -1) {
                    // Remove from selection
                    selectedEntityIds.splice(index, 1);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", false);
                } else {
                    // Add to selection
                    selectedEntityIds.push(d.id);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", true);
                }

                // Redraw visualization with filtered events
                drawVisualization();
            });

        // Add color box
        legendItems.append("div")
            .attr("class", "legend-color flex-shrink-0")
            .style("background-color", d => colors[d.sub_type] || "#777");

        // Add entity info
        legendItems.append("div")
            .attr("class", "ml-2")
            .html(d => {
                const letter = letterMaps[d.sub_type]?.[d.id] || d.id.charAt(0).toUpperCase();
                const count = commCount[d.id] || 0;
                return `
                    <div class="font-medium">${d.id}</div>
                    <div class="text-xs text-gray-600">
                        <span>(${letter})</span> 
                        <span class="ml-2">${count} comms</span>
                    </div>
                `;
            });

        // Add caption
        legendContainer.append("div")
            .attr("class", "text-xs text-gray-500 mt-2")
            .html("Click on entities to filter communications");

        // Add reset button
        legendContainer.append("button")
            .attr("class", "mt-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm")
            .text("Reset Filter")
            .on("click", function () {
                selectedEntityIds = [];
                d3.selectAll(".legend-item")
                    .classed("bg-blue-100 border border-blue-300", false);
                drawVisualization();
            });

    }).catch(error => {
        console.error("Error loading daily patterns data:", error);
    });
}

window.init_daily_patterns = init_daily_patterns;