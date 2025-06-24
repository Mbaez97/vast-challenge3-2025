function init_daily_patterns() {
    // Updated Configuration
    const bandHeight = 120;
    const hourWidth = 140;
    const markerSize_h = 30;
    const markerSize_v = 16;
    const markerSpacing = 3;
    const maxStackHeight = bandHeight - 10;
    const cornerRadius = 6;

    // Color variables
    const daySeparatorColor = "#94a3b8";
    const hourLineColor = "#e2e8f0";
    const textColor = "#334155";
    const axisColor = "#000000";

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
    let entityLookup = {};

    // Fetch data from Flask endpoint
    d3.json("/data/daily_patterns").then(data => {
        allEvents = data.events;
        allEntities = data.entities;

        // Create entity lookup
        allEntities.forEach(entity => {
            entityLookup[entity.id] = entity;
        });

        // Calculate communication count for each entity
        const commCount = {};
        allEntities.forEach(entity => commCount[entity.id] = 0);

        allEvents.forEach(event => {
            commCount[event.entity_id] = (commCount[event.entity_id] || 0) + 1;
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
            if (!eventsByDay[day]) eventsByDay[day] = [];
            eventsByDay[day].push(event);
        });

        // Get sorted days
        const days = Object.keys(eventsByDay)
            .map(Number)
            .sort((a, b) => a - b);

        // Find min/max hours
        let minHour = 24, maxHour = 0;
        allEvents.forEach(event => {
            const hour = new Date(event.datetime).getHours();
            if (hour < minHour) minHour = hour;
            if (hour > maxHour) maxHour = hour;
        });

        // Add padding
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
            .attr("class", "bg-white");

        // Create clip path for rounded corners
        svg.append("defs")
            .append("clipPath")
            .attr("id", "marker-clip")
            .append("rect")
            .attr("width", markerSize_h)
            .attr("height", markerSize_v)
            .attr("rx", cornerRadius)
            .attr("ry", cornerRadius);

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([minHour, maxHour])
            .range([60, svgWidth - 20]);

        // Create axes
        const hourTicks = d3.range(minHour, maxHour + 1);
        const xAxis = d3.axisTop(xScale)
            .tickValues(hourTicks)
            .tickFormat(d => `${d}:00`);

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0, 50)")
            .call(xAxis)
            .attr("color", axisColor);

        // Draw hour lines
        hourTicks.forEach(hour => {
            svg.append("line")
                .attr("x1", xScale(hour))
                .attr("y1", 40)
                .attr("x2", xScale(hour))
                .attr("y2", svgHeight)
                .attr("stroke", hourLineColor)
                .attr("stroke-width", 1);
        });

        // Create unique letter mapping
        letterMaps = {
            'Person': {},
            'Organization': {},
            'Vessel': {},
            'Group': {},
            'Location': {}
        };

        // Assign unique letters
        allEntities.forEach(entity => {
            const subType = entity.sub_type;
            if (letterMaps[subType]) {
                const usedLetters = new Set(Object.values(letterMaps[subType]));
                let letter = entity.id.charAt(0).toUpperCase();

                if (usedLetters.has(letter)) {
                    let charCode = 65;
                    while (usedLetters.has(String.fromCharCode(charCode))) {
                        charCode++;
                        if (charCode > 90) break;
                    }
                    letter = String.fromCharCode(charCode);
                }

                letterMaps[subType][entity.id] = letter;
            }
        });

        // Draw visualization
        function drawVisualization() {
            svg.selectAll(".marker-group").remove();

            let eventsToShow;
            if (selectedEntityIds.length > 0) {
                eventsToShow = allEvents.filter(event =>
                    selectedEntityIds.includes(event.entity_id) ||
                    event.target_entities.some(targetId => selectedEntityIds.includes(targetId))
                );
            } else {
                eventsToShow = allEvents;
            }

            const filteredEventsByDay = {};
            eventsToShow.forEach(event => {
                const day = event.day;
                if (!filteredEventsByDay[day]) filteredEventsByDay[day] = [];
                filteredEventsByDay[day].push(event);
            });

            days.forEach((day, i) => {
                const yPos = i * bandHeight + 60;

                if (i > 0) {
                    svg.append("line")
                        .attr("x1", 40)
                        .attr("y1", yPos - 10)
                        .attr("x2", svgWidth - 20)
                        .attr("y2", yPos - 10)
                        .attr("stroke", daySeparatorColor)
                        .attr("stroke-width", 2);
                }

                const yCenter = yPos + bandHeight / 2 - 5;
                svg.append("text")
                    .attr("class", "axis font-medium")
                    .attr("x", 20)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("transform", `rotate(-90, 20, ${yCenter})`)
                    .attr("text-anchor", "middle")
                    .attr("fill", textColor)
                    .text(`Oct ${day}`);

                if (!filteredEventsByDay[day] || filteredEventsByDay[day].length === 0) return;

                const hourGroups = {};
                filteredEventsByDay[day].forEach(event => {
                    const hour = new Date(event.datetime).getHours();
                    if (!hourGroups[hour]) hourGroups[hour] = [];
                    hourGroups[hour].push(event);
                });

                Object.entries(hourGroups).forEach(([hour, hourEvents]) => {
                    const hourNum = Number(hour);
                    const xPos = xScale(hourNum);

                    const stacks = [];
                    let currentStack = [];
                    let currentHeight = 0;

                    hourEvents.forEach(event => {
                        if (currentHeight + markerSize_v + markerSpacing > maxStackHeight) {
                            stacks.push(currentStack);
                            currentStack = [];
                            currentHeight = 0;
                        }
                        currentStack.push(event);
                        currentHeight += markerSize_v + markerSpacing;
                    });
                    if (currentStack.length > 0) stacks.push(currentStack);

                    stacks.forEach((stack, stackIndex) => {
                        const stackXPos = xPos + stackIndex * (markerSize_h + markerSpacing);

                        stack.forEach((event, eventIndex) => {
                            const yPosInStack = yPos + eventIndex * (markerSize_v + markerSpacing);

                            // Create group with clip path and mouse events
                            const markerGroup = svg.append("g")
                                .attr("class", "marker-group")
                                .attr("transform", `translate(${stackXPos},${yPosInStack})`)
                                .attr("clip-path", "url(#marker-clip)")
                                .on("mouseover", function (e) {
                                    // Show tooltip
                                    const source = event.entity_id;
                                    const targets = event.target_entities.join(', ');
                                    const message = event.content || 'No message content';

                                    tooltip.html(`
                                        <div class="mt-1"><span class="font-medium">Source:</span> ${source}</div>
                                        <div><span class="font-medium">Target:</span> ${targets}</div>
                                        <div class="mt-2"><span class="font-medium">Message:</span> ${message}</div>
                                        <div class="mt-1 text-xs text-gray-500">${event.datetime}</div>
                                    `)
                                        .style("left", (e.pageX + 10) + "px")
                                        .style("top", (e.pageY + 10) + "px")
                                        .classed("hidden", false);

                                    // Highlight entire marker
                                    markerGroup.selectAll("rect")
                                        .attr("stroke", "#000")
                                        .attr("stroke-width", 1);
                                })
                                .on("mouseout", function () {
                                    tooltip.classed("hidden", true);
                                    markerGroup.selectAll("rect")
                                        .attr("stroke", null);
                                });

                            // Get entities and letters
                            const sourceEntity = entityLookup[event.entity_id];
                            const targetId = event.target_entities[0] || "";
                            const targetEntity = entityLookup[targetId];

                            const sourceLetter = sourceEntity ?
                                (letterMaps[sourceEntity.sub_type]?.[sourceEntity.id] ||
                                    sourceEntity.id.charAt(0).toUpperCase()) : "?";

                            const targetLetter = targetEntity ?
                                (letterMaps[targetEntity.sub_type]?.[targetEntity.id] ||
                                    targetEntity.id.charAt(0).toUpperCase()) : "?";

                            // Draw dual-color marker
                            markerGroup.append("rect")
                                .attr("width", markerSize_h / 2)
                                .attr("height", markerSize_v)
                                .attr("fill", sourceEntity ? colors[sourceEntity.sub_type] || "#777" : "#999");

                            markerGroup.append("rect")
                                .attr("x", markerSize_h / 2)
                                .attr("width", markerSize_h / 2)
                                .attr("height", markerSize_v)
                                .attr("fill", targetEntity ? colors[targetEntity.sub_type] || "#999" : "#bbb");

                            // Add letters
                            markerGroup.append("text")
                                .attr("x", markerSize_h / 4)
                                .attr("y", markerSize_v / 2)
                                .attr("dy", "0.35em")
                                .attr("text-anchor", "middle")
                                .attr("fill", "white")
                                .attr("font-weight", "bold")
                                .attr("font-size", "10px")
                                .text(sourceLetter);

                            markerGroup.append("text")
                                .attr("x", markerSize_h * 0.75)
                                .attr("y", markerSize_v / 2)
                                .attr("dy", "0.35em")
                                .attr("text-anchor", "middle")
                                .attr("fill", "white")
                                .attr("font-weight", "bold")
                                .attr("font-size", "10px")
                                .text(targetLetter);
                        });
                    });
                });
            });
        }

        drawVisualization();

        // Create legend
        const legendScrollContainer = legendContainer.append("div")
            .attr("class", "overflow-y-auto")
            .style("max-height", "490px");

        const legendItems = legendScrollContainer.selectAll(".legend-item")
            .data(allEntities)
            .enter()
            .append("div")
            .attr("class", "legend-item cursor-pointer p-2 rounded hover:bg-gray-100 flex items-center")
            .on("click", function (event, d) {
                const index = selectedEntityIds.indexOf(d.id);
                if (index > -1) {
                    selectedEntityIds.splice(index, 1);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", false);
                } else {
                    selectedEntityIds.push(d.id);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", true);
                }
                drawVisualization();
            });

        legendItems.append("div")
            .attr("class", "legend-color flex-shrink-0")
            .style("background-color", d => colors[d.sub_type] || "#777");

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

        legendContainer.append("div")
            .attr("class", "text-xs text-gray-500 mt-2")
            .html("Click on entities to filter communications");

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