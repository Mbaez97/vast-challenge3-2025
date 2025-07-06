function init_daily_patterns() {
    // Updated Configuration
    const bandHeight = 110;
    const hourWidth = 150;
    const markerSize_h = 26;
    const markerSize_v = 16;
    const markerSpacing = 3;
    const maxStackHeight = bandHeight - 10;
    const cornerRadius = 6;

    // Collapse/Expand configuration
    const collapseFraction = 2 / 5; // Size fraction when collapsed
    const defaultCollapsed = true; // Start collapsed by default

    // Legend configuration
    const legendOffsetFromBottom = 10; // Vertical position from bottom of bands

    // Color variables
    const daySeparatorColor = "#94a3b8";
    const hourLineColor = "#e2e8f0";
    const textColor = "#334155";
    const axisColor = "#000000";

    const colors = {
        'Person': '#6366f1',     // indigo-500
        'Organization': '#f43f5e', // rose-500
        'Vessel': '#10b981',     // emerald-500
        'Group': '#f59e0b',      // amber-500
        'Location': '#06b6d4'    // cyan-500
    };

    // Select containers and ensure stable positioning
    const visContainer = d3.select("#daily-patterns-vis")
        .style("position", "relative")
        .style("overflow", "visible");
    const densityContainer = d3.select("#hourly-density-vis");
    const legendContainer = d3.select("#daily-patterns-legend");
    visContainer.html("");
    densityContainer.html("");
    legendContainer.html("");

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "absolute bg-white p-3 rounded shadow-lg border border-gray-200 text-sm max-w-xs z-50 hidden")
        .style("pointer-events", "none");

    // Store visualization state
    let allEvents = [];
    let allEntities = [];
    let allKeywords = [];
    let allTopics = [];
    let eventTopicData = {};
    let hourlyDensityData = {};
    let selectedEntityIds = [];
    let selectedKeywordId = null;
    let selectedTopicId = null;
    let customKeyword = "";
    let currentTopicMethod = "lda?vectorizer=tfidf";
    let topicsLoaded = false;
    let letterMaps = {};
    let entityLookup = {};
    let eventContentLookup = {};
    let bandCollapsedState = {}; // Track collapsed state for each day

    // Fetch data from Flask endpoint
    d3.json("/data/daily_patterns").then(data => {
        allEvents = data.events;
        allEntities = data.entities;
        allKeywords = data.keywords || [];
        hourlyDensityData = data.hourly_density || {};

        // Create entity lookup
        allEntities.forEach(entity => {
            entityLookup[entity.id] = entity;
        });

        // Create event content lookup
        allEvents.forEach(event => {
            eventContentLookup[event.id] = event.content || "";
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

        // Initialize collapsed state for all days
        days.forEach(day => {
            if (!(day in bandCollapsedState)) {
                bandCollapsedState[day] = defaultCollapsed;
            }
        });

        // Helper function to get effective band height
        function getEffectiveBandHeight(day) {
            return bandCollapsedState[day] ? bandHeight * collapseFraction : bandHeight;
        }

        // Helper function to get effective marker sizes
        function getEffectiveMarkerSizes(day) {
            if (bandCollapsedState[day]) {
                return {
                    markerSize_h: markerSize_h * collapseFraction,
                    markerSize_v: markerSize_v * collapseFraction,
                    markerSpacing: markerSpacing * collapseFraction
                };
            }
            return { markerSize_h, markerSize_v, markerSpacing };
        }

        // Helper function to calculate filtered density for a specific day
        function calculateFilteredDensityForDay(day, eventsToShow) {
            const dateStr = `2040-10-${day.toString().padStart(2, '0')}`;

            // Filter events for this specific date
            const dateEvents = eventsToShow.filter(event => {
                const eventDate = new Date(event.datetime).toISOString().split('T')[0];
                return eventDate === dateStr;
            });

            // Calculate topic/keyword relevance for each event (same logic as main viz)
            let eventRelevance = {};
            const isTopicMode = selectedTopicId !== null || customKeyword || selectedKeywordId;

            if (isTopicMode) {
                dateEvents.forEach(event => {
                    let relevance = 0;
                    const content = eventContentLookup[event.id].toLowerCase();

                    if (customKeyword) {
                        const escapedTerm = customKeyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");
                        const matches = content.match(regex);
                        relevance = matches ? matches.length : 0;
                    } else if (selectedTopicId !== null && topicsLoaded) {
                        const selectedTopic = allTopics.find(t => t.id === selectedTopicId);
                        if (selectedTopic) {
                            if (currentTopicMethod === "tfidf") {
                                const topicKeywords = selectedTopic.keywords;
                                topicKeywords.forEach(keyword => {
                                    const escapedTerm = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
                                    const matches = content.match(regex);
                                    if (matches) relevance += matches.length;
                                });
                            } else {
                                const topicData = eventTopicData[event.id];
                                if (topicData && topicData.topic_weights && topicData.topic_weights[selectedTopicId - 1] !== undefined) {
                                    relevance = topicData.topic_weights[selectedTopicId - 1];
                                }
                            }
                        }
                    } else if (selectedKeywordId) {
                        const keyword = allKeywords.find(kw => kw.id === selectedKeywordId);
                        if (keyword) {
                            const escapedTerm = keyword.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");
                            const matches = content.match(regex);
                            relevance = matches ? matches.length : 0;
                        }
                    }

                    eventRelevance[event.id] = relevance;
                });
            }

            // Calculate hourly counts for hours 8-14
            const hourCounts = new Array(7).fill(0);

            dateEvents.forEach(event => {
                const hour = new Date(event.datetime).getHours();
                if (hour >= 8 && hour <= 14) {
                    const index = hour - 8;
                    if (isTopicMode) {
                        // Use relevance score instead of count
                        hourCounts[index] += eventRelevance[event.id] || 0;
                    } else {
                        // Use simple count
                        hourCounts[index]++;
                    }
                }
            });

            return {
                date: dateStr,
                counts: hourCounts
            };
        }

        // Helper function to draw density background for a band
        function drawBandDensityBackground(day, yPos, effectiveBandHeight, eventsToShow) {
            if (!hourlyDensityData.density_data || hourlyDensityData.density_data.length === 0) {
                return;
            }

            // Calculate filtered density for this specific day
            const filteredDensityData = calculateFilteredDensityForDay(day, eventsToShow);

            if (!filteredDensityData || filteredDensityData.counts.every(c => c === 0)) return;

            // Create density scale based on band state - use global max for consistency
            const isTopicMode = selectedTopicId !== null || customKeyword || selectedKeywordId;
            let maxDensity;
            if (isTopicMode) {
                // For topic mode, calculate max across all filtered data
                maxDensity = Math.max(1, ...days.map(d => {
                    const dayData = calculateFilteredDensityForDay(d, eventsToShow);
                    return Math.max(...dayData.counts);
                }));
            } else {
                // For normal mode, use original data max
                maxDensity = d3.max(hourlyDensityData.density_data, d => d3.max(d.counts)) || 1;
            }
            const densityScale = bandCollapsedState[day] ?
                effectiveBandHeight * 0.8 : effectiveBandHeight * 0.6; // Different scales for collapsed vs expanded

            // Create Y scale for density within the band
            const densityYScale = d3.scaleLinear()
                .domain([0, maxDensity])
                .range([0, densityScale]);

            // Create area generator
            const area = d3.area()
                .x((d, i) => xScale(8 + i)) // Hours 8-14
                .y0(yPos + effectiveBandHeight - 10) // Bottom of band
                .y1((d) => yPos + effectiveBandHeight - densityYScale(d) - 10) // Top based on density
                .curve(d3.curveMonotoneX);

            // Calculate color for this date
            const dates = hourlyDensityData.dates;
            const dateIndex = dates.indexOf(filteredDensityData.date);
            const n_dates = dates.length;
            const colorPos = 1 / 3 + (2 / 3) * (dateIndex / (n_dates - 1));
            const densityColor = d3.interpolateBlues(colorPos);

            // Add extra 0 value at end to complete the curve
            const extendedCounts = [...filteredDensityData.counts, 0];

            // Update area generator to handle the extra point
            const extendedArea = d3.area()
                .x((d, i) => {
                    if (i < 7) {
                        return xScale(8 + i); // Hours 8-14 (7 points)
                    } else {
                        return xScale(15); // Extra point at hour 15
                    }
                })
                .y0(yPos + effectiveBandHeight - 10) // Bottom of band
                .y1((d) => yPos + effectiveBandHeight - densityYScale(d) - 10) // Top based on density
                .curve(d3.curveMonotoneX);

            // Draw filled area
            svg.append("path")
                .datum(extendedCounts)
                .attr("class", "density-background")
                .attr("fill", densityColor)
                .attr("fill-opacity", 0.3)
                .attr("stroke", densityColor)
                .attr("stroke-width", 1)
                .attr("stroke-opacity", 0.6)
                .attr("d", extendedArea);
        }

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

        // Store constants for drawVisualization function
        const svgWidth = hourRange * hourWidth + 100;
        const hourTicks = d3.range(minHour, maxHour + 1);

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([minHour, maxHour])
            .range([40, svgWidth - 20]);

        let svg; // Will be created in drawVisualization

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
            // Calculate total height based on current collapsed/expanded states
            const totalBandHeight = days.reduce((total, day) => total + getEffectiveBandHeight(day), 0);
            const svgHeight = totalBandHeight + 50 + legendOffsetFromBottom + 10; // Include space for two-line legend

            // Set container height first to prevent layout shifts
            visContainer.style("height", svgHeight + "px");

            // Clear existing SVG and recreate
            visContainer.selectAll("svg").remove();

            // Create SVG with stable positioning
            svg = visContainer.append("svg")
                .attr("width", "100%")
                .attr("height", svgHeight)
                .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
                .attr("preserveAspectRatio", "xMidYMin meet")
                .style("display", "block")
                .style("position", "relative")
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

            // Create axes
            const xAxis = d3.axisTop(xScale)
                .tickValues(hourTicks)
                .tickFormat(d => `${d}:00`);

            svg.append("g")
                .attr("class", "axis")
                .attr("transform", "translate(0, 50)")
                .call(xAxis)
                .attr("color", axisColor);

            // Draw hour lines for entire visualization (bands only)
            hourTicks.forEach(hour => {
                const lineWidth = hour === minHour ? 2 : 1; // Bold line for x=0 (leftmost position)
                const lineColor = hour === minHour ? daySeparatorColor : hourLineColor; // Darker color for x=0

                svg.append("line")
                    .attr("x1", xScale(hour))
                    .attr("y1", 50)
                    .attr("x2", xScale(hour))
                    .attr("y2", totalBandHeight + 50) // Extend to bottom of bands
                    .attr("stroke", lineColor)
                    .attr("stroke-width", lineWidth);
            });

            let eventsToShow;
            if (selectedEntityIds.length > 0) {
                eventsToShow = allEvents.filter(event =>
                    selectedEntityIds.includes(event.entity_id) ||
                    event.target_entities.some(targetId => selectedEntityIds.includes(targetId))
                );
            } else {
                eventsToShow = allEvents;
            }

            // Calculate highlighting based on keywords/topics
            let maxFreq = 0;
            let termFreq = {};
            let currentTerm = "";

            // Priority: custom keyword > selected topic > selected keyword
            if (customKeyword) {
                currentTerm = customKeyword.toLowerCase();
                // Escape special regex characters
                const escapedTerm = currentTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");

                // Calculate frequencies for events to show
                eventsToShow.forEach(event => {
                    const content = eventContentLookup[event.id].toLowerCase();
                    const matches = content.match(regex);
                    const freq = matches ? matches.length : 0;
                    termFreq[event.id] = freq;
                    if (freq > maxFreq) maxFreq = freq;
                });
            } else if (selectedTopicId !== null && topicsLoaded) {
                // Use topic weights for highlighting
                const selectedTopic = allTopics.find(t => t.id === selectedTopicId);
                console.log("Highlighting topic:", selectedTopicId, "method:", currentTopicMethod, "topic:", selectedTopic);

                if (selectedTopic) {
                    if (currentTopicMethod === "tfidf") {
                        // For TF-IDF, use term frequency highlighting based on keywords
                        const topicKeywords = selectedTopic.keywords;
                        console.log("TF-IDF keywords:", topicKeywords);
                        eventsToShow.forEach(event => {
                            const content = eventContentLookup[event.id].toLowerCase();
                            let totalFreq = 0;

                            topicKeywords.forEach(keyword => {
                                const escapedTerm = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
                                const matches = content.match(regex);
                                if (matches) totalFreq += matches.length;
                            });

                            termFreq[event.id] = totalFreq;
                            if (totalFreq > maxFreq) maxFreq = totalFreq;
                        });
                        console.log("TF-IDF maxFreq:", maxFreq, "sample frequencies:", Object.keys(termFreq).slice(0, 5).map(k => `${k}:${termFreq[k]}`));
                    } else {
                        // For BERTopic and LDA, use topic weights
                        eventsToShow.forEach(event => {
                            const topicData = eventTopicData[event.id];
                            if (topicData && topicData.topic_weights && topicData.topic_weights[selectedTopicId - 1] !== undefined) {
                                const weight = topicData.topic_weights[selectedTopicId - 1];
                                termFreq[event.id] = weight;
                                if (weight > maxFreq) maxFreq = weight;
                            } else {
                                termFreq[event.id] = 0;
                            }
                        });
                        console.log("Topic weights maxFreq:", maxFreq, "sample weights:", Object.keys(termFreq).slice(0, 5).map(k => `${k}:${termFreq[k]}`));
                    }
                }
            } else if (selectedKeywordId) {
                const keyword = allKeywords.find(kw => kw.id === selectedKeywordId);
                currentTerm = keyword ? keyword.term.toLowerCase() : "";

                if (currentTerm) {
                    const escapedTerm = currentTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");

                    eventsToShow.forEach(event => {
                        const content = eventContentLookup[event.id].toLowerCase();
                        const matches = content.match(regex);
                        const freq = matches ? matches.length : 0;
                        termFreq[event.id] = freq;
                        if (freq > maxFreq) maxFreq = freq;
                    });
                }
            }

            const filteredEventsByDay = {};
            eventsToShow.forEach(event => {
                const day = event.day;
                if (!filteredEventsByDay[day]) filteredEventsByDay[day] = [];
                filteredEventsByDay[day].push(event);
            });

            // Calculate cumulative positions for bands
            let cumulativeY = 60; // Start after the axis (which is at 50)
            days.forEach((day) => {
                const effectiveBandHeight = getEffectiveBandHeight(day);
                const yPos = cumulativeY;

                // Draw density background first (behind everything)
                drawBandDensityBackground(day, yPos, effectiveBandHeight, eventsToShow);

                // Create clickable band background for expand/collapse
                const bandRect = svg.append("rect")
                    .attr("x", 20)
                    .attr("y", yPos)
                    .attr("width", svgWidth - 40)
                    .attr("height", effectiveBandHeight)
                    .attr("fill", "transparent")
                    .attr("cursor", "pointer")
                    .on("click", function () {
                        // Toggle collapsed state
                        bandCollapsedState[day] = !bandCollapsedState[day];
                        // Redraw visualization
                        drawVisualization();
                    });

                svg.append("line")
                    .attr("x1", 20)
                    .attr("y1", yPos + effectiveBandHeight - 10)
                    .attr("x2", svgWidth - 20)
                    .attr("y2", yPos + effectiveBandHeight - 10)
                    .attr("stroke", daySeparatorColor)
                    .attr("stroke-width", 2);

                const yCenter = yPos + effectiveBandHeight / 2 - 10;


                // Only show text when expanded
                if (!bandCollapsedState[day]) {
                    svg.append("text")
                        .attr("class", "axis font-medium")
                        .attr("x", 20)
                        .attr("y", yCenter)
                        .attr("dy", "0.35em")
                        .attr("transform", `rotate(-90, 20, ${yCenter})`)
                        .attr("text-anchor", "middle")
                        .attr("fill", textColor)
                        .text(`Oct ${day}`);
                } else {
                    // Show minimal indicator when collapsed
                    svg.append("text")
                        .attr("class", "axis font-medium")
                        .attr("x", 20)
                        .attr("y", yCenter)
                        .attr("dy", "0.35em")
                        .attr("transform", `rotate(-90, 20, ${yCenter})`)
                        .attr("text-anchor", "middle")
                        .attr("fill", textColor)
                        .attr("font-size", "10px")
                        .text(`${day}`);
                }

                if (!filteredEventsByDay[day] || filteredEventsByDay[day].length === 0) {
                    cumulativeY += effectiveBandHeight;
                    return;
                }

                // Get effective marker sizes for this band
                const effectiveMarkerSizes = getEffectiveMarkerSizes(day);
                const effectiveMaxStackHeight = effectiveBandHeight - 10;

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
                        if (currentHeight + effectiveMarkerSizes.markerSize_v + effectiveMarkerSizes.markerSpacing > effectiveMaxStackHeight) {
                            stacks.push(currentStack);
                            currentStack = [];
                            currentHeight = 0;
                        }
                        currentStack.push(event);
                        currentHeight += effectiveMarkerSizes.markerSize_v + effectiveMarkerSizes.markerSpacing;
                    });
                    if (currentStack.length > 0) stacks.push(currentStack);

                    stacks.forEach((stack, stackIndex) => {
                        const stackXPos = 5 + xPos + stackIndex * (effectiveMarkerSizes.markerSize_h + effectiveMarkerSizes.markerSpacing);

                        stack.forEach((event, eventIndex) => {
                            // Add minimal top padding for collapsed bands to center them slightly
                            const topPadding = bandCollapsedState[day] ? - 2.5 : 0;
                            const yPosInStack = yPos + topPadding + eventIndex * (effectiveMarkerSizes.markerSize_v + effectiveMarkerSizes.markerSpacing);

                            // Calculate opacity based on keyword/topic frequency
                            let opacity = 1;
                            const isHighlighting = currentTerm || (selectedTopicId !== null && topicsLoaded);

                            if (isHighlighting) {
                                const freq = termFreq[event.id] || 0;
                                if (maxFreq > 0) {
                                    // Scale opacity between 0.2 and 1.0 for better visibility
                                    opacity = 0.2 + 0.8 * (freq / maxFreq);
                                } else {
                                    // If no maxFreq but we're highlighting, make irrelevant events faint
                                    opacity = freq > 0 ? 1.0 : 0.1;
                                }

                                // Debug logging for opacity calculation
                                if (event === stack[0]) { // Only log for first event in stack to avoid spam
                                    console.log(`Event ${event.id}: freq=${freq}, maxFreq=${maxFreq}, opacity=${opacity}`);
                                }
                            }

                            // Create main group for the message with rounded clipping
                            const markerGroup = svg.append("g")
                                .attr("class", "marker-group")
                                .attr("transform", `translate(${stackXPos},${yPosInStack})`)
                                .style("opacity", opacity);

                            // Create clip path for rounded corners
                            const clipId = `clip-${event.id}-${Math.random().toString(36).substr(2, 9)}`;
                            const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
                            defs.append("clipPath")
                                .attr("id", clipId)
                                .append("rect")
                                .attr("width", effectiveMarkerSizes.markerSize_h)
                                .attr("height", effectiveMarkerSizes.markerSize_v)
                                .attr("rx", cornerRadius * (bandCollapsedState[day] ? collapseFraction : 1))
                                .attr("ry", cornerRadius * (bandCollapsedState[day] ? collapseFraction : 1));

                            // Apply clip path to the marker group
                            const clippedGroup = markerGroup.append("g")
                                .attr("clip-path", `url(#${clipId})`);

                            // Add mouse events to the marker group
                            markerGroup
                                .on("mouseover", function (e) {
                                    // Show tooltip
                                    const source = event.entity_id;
                                    const targets = event.target_entities.join(', ');
                                    const message = event.content || 'No message content';

                                    tooltip.html(`
                                        <div><span class="font-medium">Source:</span> ${source}</div>
                                        <div><span class="font-medium">Target:</span> ${targets}</div>
                                        <div class="mt-2"><span class="font-medium">Message:</span> ${message}</div>
                                        <div class="mt-1 text-xs text-gray-500">${event.datetime}</div>
                                    `)
                                        .style("left", (e.pageX + 10) + "px")
                                        .style("top", (e.pageY + 10) + "px")
                                        .classed("hidden", false);

                                    // Add subtle stroke to entire marker
                                    clippedGroup.append("rect")
                                        .attr("class", "hover-outline")
                                        .attr("width", effectiveMarkerSizes.markerSize_h)
                                        .attr("height", effectiveMarkerSizes.markerSize_v)
                                        .attr("fill", "none")
                                        .attr("stroke", "#000")
                                        .attr("stroke-width", 1);

                                    // Increase opacity on hover
                                    d3.select(this).style("opacity", 1);
                                })
                                .on("mouseout", function () {
                                    tooltip.classed("hidden", true);
                                    clippedGroup.select(".hover-outline").remove();

                                    // Restore original opacity
                                    const isHighlighting = currentTerm || (selectedTopicId !== null && topicsLoaded);
                                    if (isHighlighting) {
                                        const freq = termFreq[event.id] || 0;
                                        if (maxFreq > 0) {
                                            d3.select(this).style("opacity", 0.2 + 0.8 * (freq / maxFreq));
                                        } else {
                                            d3.select(this).style("opacity", freq > 0 ? 1.0 : 0.1);
                                        }
                                    } else {
                                        d3.select(this).style("opacity", 1);
                                    }
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

                            // Draw source box (left side)
                            clippedGroup.append("rect")
                                .attr("class", "source-box")
                                .attr("x", 0)
                                .attr("y", 0)
                                .attr("width", effectiveMarkerSizes.markerSize_h / 2)
                                .attr("height", effectiveMarkerSizes.markerSize_v)
                                .attr("fill", sourceEntity ? colors[sourceEntity.sub_type] || "#777" : "#999")
                                .style("shape-rendering", "crispEdges");

                            // Draw target box (right side) with crisp edges to avoid white lines
                            clippedGroup.append("rect")
                                .attr("class", "target-box")
                                .attr("x", effectiveMarkerSizes.markerSize_h / 2)
                                .attr("y", 0)
                                .attr("width", effectiveMarkerSizes.markerSize_h / 2)
                                .attr("height", effectiveMarkerSizes.markerSize_v)
                                .attr("fill", targetEntity ? colors[targetEntity.sub_type] || "#999" : "#bbb")
                                .style("shape-rendering", "crispEdges");

                            // Add letters when expanded (not collapsed)
                            if (!bandCollapsedState[day]) {
                                const fontSize = "10px";

                                // Source letter (left box)
                                clippedGroup.append("text")
                                    .attr("class", "source-letter")
                                    .attr("x", effectiveMarkerSizes.markerSize_h / 4)
                                    .attr("y", effectiveMarkerSizes.markerSize_v / 2)
                                    .attr("dy", "0.35em")
                                    .attr("text-anchor", "middle")
                                    .attr("fill", "white")
                                    .attr("font-weight", "bold")
                                    .attr("font-size", fontSize)
                                    .text(sourceLetter);

                                // Target letter (right box)
                                clippedGroup.append("text")
                                    .attr("class", "target-letter")
                                    .attr("x", effectiveMarkerSizes.markerSize_h * 0.75)
                                    .attr("y", effectiveMarkerSizes.markerSize_v / 2)
                                    .attr("dy", "0.35em")
                                    .attr("text-anchor", "middle")
                                    .attr("fill", "white")
                                    .attr("font-weight", "bold")
                                    .attr("font-size", fontSize)
                                    .text(targetLetter);
                            }
                        });
                    });
                });

                // Update cumulative position for next band
                cumulativeY += effectiveBandHeight;
            });

            // Draw legend for message boxes
            drawMessageBoxLegend(svg, cumulativeY + legendOffsetFromBottom, xScale);
        }

        // Function to draw message box legend
        function drawMessageBoxLegend(svg, yPosition, xScale) {
            const legendGroup = svg.append("g")
                .attr("class", "message-box-legend")
                .attr("transform", `translate(40, ${yPosition})`);

            // Use same dimensions as actual markers
            const exampleBoxWidth = markerSize_h;
            const exampleBoxHeight = markerSize_v;

            // Create clip path for rounded corners (same as visualization)
            const clipId = `legend-clip-${Math.random().toString(36).substr(2, 9)}`;
            const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
            defs.append("clipPath")
                .attr("id", clipId)
                .append("rect")
                .attr("width", exampleBoxWidth)
                .attr("height", exampleBoxHeight)
                .attr("rx", cornerRadius)
                .attr("ry", cornerRadius);

            // Apply clip path to the legend group
            const clippedLegendGroup = legendGroup.append("g")
                .attr("clip-path", `url(#${clipId})`);

            // Draw source box (left side) - exactly like visualization
            clippedLegendGroup.append("rect")
                .attr("class", "source-box")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", exampleBoxWidth / 2)
                .attr("height", exampleBoxHeight)
                .attr("fill", colors['Person'])
                .style("shape-rendering", "crispEdges");

            // Draw target box (right side) - exactly like visualization
            clippedLegendGroup.append("rect")
                .attr("class", "target-box")
                .attr("x", exampleBoxWidth / 2)
                .attr("y", 0)
                .attr("width", exampleBoxWidth / 2)
                .attr("height", exampleBoxHeight)
                .attr("fill", colors['Organization'])
                .style("shape-rendering", "crispEdges");

            // Add letters exactly like visualization
            const fontSize = "10px";

            // Source letter (left box)
            clippedLegendGroup.append("text")
                .attr("class", "source-letter")
                .attr("x", exampleBoxWidth / 4)
                .attr("y", exampleBoxHeight / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .attr("font-weight", "bold")
                .attr("font-size", fontSize)
                .text("P");

            // Target letter (right box)
            clippedLegendGroup.append("text")
                .attr("class", "target-letter")
                .attr("x", exampleBoxWidth * 0.75)
                .attr("y", exampleBoxHeight / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .attr("font-weight", "bold")
                .attr("font-size", fontSize)
                .text("O");

            // Add explanatory text
            legendGroup.append("text")
                .attr("x", exampleBoxWidth + 8)
                .attr("y", exampleBoxHeight / 2)
                .attr("dy", "0.35em")
                .attr("font-size", "11px")
                .attr("fill", textColor)
                .text("Message: Source (P) → Target (O)");

            // Add color legend with simple boxes
            let colorLegendX = exampleBoxWidth + 200; // Start after the message explanation
            const colorBoxSize = 12;
            const colorSpacing = 160; // Doubled spacing

            Object.entries(colors).forEach(([entityType, color], index) => {
                const colorGroup = legendGroup.append("g")
                    .attr("transform", `translate(${colorLegendX + index * colorSpacing}, 0)`);

                // Simple colored box
                colorGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", 2)
                    .attr("width", colorBoxSize)
                    .attr("height", colorBoxSize)
                    .attr("fill", color)
                    .attr("rx", 2)
                    .attr("ry", 2);

                // Entity type label
                colorGroup.append("text")
                    .attr("x", colorBoxSize + 4)
                    .attr("y", colorBoxSize / 2 + 2)
                    .attr("dy", "0.35em")
                    .attr("font-size", "10px")
                    .attr("fill", textColor)
                    .text(entityType);
            });

            // Add second line for density legend
            const densityLegendY = exampleBoxHeight + 18; // Position below the first line

            // Draw example density area (filled below curve like actual density)
            const densityLineLength = 40;
            const densityBaseline = densityLegendY + 4; // Baseline below the curve
            const densityPath = legendGroup.append("path")
                .attr("d", `M 0,${densityBaseline} L 0,${densityLegendY} Q ${densityLineLength / 4},${densityLegendY - 8} ${densityLineLength / 2},${densityLegendY - 4} Q ${densityLineLength * 3 / 4},${densityLegendY + 2} ${densityLineLength},${densityLegendY} L ${densityLineLength},${densityBaseline} Z`)
                .attr("fill", "#3b82f6")
                .attr("fill-opacity", 0.3)
                .attr("stroke", "#1e40af")
                .attr("stroke-width", 2)
                .attr("stroke-opacity", 0.4);

            // Add density explanation text
            legendGroup.append("text")
                .attr("x", densityLineLength + 8)
                .attr("y", densityLegendY)
                .attr("dy", "0.35em")
                .attr("font-size", "11px")
                .attr("fill", textColor)
                .text("Communication/Topic density (filtered by topic/entity selection)");
        }


        // Function to calculate filtered density based on selected entities and topics
        function calculateFilteredDensity() {
            // Start with all events
            let filteredEvents = allEvents;

            // Filter by selected entities
            if (selectedEntityIds.length > 0) {
                filteredEvents = filteredEvents.filter(event =>
                    selectedEntityIds.includes(event.entity_id) ||
                    event.target_entities.some(targetId => selectedEntityIds.includes(targetId))
                );
            }

            // Calculate topic/keyword relevance for each event
            let eventRelevance = {};
            const isTopicMode = selectedTopicId !== null || customKeyword || selectedKeywordId;

            if (isTopicMode) {
                // Calculate relevance scores similar to the main visualization
                filteredEvents.forEach(event => {
                    let relevance = 0;
                    const content = eventContentLookup[event.id].toLowerCase();

                    if (customKeyword) {
                        const escapedTerm = customKeyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");
                        const matches = content.match(regex);
                        relevance = matches ? matches.length : 0;
                    } else if (selectedTopicId !== null && topicsLoaded) {
                        const selectedTopic = allTopics.find(t => t.id === selectedTopicId);
                        if (selectedTopic) {
                            if (currentTopicMethod === "tfidf") {
                                const topicKeywords = selectedTopic.keywords;
                                topicKeywords.forEach(keyword => {
                                    const escapedTerm = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
                                    const matches = content.match(regex);
                                    if (matches) relevance += matches.length;
                                });
                            } else {
                                const topicData = eventTopicData[event.id];
                                if (topicData && topicData.topic_weights && topicData.topic_weights[selectedTopicId - 1] !== undefined) {
                                    relevance = topicData.topic_weights[selectedTopicId - 1];
                                }
                            }
                        }
                    } else if (selectedKeywordId) {
                        const keyword = allKeywords.find(kw => kw.id === selectedKeywordId);
                        if (keyword) {
                            const escapedTerm = keyword.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");
                            const matches = content.match(regex);
                            relevance = matches ? matches.length : 0;
                        }
                    }

                    eventRelevance[event.id] = relevance;
                });
            }

            // Recalculate density for filtered events
            const filteredDensityData = [];

            hourlyDensityData.dates.forEach(date => {
                const dateEvents = filteredEvents.filter(event => {
                    const eventDate = new Date(event.datetime).toISOString().split('T')[0];
                    return eventDate === date;
                });

                const hourCounts = new Array(7).fill(0); // Hours 8-14 (7 hours)

                dateEvents.forEach(event => {
                    const hour = new Date(event.datetime).getHours();
                    if (hour >= 8 && hour <= 14) {
                        const index = hour - 8;
                        if (isTopicMode) {
                            // Use relevance score instead of count
                            hourCounts[index] += eventRelevance[event.id] || 0;
                        } else {
                            // Use simple count
                            hourCounts[index]++;
                        }
                    }
                });

                filteredDensityData.push({
                    date: date,
                    counts: hourCounts
                });
            });

            return filteredDensityData;
        }

        drawVisualization();

        // Create legend
        const legendScrollContainer = legendContainer.append("div")
            .attr("class", "overflow-y-auto")
            .style("max-height", "300px");

        const legendItems = legendScrollContainer.selectAll(".legend-item")
            .data(allEntities)
            .enter()
            .append("div")
            .attr("class", "legend-item cursor-pointer px-2 py-1 rounded hover:bg-gray-100 flex items-center")
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
            .style("width", "16px")
            .style("height", "16px")
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

        // Add topic modeling section
        createTopicModelingSection();

        // Auto-load topics after visualization is ready
        loadTopicData();

        // Function to load topic data (defined first so it can be referenced)
        function loadTopicData() {
            // Clear current topic selection and highlighting when parameters change
            selectedTopicId = null;
            selectedKeywordId = null;
            customKeyword = "";
            d3.select("input[type='text']").property("value", "");

            // Reset dropdown button text
            d3.select("#topics-dropdown-button").text("Select Topic");

            // Immediately update visualization to clear highlighting
            drawVisualization();

            const isAuto = d3.select("#topic-auto").property("checked");
            const topicCount = isAuto ? "auto" : d3.select("input[type='range']").property("value");

            const params = new URLSearchParams({
                include_topics: "true",
                method: currentTopicMethod,
                num_topics: topicCount
            });

            // Show loading status and hide topic selector
            d3.select(".loading-status").style("display", "block");
            d3.select(".topics-dropdown-container").style("display", "none");

            d3.json(`/data/daily_patterns?${params}`).then(data => {
                if (data.error) {
                    console.error("Error loading topic data:", data.error);
                    return;
                }

                allTopics = data.topics || [];

                // Create event topic data lookup
                eventTopicData = {};
                if (data.event_topic_data) {
                    data.event_topic_data.forEach(item => {
                        eventTopicData[item.event_id] = item;
                    });
                }

                // Clear any previous topic selection when new topics load
                selectedTopicId = null;
                selectedKeywordId = null;
                customKeyword = "";
                d3.select("input[type='text']").property("value", "");

                topicsLoaded = true;
                updateTopicsList();

                // Redraw visualization to clear any highlighting
                drawVisualization();

                // Hide loading status and show topics dropdown
                d3.select(".loading-status").style("display", "none");
                d3.select(".topics-dropdown-container").style("display", "block");

            }).catch(error => {
                console.error("Error loading topic data:", error);
                // Hide loading status on error, keep topic selector hidden
                d3.select(".loading-status").style("display", "none");
                d3.select(".topics-dropdown-container").style("display", "none");
            });
        }

        // Function to update topics dropdown
        function updateTopicsList() {
            const dropdownContent = d3.select("#topics-dropdown-content");
            const dropdownButton = d3.select("#topics-dropdown-button");

            dropdownContent.selectAll("*").remove();

            // Add "None" option
            const noneItem = dropdownContent.append("li");
            noneItem.append("a")
                .attr("class", `dropdown-item px-2 py-1 text-xs hover:bg-gray-100 cursor-pointer ${selectedTopicId === null ? "text-indigo-700 bg-indigo-50" : "text-gray-900"}`)
                .on("click", function () {
                    selectedTopicId = null;
                    selectedKeywordId = null;
                    customKeyword = "";
                    d3.select("input[type='text']").property("value", "");

                    // Update button text
                    dropdownButton.text('Select Topic');

                    // Close dropdown
                    d3.select("#topics-dropdown").node().open = false;

                    drawVisualization();
                    updateTopicSelection();
                })
                .text("None");

            allTopics.forEach(topic => {
                const listItem = dropdownContent.append("li");
                const linkDiv = listItem.append("a")
                    .attr("class", `dropdown-item px-2 py-1 text-xs hover:bg-gray-100 cursor-pointer ${selectedTopicId === topic.id ? "text-indigo-700 bg-indigo-50" : "text-gray-900"}`)
                    .on("click", function () {
                        const previousTopicId = selectedTopicId;
                        selectedTopicId = selectedTopicId === topic.id ? null : topic.id;
                        selectedKeywordId = null;
                        customKeyword = "";
                        d3.select("input[type='text']").property("value", "");

                        // Update button text
                        if (selectedTopicId !== null) {
                            dropdownButton.text(`Topic ${topic.id}: ${topic.keywords.join(', ')}`);
                        } else {
                            dropdownButton.text('Select Topic');
                        }

                        // Close dropdown
                        d3.select("#topics-dropdown").node().open = false;

                        console.log(`Topic clicked: ${topic.id}, previous: ${previousTopicId}, new: ${selectedTopicId}`);
                        console.log("topicsLoaded:", topicsLoaded, "eventTopicData keys:", Object.keys(eventTopicData).length);

                        drawVisualization();
                        updateTopicSelection();
                    });

                // Two-line layout for each topic
                linkDiv.append("div")
                    .attr("class", "font-medium")
                    .text(`Topic ${topic.id}`);

                linkDiv.append("div")
                    .attr("class", "text-xs opacity-70")
                    .text(topic.keywords.slice(0, 4).join(", "));
            });

            // Initialize dropdown behavior
            setupDropdownBehavior();
            
            // Update button text based on current selection
            if (selectedTopicId !== null) {
                const selectedTopic = allTopics.find(t => t.id === selectedTopicId);
                if (selectedTopic) {
                    dropdownButton.text(`Topic ${selectedTopic.id}: ${selectedTopic.keywords.join(', ')}`);
                }
            } else {
                dropdownButton.text("Select Topic");
            }
        }

        // Function to setup dropdown click behavior
        function setupDropdownBehavior() {
            const dropdown = d3.select("#topics-dropdown");

            // Close dropdown when clicking outside
            d3.select("body").on("click.dropdown", function (event) {
                // Check if click is outside the dropdown
                if (!dropdown.node().contains(event.target)) {
                    dropdown.node().open = false;
                }
            });

            // Prevent dropdown from closing when clicking inside content
            d3.select("#topics-dropdown-content").on("click", function (event) {
                event.stopPropagation();
            });
        }

        // Function to update topic selection UI
        function updateTopicSelection() {
            // Simply rebuild the dropdown to ensure proper highlighting
            updateTopicsList();
        }

        // Function to create topic modeling controls
        function createTopicModelingSection() {
            const topicContainer = legendContainer.append("div")
                .attr("class", "mt-6 pt-4 border-t border-gray-200");

            topicContainer.append("div")
                .attr("class", "font-medium text-sm mb-2")
                .text("Topic Analysis");

            // Topic controls in a single row
            const topicControlsRow = topicContainer.append("div")
                .attr("class", "flex gap-3 mb-3");

            // Topic method selector
            const methodGroup = topicControlsRow.append("div")
                .attr("class", "flex-1");

            methodGroup.append("label")
                .attr("class", "block text-xs font-medium text-gray-700 mb-1")
                .text("Method:");

            const methodSelect = methodGroup.append("select")
                .attr("class", "w-full px-2 py-1 border border-gray-300 rounded text-xs")
                .on("change", function () {
                    currentTopicMethod = this.value;
                    loadTopicData();
                });

            methodSelect.append("option").attr("value", "bertopic").text("BERTopic");
            methodSelect.append("option").attr("value", "lda?vectorizer=tfidf").attr("selected", "selected").text("LDA (TF-IDF)");
            methodSelect.append("option").attr("value", "lda?vectorizer=bow").text("LDA (BOW)");
            methodSelect.append("option").attr("value", "tfidf").text("TF-IDF");

            // Topic count controls
            const countGroup = topicControlsRow.append("div")
                .attr("class", "flex-1");


            const countContainer = countGroup.append("div")
                .attr("class", "flex items-center gap-1");

            const autoCheckbox = countContainer.append("input")
                .attr("type", "checkbox")
                .attr("id", "topic-auto")
                .property("checked", false)
                .on("change", function () {
                    countSlider.property("disabled", this.checked);
                    loadTopicData();
                });

            countContainer.append("label")
                .attr("for", "topic-auto")
                .attr("class", "text-xs")
                .text("Auto");

            const sliderContainer = countGroup.append("div")
                .attr("class", "mt-1");

            const countSlider = sliderContainer.append("input")
                .attr("type", "range")
                .attr("min", "5")
                .attr("max", "20")
                .attr("value", "15")
                .property("disabled", false)
                .attr("class", "w-full")
                .on("input", function () {
                    countDisplay.text(this.value + " topics");
                })
                .on("change", function () {
                    loadTopicData();
                });

            const countDisplay = sliderContainer.append("div")
                .attr("class", "text-xs text-center text-gray-600 mt-1")
                .text("15 topics");


            // Loading status indicator
            const loadingStatus = topicContainer.append("div")
                .attr("class", "w-full px-3 py-2 text-center text-sm mb-3 loading-status")
                .style("display", "none")
                .text("Loading topics...");

            // Topics dropdown container using Daisy UI
            const topicsDropdownContainer = topicContainer.append("div")
                .attr("class", "topics-dropdown-container mb-3 p-2 border border-gray-200 bg-gray-50 rounded-lg")
                .style("display", "none");


            // Create Daisy UI dropdown using details/summary for better control
            const dropdownDetails = topicsDropdownContainer.append("details")
                .attr("id", "topics-dropdown")
                .attr("class", "dropdown w-full");

            const dropdownButton = dropdownDetails.append("summary")
                .attr("id", "topics-dropdown-button")
                .attr("class", "btn btn-sm btn-outline w-full justify-between text-xs")
                .text("Select Topic");

            const dropdownContent = dropdownDetails.append("ul")
                .attr("id", "topics-dropdown-content")
                .attr("class", "dropdown-content menu bg-base-100 rounded-box z-[1] w-full p-2 shadow border max-h-60 overflow-y-auto");

            // Custom keyword section (keeping this for backward compatibility)
            const keywordGroup = topicContainer.append("div")
                .attr("class", "mt-4 pt-3 border-t border-gray-200");

            keywordGroup.append("div")
                .attr("class", "text-xs font-medium text-gray-700 mb-2")
                .text("Custom Expression:");

            const inputGroup = keywordGroup.append("div")
                .attr("class", "flex gap-2");

            const customInput = inputGroup.append("input")
                .attr("type", "text")
                .attr("placeholder", "Type expression...")
                .attr("class", "flex-1 px-2 py-1 border border-gray-300 rounded text-xs")
                .on("keypress", function (event) {
                    if (event.key === "Enter") {
                        customKeyword = this.value.trim();
                        selectedTopicId = null;
                        selectedKeywordId = null;
                        drawVisualization();
                        updateTopicSelection();
                    }
                });

            inputGroup.append("button")
                .attr("class", "px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600")
                .text("Apply")
                .on("click", function () {
                    customKeyword = customInput.property("value").trim();
                    selectedTopicId = null;
                    selectedKeywordId = null;
                    drawVisualization();
                    updateTopicSelection();
                });

            // Reset button
            topicContainer.append("button")
                .attr("class", "mt-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs w-full")
                .text("Reset Highlighting")
                .on("click", function () {
                    selectedTopicId = null;
                    selectedKeywordId = null;
                    customKeyword = "";
                    customInput.property("value", "");
                    drawVisualization();
                    updateTopicSelection();
                });
        }

    }).catch(error => {
        console.error("Error loading daily patterns data:", error);
    });
}

window.init_daily_patterns = init_daily_patterns;