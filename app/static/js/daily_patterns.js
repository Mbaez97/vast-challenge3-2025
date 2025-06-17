function init_daily_patterns() {
    // Configuration
    const bandHeight = 100; // Height of each day band
    const bandMargin = 10;  // Margin between bands
    const hourWidth = 40;   // Width per hour
    const markerSize = 20;  // Size of event markers
    const markerSpacing = 5; // Spacing between stacked markers
    const maxStackHeight = bandHeight - 20; // Max height for stacking markers
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

    // Fetch data from Flask endpoint
    d3.json("/data/daily_patterns").then(data => {
        const events = data.events;
        const entities = data.entities;

        // Group events by day (convert to numbers)
        const eventsByDay = {};
        events.forEach(event => {
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

        // Find min/max hours
        let minHour = 24, maxHour = 0;
        events.forEach(event => {
            const hour = new Date(event.datetime).getHours();
            if (hour < minHour) minHour = hour;
            if (hour > maxHour) maxHour = hour;
        });

        // Expand range by 1 hour on each side
        minHour = Math.max(0, minHour - 1);
        maxHour = Math.min(24, maxHour + 1);

        // Create SVG dimensions
        const svgHeight = days.length * (bandHeight + bandMargin);
        const svgWidth = (maxHour - minHour) * hourWidth + 100;

        // Create SVG
        const svg = visContainer.append("svg")
            .attr("width", "100%")
            .attr("height", svgHeight)
            .attr("viewBox", [0, 0, svgWidth, svgHeight])
            .attr("class", "bg-white rounded-lg shadow-md");

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([minHour, maxHour])
            .range([80, svgWidth - 20]);

        // Create axes
        const xAxis = d3.axisTop(xScale)
            .ticks(maxHour - minHour)
            .tickFormat(d => `${d}:00`);

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, 20)`)
            .call(xAxis);

        // Create day bands and markers
        days.forEach((day, i) => {
            const yPos = i * (bandHeight + bandMargin) + 50;

            // Draw day band
            svg.append("rect")
                .attr("class", "day-band")
                .attr("x", 80)
                .attr("y", yPos)
                .attr("width", svgWidth - 100)
                .attr("height", bandHeight);

            // Add day label
            svg.append("text")
                .attr("class", "axis")
                .attr("x", 40)
                .attr("y", yPos + bandHeight / 2)
                .attr("dy", "0.35em")
                .text(`Oct ${day}`);

            // Group events by hour
            const hourGroups = {};
            eventsByDay[day].forEach(event => {
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
                        const yPosInStack = yPos + 20 + eventIndex * (markerSize + markerSpacing);
                        const entityLabel = event.entity_id.charAt(0).toUpperCase();

                        // Create marker group
                        const markerGroup = svg.append("g")
                            .attr("class", "marker-group")
                            .attr("transform", `translate(${stackXPos},${yPosInStack})`)
                            .attr("data-entity", event.entity_id);

                        // Draw marker
                        markerGroup.append("rect")
                            .attr("class", "marker")
                            .attr("width", markerSize)
                            .attr("height", markerSize)
                            .attr("rx", 4)
                            .attr("fill", colors[event.entity_sub_type] || "#777")
                            .on("mouseover", function () {
                                const coords = `(${stackXPos.toFixed(0)},${yPosInStack.toFixed(0)})`;
                                d3.select(this)
                                    .attr("stroke", "#000")
                                    .attr("stroke-width", 1);

                                // Show box coordinates
                                markerGroup.append("text")
                                    .attr("class", "coords-label")
                                    .attr("x", markerSize / 2)
                                    .attr("y", -5)
                                    .attr("text-anchor", "middle")
                                    .attr("fill", "#555")
                                    .text(coords);
                            })
                            .on("mouseout", function () {
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
                            .text(entityLabel);
                    });
                });
            });
        });

        // Create legend
        legendContainer.append("h3")
            .attr("class", "font-semibold mb-3")
            .text("Entities");

        const legendItems = legendContainer.selectAll(".legend-item")
            .data(entities)
            .enter()
            .append("div")
            .attr("class", "legend-item");

        legendItems.append("div")
            .attr("class", "legend-color")
            .style("background-color", d => colors[d.sub_type] || "#777");

        legendItems.append("div")
            .html(d => {
                const letter = d.id.charAt(0).toUpperCase();
                return `<span class="font-medium">${d.id}</span> (${letter})`;
            });

    }).catch(error => {
        console.error("Error loading daily patterns data:", error);
    });
}

window.init_daily_patterns = init_daily_patterns;