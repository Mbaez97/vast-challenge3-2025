// app/static/js/nadia_analysis.js - Final clean version for Network Analysis only
function init_nadia_analysis() {
    console.log("Initializing Nadia Conti analysis...");
    
    let analysisData = null;
    
    // Load data from Flask endpoint
    d3.json("/data/nadia_analysis")
        .then(data => {
            if (data.error) {
                showError(data.error);
                return;
            }
            
            analysisData = data;
            console.log("Nadia analysis data loaded:", data);
            
            // Initialize only Network Analysis
            updateNetworkTab(data);
        })
        .catch(error => {
            console.error("Error loading Nadia analysis data:", error);
        });
    
    function showError(errorMessage) {
        d3.select("#network-graph").html(`
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 class="text-red-800 font-semibold">Error Loading Data</h3>
                <p class="text-red-600">${errorMessage}</p>
            </div>
        `);
    }
    
    function updateNetworkTab(data) {
        console.log("Updating network tab...");
        
        // Clear previous content
        d3.select("#network-graph").html("");
        d3.select("#contacts-list").html("");
        
        try {
            // Cargar datos desde el endpoint de Flask que automáticamente lee desde data/MC3_graph_communication.json
            console.log("🔄 Loading data from Flask endpoint...");
            d3.json("/data/nadia_analysis")
                .then(analysisData => {
                    console.log("✅ Loaded analysis data successfully");
                    
                    // El endpoint ya debería incluir graph_data
                    const graph = analysisData.graph_data || analysisData;
                    console.log("Graph structure:", {
                        nodes: graph.nodes?.length || 0,
                        links: graph.links?.length || 0
                    });
                    
                    // Procesar TODOS los links del grafo para encontrar patrones indirectos
                    const allProcessedLinks = graph.links.map(d => {
                        // Procesar fecha
                        d.datetime = d3.timeParse("%Y-%m-%d %H:%M:%S")(d.datetime);
                        d.day = d3.timeDay(d.datetime);
                        d.hour = d.datetime.getHours();
                        
                        // Determinar otra persona en la comunicación
                        d.other_person = d.source === "Nadia Conti" ? d.target : d.source;
                        
                        // Encontrar información del nodo
                        const otherNode = graph.nodes.find(n => n.id === d.other_person) || {};
                        d.is_pseudonym = !!otherNode.is_pseudonym;
                        
                        // Marcar tipo de conexión
                        d.connection_type = (d.source === "Nadia Conti" || d.target === "Nadia Conti") ? "direct" : "indirect";
                        
                        return d;
                    });
                    
                    // Filtrar solo las comunicaciones directas de Nadia para la visualización inicial
                    const nadiaDirectLinks = allProcessedLinks.filter(d => 
                        d.source === "Nadia Conti" || d.target === "Nadia Conti"
                    );
                    
                    console.log(`Found ${nadiaDirectLinks.length} direct communications for Nadia`);
                    console.log(`Processing ${allProcessedLinks.length} total communications for indirect patterns`);
                    
                    // Encontrar patrones de comunicación indirecta usando TODOS los links
                    const indirectPatterns = findIntermediaryPatterns(allProcessedLinks, graph.nodes);
                    console.log(`Found ${indirectPatterns.length} indirect communication patterns`);
                    
                    // Crear visualización temporal
                    createTemporalNetworkVisualization(nadiaDirectLinks, indirectPatterns);
                })
                .catch(err => console.error("❌ Failed to load graph JSON:", err));
        } catch (error) {
            console.error("Error in updateNetworkTab:", error);
            d3.select("#network-graph").html('<p class="text-red-500">Error loading network analysis</p>');
        }
    }
    
    function findIntermediaryPatterns(allLinks, nodes, timeWindowHours = 24) {
        const indirectPatterns = [];
        const timeWindow = timeWindowHours * 60 * 60 * 1000; // Convertir a milisegundos
        
        // Buscar personas que se comunican con Nadia
        const nadiaContacts = new Set();
        allLinks.forEach(link => {
            if (link.source === "Nadia Conti") {
                nadiaContacts.add(link.target);
            } else if (link.target === "Nadia Conti") {
                nadiaContacts.add(link.source);
            }
        });
        
        console.log(`Analyzing ${allLinks.length} total links for indirect patterns`);
        console.log(`Nadia has direct contacts with: ${Array.from(nadiaContacts)}`);
        
        // Buscar patrones A → B → Nadia y Nadia → B → A
        allLinks.forEach(firstLink => {
            // Solo analizar links que no involucren directamente a Nadia
            if (firstLink.source === "Nadia Conti" || firstLink.target === "Nadia Conti") {
                return;
            }
            
            const intermediary = firstLink.target;
            const originPerson = firstLink.source;
            
            // Verificar si el intermediario se comunica con Nadia
            if (!nadiaContacts.has(intermediary)) {
                return;
            }
            
            // Buscar comunicaciones entre el intermediario y Nadia dentro de la ventana de tiempo
            allLinks.forEach(secondLink => {
                if ((secondLink.source === intermediary && secondLink.target === "Nadia Conti") ||
                    (secondLink.target === intermediary && secondLink.source === "Nadia Conti")) {
                    
                    // Verificar que ambas fechas sean válidas
                    if (!firstLink.datetime || !secondLink.datetime) {
                        return;
                    }
                    
                    const timeDiff = Math.abs(secondLink.datetime - firstLink.datetime);
                    
                    if (timeDiff <= timeWindow) {
                        // Encontrado patrón indirecto
                        const pattern = {
                            event_id: `indirect_${firstLink.event_id}_${secondLink.event_id}`,
                            datetime: firstLink.datetime,
                            day: firstLink.day,
                            hour: firstLink.hour,
                            other_person: originPerson,
                            intermediary: intermediary,
                            connection_type: "indirect",
                            is_pseudonym: false, // Determinaremos esto después
                            label: `${originPerson} (via ${intermediary})`,
                            time_gap_hours: timeDiff / (1000 * 60 * 60),
                            pattern_type: firstLink.datetime < secondLink.datetime ? `${originPerson}→${intermediary}→Nadia` : `Nadia→${intermediary}→${originPerson}`,
                            first_link: firstLink,
                            second_link: secondLink,
                            // Generar contenido descriptivo basado en los mensajes originales
                            content: `Indirect communication pattern detected:\\n1. ${originPerson} → ${intermediary}: "${firstLink.content || 'Communication detected'}"\\n2. ${intermediary} → Nadia Conti: "${secondLink.content || 'Follow-up communication'}"\\n\\nTime gap: ${(timeDiff / (1000 * 60 * 60)).toFixed(1)} hours`,
                            source: originPerson,
                            target: "Nadia Conti"
                        };
                        
                        // Verificar pseudónimos en toda la cadena
                        const originNode = nodes.find(n => n.id === originPerson) || {};
                        const intermediaryNode = nodes.find(n => n.id === intermediary) || {};
                        
                        pattern.is_pseudonym = !!originNode.is_pseudonym;
                        pattern.intermediary_is_pseudonym = !!intermediaryNode.is_pseudonym;
                        pattern.has_any_pseudonym = pattern.is_pseudonym || pattern.intermediary_is_pseudonym;
                        pattern.pseudonym_count = (pattern.is_pseudonym ? 1 : 0) + (pattern.intermediary_is_pseudonym ? 1 : 0);
                        
                        indirectPatterns.push(pattern);
                    }
                }
            });
        });
        
        // Filtrar duplicados y mantener solo los más relevantes
        const uniquePatterns = [];
        const seen = new Set();
        
        indirectPatterns.forEach(pattern => {
            const key = `${pattern.other_person}_${pattern.intermediary}_${pattern.day.toISOString()}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniquePatterns.push(pattern);
            }
        });
        
        console.log(`🔍 Found ${indirectPatterns.length} raw indirect patterns, ${uniquePatterns.length} unique patterns`);
        if (uniquePatterns.length > 0) {
            console.log("Sample indirect pattern:", uniquePatterns[0]);
        }
        
        return uniquePatterns;
    }
    
    function createTemporalNetworkVisualization(directCommunications, indirectCommunications) {
        const container = d3.select("#network-graph");
        container.html(""); // Limpiar contenido previo
        
        // Crear contenedor principal con leyenda y gráfico
        const mainContainer = container.append("div")
            .style("width", "100%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "20px");
        
        // Crear controles (solo botón y contador)
        const controlsContainer = mainContainer.append("div")
            .style("display", "flex")
            .style("justify-content", "flex-start")
            .style("align-items", "center")
            .style("padding", "10px")
            .style("background", "#f8fafc")
            .style("border-radius", "8px")
            .style("border", "1px solid #e2e8f0")
            .style("gap", "15px");
        
        // Botón de toggle
        const toggleButton = controlsContainer.append("button")
            .attr("class", "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600")
            .text("Hide Indirect Communications");
        
        // Contador de comunicaciones indirectas
        const indirectCount = controlsContainer.append("span")
            .attr("class", "text-sm text-gray-600");
        
        // Contenedor del gráfico
        const graphContainer = mainContainer.append("div")
            .attr("id", "temporal-graph-container")
            .style("width", "100%")
            .style("min-height", "500px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff");
        
        // Leyenda debajo del gráfico
        const legendContainer = mainContainer.append("div")
            .style("display", "flex")
            .style("justify-content", "center")
            .style("align-items", "center")
            .style("padding", "15px")
            .style("background", "#f8fafc")
            .style("border-radius", "8px")
            .style("border", "1px solid #e2e8f0");
        
        const legend = legendContainer.append("div")
            .style("display", "flex")
            .style("gap", "25px")
            .style("align-items", "center")
            .style("flex-wrap", "wrap")
            .style("justify-content", "center");
        
        // Elementos de leyenda
        const legendItems = [
            { type: "direct", color: "#4ecdc4", label: "Direct Communication", shape: "circle" },
            { type: "indirect", color: "#ff9f43", label: "Indirect Communication", shape: "circle" },
            { type: "pseudonym-single", color: "#f59e0b", label: "Single Pseudonym", shape: "star" },
            { type: "pseudonym-multiple", color: "#dc2626", label: "Multiple Pseudonyms", shape: "star" },
            { type: "line-direct", color: "#666", label: "Direct Timeline", shape: "line-solid" },
            { type: "line-indirect", color: "#ff9f43", label: "Indirect Timeline", shape: "line-dashed" }
        ];
        
        legendItems.forEach(item => {
            const legendItem = legend.append("div")
                .style("display", "flex")
                .style("align-items", "center")
                .style("gap", "8px");
            
            // Crear símbolo de leyenda
            const symbol = legendItem.append("svg")
                .attr("width", 20)
                .attr("height", 20);
            
            if (item.shape === "star") {
                const starPath = "M10,2 L12,8 L18,8 L13,12 L15,18 L10,14 L5,18 L7,12 L2,8 L8,8 Z";
                symbol.append("path")
                    .attr("d", starPath)
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1.5);
            } else if (item.shape === "line-solid") {
                symbol.append("line")
                    .attr("x1", 2)
                    .attr("y1", 10)
                    .attr("x2", 18)
                    .attr("y2", 10)
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2);
            } else if (item.shape === "line-dashed") {
                symbol.append("line")
                    .attr("x1", 2)
                    .attr("y1", 10)
                    .attr("x2", 18)
                    .attr("y2", 10)
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "3,3");
            } else {
                symbol.append("circle")
                    .attr("cx", 10)
                    .attr("cy", 10)
                    .attr("r", 8)
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1.5);
            }
            
            legendItem.append("span")
                .style("font-size", "14px")
                .style("color", "#374151")
                .style("font-weight", "500")
                .text(item.label);
        });
        
        // Contenedor de eventos de comunicación debajo del gráfico
        const eventsContainer = mainContainer.append("div")
            .attr("id", "network-events-container")
            .style("width", "100%")
            .style("max-height", "600px")
            .style("overflow-y", "auto")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("padding", "15px");
        
        eventsContainer.append("h3")
            .style("margin", "0 0 15px 0")
            .style("color", "#374151")
            .style("font-size", "16px")
            .style("font-weight", "600")
            .text("Communication Events");
        
        const eventsListContainer = eventsContainer.append("div")
            .style("max-height", "560px")
            .style("overflow-y", "auto")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "12px");
        
        // Crear el gráfico temporal
        createActualTemporalGraph(graphContainer, directCommunications, indirectCommunications, indirectCount, toggleButton, eventsListContainer);
    }
    
    function createActualTemporalGraph(container, directCommunications, indirectCommunications, indirectCount, toggleButton, eventsContainer) {
        // Configurar dimensiones del SVG de forma responsive
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        const margin = { top: 20, right: 50, bottom: 50, left: 150 };
        const width = Math.max(800, containerRect.width - margin.left - margin.right);
        
        // Calcular altura basada en el número de personas únicas
        const allCommunications = [...directCommunications, ...indirectCommunications];
        const uniquePersons = [...new Set(allCommunications.map(d => d.other_person))];
        const baseHeight = 300;
        const personHeight = 28; // Altura por persona (reducida de 40 a 28, 70% del original)
        const minHeight = 400;
        const maxHeight = 1200; // Aumentado para permitir el doble de altura
        let height = Math.max(minHeight, Math.min(maxHeight, baseHeight + (uniquePersons.length * personHeight)));
        
        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        // Tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
        
        // Combinar todas las comunicaciones
        const links = [...directCommunications, ...indirectCommunications];
        
        console.log(`📊 Rendering graph with ${directCommunications.length} direct and ${indirectCommunications.length} indirect communications`);
        
        if (links.length === 0) {
            container.append("div")
                .attr("class", "text-center text-gray-500 p-4")
                .text("No communications found for visualization");
            return;
        }
        
        // Crear mapeo de personas a posiciones Y (usando la variable ya definida)
        let personYScale = d3.scaleBand()
            .domain(uniquePersons)
            .range([height - 50, 50])
            .padding(0.2); // Reducido de 0.3 a 0.2 para menos espaciado
        
        // Asignar posición Y con offset para comunicaciones indirectas
        links.forEach(d => {
            const baseY = personYScale(d.other_person);
            const yOffset = d.connection_type === "indirect" ? 12 : 0;
            d.y_position = baseY + yOffset;
        });
        
        // Escalas temporales
        const xExtent = d3.extent(links, d => d.day);
        const timePadding = 1000 * 60 * 60 * 24; // 1 día de padding
        const paddedDomain = [
            new Date(xExtent[0].getTime() - timePadding),
            new Date(xExtent[1].getTime() + timePadding)
        ];
        
        const x = d3.scaleTime()
            .domain(paddedDomain)
            .range([0, width]);
        
        // Crear ejes
        g.append("g")
            .attr("class", "axis x")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(d3.timeDay.every(1)).tickFormat(d3.timeFormat("%b %d")));
        
        g.append("g")
            .attr("class", "axis y")
            .call(d3.axisLeft(d3.scaleLinear().range([height, 0]).domain([0, 1]))
                .tickFormat(() => "")
                .ticks(0));
        
        // Agregar líneas de grid para mejor visualización
        g.append("g")
            .attr("class", "grid-x")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x)
                .ticks(d3.timeDay.every(1))
                .tickSize(-height)
                .tickFormat("")
            )
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3);
        
        g.append("g")
            .attr("class", "grid-y")
            .call(d3.axisLeft(d3.scaleLinear().range([height, 0]).domain([0, 1]))
                .tickSize(-width)
                .tickFormat("")
                .ticks(0)
            )
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3);
        
        // Etiquetas de personas en eje Y
        uniquePersons.forEach(person => {
            const yPos = personYScale(person) + personYScale.bandwidth() / 2;
            g.append("text")
                .attr("class", "y-axis-label")
                .attr("data-person", person)
                .attr("x", -10)
                .attr("y", yPos)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", "10px")
                .attr("fill", "#333")
                .style("font-weight", "500")
                .text(person.length > 18 ? person.substring(0, 18) + "..." : person);
        });
        
        // Configurar contador y estado
        indirectCount.text(`(${indirectCommunications.length} indirect communications found)`);
        let showIndirect = true;
        
        console.log(`🎯 Graph setup: ${directCommunications.length} direct, ${indirectCommunications.length} indirect communications`);
        
        // Función para detectar palabras clave sospechosas
        function detectSuspiciousKeywords(content) {
            const suspicious_keywords = [
                "permit", "authorization", "clearance", "secret", "private", "special",
                "arrangement", "deal", "payment", "money", "cash", "funding",
                "restricted", "access", "corridor", "bypass", "loophole",
                "mining", "extraction", "drilling", "equipment", "operation",
                "illegal", "unauthorized", "bribe", "corruption", "under table",
                "approve", "approval", "license", "certificate", "official"
            ];
            
            if (!content) return [];
            
            const contentLower = content.toLowerCase();
            const foundKeywords = [];
            
            suspicious_keywords.forEach(keyword => {
                if (contentLower.includes(keyword)) {
                    foundKeywords.push(keyword);
                }
            });
            
            return foundKeywords;
        }
        
        function loadNetworkEvents(container, directComms, indirectComms, showIndirect) {
            // Combinar y ordenar todas las comunicaciones por fecha
            let allEvents = [...directComms];
            if (showIndirect) {
                allEvents = [...allEvents, ...indirectComms];
            }
            
            // Ordenar por fecha ascendente (más antiguos primero)
            allEvents.sort((a, b) => {
                if (!a.datetime && !b.datetime) return 0;
                if (!a.datetime) return 1;
                if (!b.datetime) return -1;
                return a.datetime - b.datetime;
            });
            
            // Limpiar contenedor
            container.selectAll("*").remove();
            
            if (allEvents.length === 0) {
                container.append("div")
                    .attr("class", "text-center text-gray-500 py-8")
                    .text("No communication events to display");
                return;
            }
            
            // Crear contenedor tipo chat con flexbox para alineación correcta
            const chatContainer = container.append("div")
                .style("display", "flex")
                .style("flex-direction", "column")
                .style("gap", "12px")
                .style("padding", "10px")
                .style("background", "#f9f9f9")
                .style("border-radius", "8px")
                .style("border", "1px solid #e5e7eb");
            
            // Crear lista de eventos con formato de chat bubbles estilo WhatsApp
            allEvents.forEach(event => { // Mostrar TODOS los eventos
                const isNadiaSender = event.source === "Nadia Conti";
                const messageClass = isNadiaSender ? "sent" : "received";
                
                // Detectar palabras clave para modificar el estilo del borde
                const hasSuspiciousKeywords = detectSuspiciousKeywords(event.content).length > 0;
                
                // Contenedor de mensaje con alineación correcta
                const messageWrapper = chatContainer.append("div")
                    .style("display", "flex")
                    .style("justify-content", isNadiaSender ? "flex-end" : "flex-start")
                    .style("margin-bottom", "8px");
                
                const bubble = messageWrapper.append("div")
                    .attr("class", `message ${messageClass}`)
                    .style("max-width", "70%")
                    .style("padding", "10px 14px")
                    .style("border-radius", isNadiaSender ? "18px 18px 4px 18px" : "18px 18px 18px 4px")
                    .style("border", () => {
                        // Prioridad: Keywords > Indirect > Pseudonym > Normal
                        if (hasSuspiciousKeywords) {
                            return "3px solid #dc2626"; // Borde rojo grueso para keywords
                        }
                        if (event.connection_type === "indirect") {
                            if (event.pseudonym_count >= 2) return "2px solid #dc2626";
                            if (event.has_any_pseudonym) return "2px solid #f59e0b";
                            return "2px solid #ff9f43";
                        }
                        return event.is_pseudonym ? "2px solid #ef4444" : "1px solid #e5e7eb";
                    })
                    .style("background-color", () => {
                        if (event.connection_type === "indirect") {
                            return "#fef3c7"; // Amarillo claro para indirectas
                        }
                        return isNadiaSender ? "#dcf8c6" : "#ffffff"; // Verde WhatsApp para enviados, blanco para recibidos
                    })
                    .style("box-shadow", "0 1px 2px rgba(0, 0, 0, 0.1)")
                    .style("cursor", "pointer");
                
                // Chat header simplificado
                const headerText = event.connection_type === "indirect" ?
                    `${event.other_person} → ${event.intermediary} → Nadia` :
                    (isNadiaSender ? `To: ${event.target}` : `From: ${event.source}`);
                
                bubble.append("div")
                    .attr("class", "chat-header")
                    .style("font-weight", "600")
                    .style("margin-bottom", "6px")
                    .style("font-size", "12px")
                    .style("color", "#374151")
                    .text(headerText);
                
                // Indicadores especiales más compactos
                if (event.connection_type === "indirect") {
                    bubble.append("div")
                        .style("font-size", "11px")
                        .style("color", "#d97706")
                        .style("font-weight", "600")
                        .style("margin-bottom", "4px")
                        .text(`🔗 INDIRECT ${event.has_any_pseudonym ? `⭐ ${event.pseudonym_count} Pseudonym(s)` : ''}`);
                } else if (event.is_pseudonym) {
                    bubble.append("div")
                        .style("font-size", "11px")
                        .style("color", "#dc2626")
                        .style("font-weight", "600")
                        .style("margin-bottom", "4px")
                        .text("⭐ PSEUDONYM");
                }
                
                // Content con formato especial para comunicaciones indirectas
                const contentDiv = bubble.append("div")
                    .attr("class", "content")
                    .style("margin-bottom", "6px")
                    .style("line-height", "1.4")
                    .style("color", "#1f2937")
                    .style("font-size", "14px");
                
                if (event.connection_type === "indirect" && event.content) {
                    // Formatear contenido de comunicación indirecta con estructura más clara
                    const lines = event.content.split('\\n');
                    lines.forEach((line, index) => {
                        if (index > 0) contentDiv.append("br");
                        
                        if (line.startsWith('1. ') || line.startsWith('2. ')) {
                            contentDiv.append("span")
                                .style("font-weight", "500")
                                .style("color", "#374151")
                                .text(line);
                        } else if (line.startsWith('Time gap:')) {
                            contentDiv.append("span")
                                .style("font-style", "italic")
                                .style("color", "#6b7280")
                                .style("font-size", "12px")
                                .text(line);
                        } else {
                            contentDiv.append("span").text(line);
                        }
                    });
                } else {
                    contentDiv.text(event.content || "No content available");
                }
                
                // Detectar y mostrar palabras clave sospechosas
                const suspiciousKeywords = detectSuspiciousKeywords(event.content);
                if (suspiciousKeywords.length > 0) {
                    const keywordsDiv = bubble.append("div")
                        .style("margin-top", "6px")
                        .style("margin-bottom", "6px");
                    
                    keywordsDiv.append("div")
                        .style("font-size", "10px")
                        .style("color", "#dc2626")
                        .style("font-weight", "600")
                        .style("margin-bottom", "3px")
                        .text("🚨 Suspicious Keywords:");
                    
                    const keywordContainer = keywordsDiv.append("div")
                        .style("display", "flex")
                        .style("flex-wrap", "wrap")
                        .style("gap", "3px");
                    
                    suspiciousKeywords.forEach(keyword => {
                        keywordContainer.append("span")
                            .style("background-color", "#fecaca")
                            .style("color", "#dc2626")
                            .style("padding", "2px 6px")
                            .style("border-radius", "10px")
                            .style("font-size", "10px")
                            .style("font-weight", "500")
                            .style("border", "1px solid #f87171")
                            .text(keyword);
                    });
                }
                
                // Timestamp en esquina
                bubble.append("div")
                    .attr("class", "timestamp")
                    .style("font-size", "11px")
                    .style("color", "#6b7280")
                    .style("text-align", "right")
                    .style("margin-top", "4px")
                    .text(event.datetime ? event.datetime.toLocaleString("en-GB", {
                        month: "short",
                        day: "numeric", 
                        hour: "2-digit",
                        minute: "2-digit"
                    }) : "Unknown date");
            });
            
            // Agregar contador de eventos
            chatContainer.append("div")
                .attr("class", "text-center text-sm text-gray-500 py-4")
                .style("border-top", "1px solid #e5e7eb")
                .style("margin-top", "12px")
                .style("padding-top", "12px")
                .text(`Total: ${allEvents.length} communication events`);
        }
        
        // Función para actualizar visualización
        function updateVisualization() {
            console.log(`🔄 Updating visualization: showIndirect=${showIndirect}`);
            
            // Limpiar elementos anteriores
            g.selectAll("path.direct-comm, path.indirect-comm, path.direct-connection-line, path.indirect-connection-line").remove();
            
            // Filtrar datos según estado del toggle
            const visibleDirects = directCommunications;
            const visibleIndirects = showIndirect ? indirectCommunications : [];
            const visibleLinks = [...visibleDirects, ...visibleIndirects];
            
            console.log(`📊 Visible communications: ${visibleDirects.length} direct, ${visibleIndirects.length} indirect`);
            
            // Determinar personas visibles y calcular nueva altura
            const visiblePersons = [...new Set(visibleLinks.map(d => d.other_person))];
            const currentHeight = showIndirect ? 
                Math.max(minHeight, Math.min(maxHeight, baseHeight + (uniquePersons.length * personHeight * 2))) : // Doble altura cuando se muestran indirectas
                Math.max(minHeight, Math.min(maxHeight, baseHeight + (visiblePersons.length * personHeight)));
            
            // Actualizar altura del SVG con animación suave
            if (currentHeight !== height) {
                height = currentHeight;
                svg.transition().duration(500)
                    .attr("height", height + margin.top + margin.bottom);
                
                // Actualizar eje X
                g.select(".axis.x")
                    .transition().duration(500)
                    .attr("transform", `translate(0,${height})`);
                
                // Actualizar eje Y para que tenga la altura correcta
                g.select(".axis.y")
                    .transition().duration(500)
                    .call(d3.axisLeft(d3.scaleLinear().range([height, 0]).domain([0, 1]))
                        .tickFormat(() => "")
                        .ticks(0));
                
                // Actualizar las líneas de grid
                g.select(".grid-x")
                    .transition().duration(500)
                    .attr("transform", `translate(0,${height})`)
                    .call(d3.axisBottom(x)
                        .ticks(d3.timeDay.every(1))
                        .tickSize(-height)
                        .tickFormat("")
                    );
                
                g.select(".grid-y")
                    .transition().duration(500)
                    .call(d3.axisLeft(d3.scaleLinear().range([height, 0]).domain([0, 1]))
                        .tickSize(-width)
                        .tickFormat("")
                        .ticks(0)
                    );
            }
            
            // Determinar escala Y según el estado
            let currentPersonYScale;
            if (showIndirect) {
                // Mostrar todas las personas con espaciado completo
                currentPersonYScale = d3.scaleBand()
                    .domain(uniquePersons)
                    .range([height - 50, 50])
                    .padding(0.2);
                
                // Mostrar todas las etiquetas Y
                g.selectAll("text.y-axis-label")
                    .style("display", "block")
                    .transition().duration(300)
                    .attr("y", function() {
                        const person = d3.select(this).attr("data-person");
                        return currentPersonYScale(person) + currentPersonYScale.bandwidth() / 2;
                    });
            } else {
                // Solo mostrar personas con comunicaciones directas
                const directPersons = [...new Set(visibleDirects.map(d => d.other_person))];
                currentPersonYScale = d3.scaleBand()
                    .domain(directPersons)
                    .range([height - 50, 50])
                    .padding(0.2);
                
                // Ocultar/mostrar etiquetas Y apropiadas
                g.selectAll("text.y-axis-label")
                    .style("display", function() {
                        const person = d3.select(this).attr("data-person");
                        return directPersons.includes(person) ? "block" : "none";
                    })
                    .transition().duration(300)
                    .attr("y", function() {
                        const person = d3.select(this).attr("data-person");
                        if (directPersons.includes(person)) {
                            return currentPersonYScale(person) + currentPersonYScale.bandwidth() / 2;
                        }
                        return d3.select(this).attr("y");
                    });
            }
            
            // Actualizar posiciones Y
            visibleLinks.forEach(d => {
                const baseY = currentPersonYScale(d.other_person);
                const yOffset = d.connection_type === "indirect" ? 12 : 0;
                d.y_position = baseY + yOffset;
            });
            
            // Actualizar personYScale global para uso en otras funciones
            personYScale = currentPersonYScale;
            
            // Dibujar líneas de conexión
            const directPersonDays = d3.group(visibleDirects, d => d.other_person);
            const indirectPersonDays = d3.group(visibleIndirects, d => d.other_person);
            
            // Líneas directas (sólidas)
            directPersonDays.forEach((personLinks, person) => {
                const sortedLinks = personLinks.sort((a, b) => a.datetime - b.datetime);
                if (sortedLinks.length > 1) {
                    const line = d3.line()
                        .x(d => x(d.day))
                        .y(d => d.y_position)
                        .curve(d3.curveLinear);
                    
                    g.append("path")
                        .datum(sortedLinks)
                        .attr("class", "direct-connection-line")
                        .attr("d", line)
                        .attr("stroke", "#666")
                        .attr("stroke-width", 1.5)
                        .attr("stroke-opacity", 0.7)
                        .attr("fill", "none");
                }
            });
            
            // Líneas indirectas (punteadas)
            indirectPersonDays.forEach((personLinks, person) => {
                const sortedLinks = personLinks.sort((a, b) => a.datetime - b.datetime);
                if (sortedLinks.length > 1) {
                    const line = d3.line()
                        .x(d => x(d.day))
                        .y(d => d.y_position)
                        .curve(d3.curveLinear);
                    
                    g.append("path")
                        .datum(sortedLinks)
                        .attr("class", "indirect-connection-line")
                        .attr("d", line)
                        .attr("stroke", "#ff9f43")
                        .attr("stroke-width", 2)
                        .attr("stroke-opacity", 0.8)
                        .attr("stroke-dasharray", "5,5")
                        .attr("fill", "none");
                }
            });
            
            // Símbolos para puntos
            const symbolGen = d3.symbol()
                .size(80)
                .type(d => d.is_pseudonym ? d3.symbolStar : d3.symbolCircle);
            
            // Puntos directos
            const directPts = g.selectAll("path.direct-comm").data(visibleDirects, d => d.event_id);
            directPts.join(
                enter => enter.append("path")
                    .attr("class", "direct-comm")
                    .attr("d", symbolGen)
                    .attr("transform", d => `translate(${x(d.day)},${d.y_position})`)
                    .attr("fill", d => d.is_pseudonym ? "#f59e0b" : "#4ecdc4")
                    .attr("stroke", "#333")
                    .attr("stroke-width", 2)
                    .on("mouseover", (event, d) => {
                        const direction = d.source === "Nadia Conti" ? 
                            `<span style="color: #059669;">Nadia → ${d.target}</span>` : 
                            `<span style="color: #dc2626;">${d.source} → Nadia</span>`;
                        
                        // Detectar palabras clave sospechosas
                        const suspiciousKeywords = detectSuspiciousKeywords(d.content);
                        const keywordsText = suspiciousKeywords.length > 0 ? 
                            `<br/>🚨 Keywords: <span style="color: #dc2626; font-weight: bold;">${suspiciousKeywords.join(", ")}</span>` : 
                            "";
                        
                        tooltip.style("opacity", 1)
                            .html(`<strong>${d.other_person}</strong><br/>
                                   ${d.datetime.toLocaleDateString()}<br/>
                                   ${d.datetime.toLocaleTimeString()}<br/>
                                   Communication: Direct<br/>
                                   Direction: ${direction}${keywordsText}`)
                            .style("left",  (event.pageX + 10) + "px")
                            .style("top",   (event.pageY - 10) + "px");
                    })
                    .on("mouseout", () => tooltip.style("opacity", 0)),
                update => update
                    .transition().duration(300)
                    .attr("transform", d => `translate(${x(d.day)},${d.y_position})`)
                    .attr("d", symbolGen),
                exit => exit.remove()
            );
            
            // Puntos indirectos
            const indirectPts = g.selectAll("path.indirect-comm").data(visibleIndirects, d => d.event_id);
            indirectPts.join(
                enter => enter.append("path")
                    .attr("class", "indirect-comm")
                    .attr("d", symbolGen)
                    .attr("transform", d => `translate(${x(d.day)},${d.y_position})`)
                    .attr("fill", d => {
                        if (d.pseudonym_count >= 2) return "#dc2626";
                        if (d.has_any_pseudonym) return "#f59e0b";
                        return "#ff9f43";
                    })
                    .attr("stroke", "#333")
                    .attr("stroke-width", 2)
                    .on("mouseover", (event, d) => {
                        // Detectar palabras clave sospechosas en comunicaciones indirectas
                        const suspiciousKeywords = detectSuspiciousKeywords(d.content);
                        const keywordsText = suspiciousKeywords.length > 0 ? 
                            `<br/>🚨 Keywords: <span style="color: #dc2626; font-weight: bold;">${suspiciousKeywords.join(", ")}</span>` : 
                            "";
                        
                        // Crear patrón con estrellas para pseudónimos
                        let patternWithStars = d.pattern_type;
                        
                        // Verificar y agregar estrellas a nombres con pseudónimos
                        if (d.first_link && d.first_link.is_pseudonym) {
                            const firstName = d.first_link.other_person;
                            patternWithStars = patternWithStars.replace(firstName, firstName + "⭐");
                        }
                        
                        if (d.second_link && d.second_link.is_pseudonym) {
                            const secondName = d.second_link.other_person;
                            if (!patternWithStars.includes(secondName + "⭐")) {
                                patternWithStars = patternWithStars.replace(secondName, secondName + "⭐");
                            }
                        }
                        
                        tooltip.style("opacity", 1)
                            .html(`<strong>${d.label}</strong><br/>
                                   ${d.datetime.toLocaleDateString()}<br/>
                                   ${d.datetime.toLocaleTimeString()}<br/>
                                   Communication: Indirect<br/>
                                   Pattern: ${patternWithStars}<br/>
                                   Gap: ${d.time_gap_hours.toFixed(1)}h${keywordsText}`)
                            .style("left",  (event.pageX + 10) + "px")
                            .style("top",   (event.pageY - 10) + "px");
                    })
                    .on("mouseout", () => tooltip.style("opacity", 0)),
                update => update
                    .transition().duration(300)
                    .attr("transform", d => `translate(${x(d.day)},${d.y_position})`)
                    .attr("d", symbolGen),
                exit => exit.remove()
            );
            
            // Actualizar eventos de comunicación
            loadNetworkEvents(eventsContainer, visibleDirects, visibleIndirects, showIndirect);
        }
        
        // Configurar botón toggle
        toggleButton.on("click", function() {
            console.log(`🔘 Toggle button clicked. Current state: showIndirect=${showIndirect}`);
            showIndirect = !showIndirect;
            console.log(`🔘 New state: showIndirect=${showIndirect}`);
            
            toggleButton.text(showIndirect ? "Hide Indirect Communications" : "Show Indirect Communications");
            toggleButton.attr("class", showIndirect ? 
                "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 mr-3" :
                "px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 mr-3"
            );
            
            console.log(`🔘 About to call updateVisualization with ${indirectCommunications.length} indirect communications available`);
            updateVisualization();
        });
        
        // Renderizado inicial
        updateVisualization();
    }
}

// Export the init function

// app/static/js/nadia_analysis.js - Final clean version for Network Analysis only
function init_nadia_analysis() {
    console.log("🚀 Initializing Nadia Conti analysis...");
    console.log("📱 Window size:", window.innerWidth, "x", window.innerHeight);
    
    let analysisData = null;
    
    // Load data from Flask endpoint
    d3.json("/data/nadia_analysis")
        .then(data => {
            if (data.error) {
                showError(data.error);
                return;
            }
            
            analysisData = data;
            window.currentAnalysisData = data; // Guardar globalmente para acceso a tipos de relación
            console.log("Nadia analysis data loaded:", data);
            
            // Initialize colors and then Network Analysis
            loadRelationshipColors().then(() => {
                updateNetworkTab(data);
            });
        })
        .catch(error => {
            console.error("Error loading Nadia analysis data:", error);
        });
    
    function showError(errorMessage) {
        d3.select("#network-graph").html(`
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 class="text-red-800 font-semibold">Error Loading Data</h3>
                <p class="text-red-600">${errorMessage}</p>
            </div>
        `);
    }
    
    function updateNetworkTab(data) {
        console.log("Updating network tab...");
        
        // Clear previous content
        d3.select("#network-graph").html("");
        d3.select("#contacts-list").html("");
        
        try {
            // Cargar datos desde el endpoint de Flask que automáticamente lee desde data/MC3_graph_communication.json
            console.log("🔄 Loading data from Flask endpoint...");
            d3.json("/data/nadia_analysis")
                .then(analysisData => {
                    console.log("✅ Loaded analysis data successfully");
                    
                    // El endpoint ya debería incluir graph_data
                    const graph = analysisData.graph_data || analysisData;
                    console.log("Graph structure:", {
                        nodes: graph.nodes?.length || 0,
                        links: graph.links?.length || 0
                    });
                    
                    // Procesar TODOS los links del grafo para encontrar patrones indirectos
                    const allProcessedLinks = graph.links.map(d => {
                        // Procesar fecha
                        d.datetime = d3.timeParse("%Y-%m-%d %H:%M:%S")(d.datetime);
                        d.day = d3.timeDay(d.datetime);
                        d.hour = d.datetime.getHours();
                        
                        // Determinar otra persona en la comunicación
                        d.other_person = d.source === "Nadia Conti" ? d.target : d.source;
                        
                        // Encontrar información del nodo
                        const otherNode = graph.nodes.find(n => n.id === d.other_person) || {};
                        d.is_pseudonym = !!otherNode.is_pseudonym;
                        
                        // Marcar tipo de conexión
                        d.connection_type = (d.source === "Nadia Conti" || d.target === "Nadia Conti") ? "direct" : "indirect";
                        
                        return d;
                    });
                    
                    // Filtrar solo las comunicaciones directas de Nadia para la visualización inicial
                    const nadiaDirectLinks = allProcessedLinks.filter(d => 
                        d.source === "Nadia Conti" || d.target === "Nadia Conti"
                    );
                    
                    console.log(`Found ${nadiaDirectLinks.length} direct communications for Nadia`);
                    console.log(`Processing ${allProcessedLinks.length} total communications for indirect patterns`);
                    
                    // Encontrar patrones de comunicación indirecta usando TODOS los links
                    const indirectPatterns = findIntermediaryPatterns(allProcessedLinks, graph.nodes);
                    console.log(`Found ${indirectPatterns.length} indirect communication patterns`);
                    
                    // Crear visualización temporal
                    createTemporalNetworkVisualization(nadiaDirectLinks, indirectPatterns);
                })
                .catch(err => console.error("❌ Failed to load graph JSON:", err));
        } catch (error) {
            console.error("Error in updateNetworkTab:", error);
            d3.select("#network-graph").html('<p class="text-red-500">Error loading network analysis</p>');
        }
    }
    
    function findIntermediaryPatterns(allLinks, nodes, timeWindowHours = 24) {
        const indirectPatterns = [];
        const timeWindow = timeWindowHours * 60 * 60 * 1000; // Convertir a milisegundos
        
        // Buscar personas que se comunican con Nadia
        const nadiaContacts = new Set();
        allLinks.forEach(link => {
            if (link.source === "Nadia Conti") {
                nadiaContacts.add(link.target);
            } else if (link.target === "Nadia Conti") {
                nadiaContacts.add(link.source);
            }
        });
        
        console.log(`Analyzing ${allLinks.length} total links for indirect patterns`);
        console.log(`Nadia has direct contacts with: ${Array.from(nadiaContacts)}`);
        
        // Buscar patrones A → B → Nadia y Nadia → B → A
        allLinks.forEach(firstLink => {
            // Solo analizar links que no involucren directamente a Nadia
            if (firstLink.source === "Nadia Conti" || firstLink.target === "Nadia Conti") {
                return;
            }
            
            const intermediary = firstLink.target;
            const originPerson = firstLink.source;
            
            // Verificar si el intermediario se comunica con Nadia
            if (!nadiaContacts.has(intermediary)) {
                return;
            }
            
            // Buscar comunicaciones entre el intermediario y Nadia dentro de la ventana de tiempo
            allLinks.forEach(secondLink => {
                if ((secondLink.source === intermediary && secondLink.target === "Nadia Conti") ||
                    (secondLink.target === intermediary && secondLink.source === "Nadia Conti")) {
                    
                    // Verificar que ambas fechas sean válidas
                    if (!firstLink.datetime || !secondLink.datetime) {
                        return;
                    }
                    
                    const timeDiff = Math.abs(secondLink.datetime - firstLink.datetime);
                    
                    if (timeDiff <= timeWindow) {
                        // Verificar si alguno de los 3 participantes es pseudónimo
                        const originNode = nodes.find(n => n.id === originPerson);
                        const intermediaryNode = nodes.find(n => n.id === intermediary);
                        const nadiaNode = nodes.find(n => n.id === "Nadia Conti");
                        
                        const hasPseudonym = (originNode && originNode.is_pseudonym) || 
                                           (intermediaryNode && intermediaryNode.is_pseudonym) ||
                                           (nadiaNode && nadiaNode.is_pseudonym);
                        
                        // Encontrado patrón indirecto
                        const pattern = {
                            event_id: `indirect_${firstLink.event_id}_${secondLink.event_id}`,
                            datetime: firstLink.datetime,
                            day: firstLink.day,
                            hour: firstLink.hour,
                            other_person: originPerson,
                            intermediary: intermediary,
                            content: `${firstLink.content} [via ${intermediary}]`,
                            connection_type: "indirect",
                            pattern_type: `${originPerson} → ${intermediary} → Nadia Conti`,
                            time_difference_hours: timeDiff / (60 * 60 * 1000),
                            is_pseudonym: hasPseudonym, // Agregar flag de pseudónimo
                            pseudonym_details: {
                                origin_is_pseudonym: originNode ? originNode.is_pseudonym : false,
                                intermediary_is_pseudonym: intermediaryNode ? intermediaryNode.is_pseudonym : false,
                                nadia_is_pseudonym: nadiaNode ? nadiaNode.is_pseudonym : false
                            }
                        };
                        
                        indirectPatterns.push(pattern);
                    }
                }
            });
        });
        
        // Remove duplicates based on pattern_type and similar timing
        const uniquePatterns = [];
        indirectPatterns.forEach(pattern => {
            const isDuplicate = uniquePatterns.some(existing => 
                existing.pattern_type === pattern.pattern_type &&
                Math.abs(existing.datetime - pattern.datetime) < 60000 // Less than 1 minute
            );
            if (!isDuplicate) {
                uniquePatterns.push(pattern);
            }
        });
        
        console.log(`Found ${uniquePatterns.length} unique indirect patterns`);
        return uniquePatterns;
    }
    
    function createTemporalNetworkVisualization(directCommunications, indirectCommunications) {
        console.log("Creating temporal network visualization...");
        
        // Get the network graph container
        const networkContainer = d3.select("#network-graph");
        
        // Clear previous content
        networkContainer.html("");
        
        // Create main container
        const mainContainer = networkContainer.append("div")
            .style("width", "100%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "20px");
        
        // Primer gráfico temporal (Analysis of Nadia Conti) - arriba
        const firstGraphContainer = mainContainer.append("div")
            .style("width", "100%")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("padding", "20px");
        
        firstGraphContainer.append("h3")
            .style("margin", "0 0 20px 0")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Analysis of Nadia Conti");
        
        // Create layout container for bottom section
        const dualContainer = mainContainer.append("div")
            .style("display", "flex")
            .style("gap", "20px")
            .style("width", "100%")
            .style("align-items", "flex-start");
        
        // Columna izquierda para ego network y wordcloud (55% del ancho)
        const leftColumn = dualContainer.append("div")
            .style("width", "55%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "20px")
            .style("height", "100%");
        
        // Red egocéntrica en la parte superior de la columna izquierda
        const egoNetworkContainer = leftColumn.append("div")
            .style("width", "100%")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("padding", "20px")
            .style("display", "flex")
            .style("flex-direction", "column");
        
        egoNetworkContainer.append("h3")
            .style("margin", "0 0 20px 0")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Nadia Conti - Ego Network");
        
        // Columna derecha para timeline y análisis (45% del ancho)
        const rightColumn = dualContainer.append("div")
            .style("width", "45%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "20px")
            .style("height", "100%");

        // Nube de palabras en la parte inferior de la columna izquierda
        const wordCloudContainer = leftColumn.append("div")
            .attr("id", "word-cloud-container")
            .style("width", "100%")
            .style("flex", "1") // Usar flex para ocupar espacio restante
            .style("min-height", "400px") // Altura mínima para asegurar contenido visible
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("display", "flex")
            .style("flex-direction", "column");

        wordCloudContainer.append("h3")
            .style("margin", "10px 0 15px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .style("flex-shrink", "0")
            .text("Corruption Keywords Cloud");

        // Gráfico de series temporales de corruption events en la parte superior de la columna derecha
        const timeSeriesContainer = rightColumn.append("div")
            .attr("id", "time-series-container")
            .style("width", "100%")
            .style("height", "630px") // Reducido 10% de 700px
            .style("max-height", "630px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("overflow", "visible"); // Cambiar a visible

        timeSeriesContainer.append("h3")
            .style("margin", "15px 0 10px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .style("flex-shrink", "0")
            .text("Corruption Events Timeline");

        // Contenedor de análisis en la parte inferior de la columna derecha
        const analysisContainer = rightColumn.append("div")
            .attr("id", "analysis-container")
            .style("width", "100%")
            .style("flex", "1")
            .style("min-height", "400px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("overflow-y", "auto");

        analysisContainer.append("h3")
            .style("margin", "10px 0 15px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .style("flex-shrink", "0")
            .text("Analysis: Nadia Conti");

        // Guardar comunicaciones globalmente para acceso desde wordcloud y análisis
        window.directCommunications = directCommunications;
        window.indirectCommunications = indirectCommunications;
        
        console.log('🌐 Global communications saved:', {
            directCount: directCommunications.length,
            indirectCount: indirectCommunications.length
        });
        
        // Crear el primer gráfico temporal
        createFirstTemporalGraph(firstGraphContainer, directCommunications, indirectCommunications);
        
        createEgocentricNetwork(egoNetworkContainer, directCommunications, indirectCommunications, wordCloudContainer, timeSeriesContainer, analysisContainer);
        createWordCloud(wordCloudContainer, directCommunications, indirectCommunications);
        createTimeSeriesChart(timeSeriesContainer, directCommunications, indirectCommunications, null);
        
        // Función para ajustar alturas igual después de que se cargue el contenido
        function adjustEqualHeights() {
            // Esperar un poco para que el contenido se renderice
            setTimeout(() => {
                try {
                    const leftColumnHeight = leftColumn.node().offsetHeight;
                    const rightColumnHeight = rightColumn.node().offsetHeight;
                    
                    // Calcular la altura total necesaria (la mayor de las dos columnas)
                    const targetHeight = Math.max(leftColumnHeight, rightColumnHeight, 900); // mínimo 900px para el nuevo layout
                    
                    // Ajustar ambas columnas para que tengan la misma altura
                    leftColumn.style("height", targetHeight + "px");
                    rightColumn.style("height", targetHeight + "px");
                    
                    // El timeline ya tiene altura fija establecida en createTimeSeriesChart
                    // Las alturas de wordcloud y analysisContainer se ajustan automáticamente con flexbox
                    
                    console.log(`📐 Adjusted heights: Target=${targetHeight}px, Left=${leftColumnHeight}px, Right=${rightColumnHeight}px`);
                } catch (error) {
                    console.error("Error adjusting heights:", error);
                }
            }, 500);
        }
        
        // Llamar a la función de ajuste
        adjustEqualHeights();
        
        // También ajustar en resize
        window.addEventListener('resize', adjustEqualHeights);
    }
    
    function createFirstTemporalGraph(container, directCommunications, indirectCommunications) {
        console.log("📊 Creating first temporal graph...");
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Configurar dimensiones del SVG de forma responsive
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        
        // Ajustar márgenes según el tamaño de pantalla de forma más responsiva
        const margin = {
            top: isSmallScreen ? 40 : 50,
            right: isSmallScreen ? 15 : isMediumScreen ? 30 : 50,
            bottom: isSmallScreen ? 80 : isMediumScreen ? 100 : 120,
            left: isSmallScreen ? 60 : isMediumScreen ? 100 : 150
        };
        
        // Hacer el ancho completamente responsivo
        const availableWidth = containerRect.width || window.innerWidth * 0.9;
        const width = Math.max(250, availableWidth - margin.left - margin.right);
        
        // Calcular altura basada en el número de personas únicas y tamaño de pantalla
        const allCommunications = [...directCommunications, ...indirectCommunications];
        const uniquePersons = [...new Set(allCommunications.map(d => d.other_person))];
        
        const baseHeight = isSmallScreen ? 150 : isMediumScreen ? 200 : 300;
        const personHeight = isSmallScreen ? 18 : isMediumScreen ? 22 : 28;
        const minHeight = isSmallScreen ? 250 : isMediumScreen ? 350 : 400;
        const maxHeight = isSmallScreen ? 600 : isMediumScreen ? 800 : 1200;
        let height = Math.max(minHeight, Math.min(maxHeight, baseHeight + (uniquePersons.length * personHeight)));
        
        // Variable para controlar visibilidad de comunicaciones indirectas
        let showIndirect = true;
        
        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        // Tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
        
        // Botón para mostrar/ocultar comunicaciones indirectas (responsivo)
        const toggleButton = svg.append("g")
            .attr("class", "toggle-button")
            .attr("transform", `translate(${margin.left + 10}, ${margin.top - 30})`);
        
        const buttonWidth = isSmallScreen ? 120 : 160;
        const buttonHeight = isSmallScreen ? 20 : 25;
        const buttonFontSize = isSmallScreen ? "10px" : "12px";
        
        const buttonRect = toggleButton.append("rect")
            .attr("width", buttonWidth)
            .attr("height", buttonHeight)
            .attr("rx", 5)
            .attr("fill", "#4ecdc4")
            .attr("stroke", "#333")
            .attr("stroke-width", 1)
            .style("cursor", "pointer");
        
        const buttonText = toggleButton.append("text")
            .attr("x", buttonWidth / 2)
            .attr("y", buttonHeight / 2 + 4)
            .attr("text-anchor", "middle")
            .attr("font-size", buttonFontSize)
            .attr("fill", "white")
            .style("font-weight", "bold")
            .style("cursor", "pointer")
            .text("Hide Indirect");
        
        // Combinar todas las comunicaciones
        const links = [...directCommunications, ...indirectCommunications];
        
        console.log(`📊 Rendering graph with ${directCommunications.length} direct and ${indirectCommunications.length} indirect communications`);
        
        if (links.length === 0) {
            container.append("div")
                .attr("class", "text-center text-gray-500 p-4")
                .text("No communications found for visualization");
            return;
        }
        
        // Crear mapeo de personas a posiciones Y
        let personYScale = d3.scaleBand()
            .domain(uniquePersons)
            .range([height - 50, 50])
            .padding(0.2);
        
        // Función para actualizar la escala Y basada en personas visibles
        function updateYScale() {
            const visiblePersons = uniquePersons.filter(person => {
                if (showIndirect) {
                    return true; // Mostrar todas las personas
                } else {
                    // Determinar si la persona tiene comunicaciones directas
                    const hasDirectCommunications = links.some(d => 
                        d.other_person === person && d.connection_type === "direct"
                    );
                    return hasDirectCommunications;
                }
            });
            
            personYScale = d3.scaleBand()
                .domain(visiblePersons)
                .range([height - 50, 50])
                .padding(0.2);
            
            return visiblePersons;
        }
        
        // Asignar posición Y con offset para comunicaciones indirectas y evitar superposición
        const positionMap = new Map();
        links.forEach(d => {
            const baseY = personYScale(d.other_person) + personYScale.bandwidth() / 2;
            const dateKey = d.day.getTime();
            const personKey = d.other_person;
            const mapKey = `${personKey}_${dateKey}`;
            
            if (!positionMap.has(mapKey)) {
                positionMap.set(mapKey, []);
            }
            
            const existingPoints = positionMap.get(mapKey);
            let xOffset = 0;
            
            // Calcular offset horizontal basado en el número de puntos existentes
            if (existingPoints.length > 0) {
                xOffset = existingPoints.length * 8; // 8px de separación horizontal
            }
            
            d.y_position = baseY;
            d.x_offset = xOffset;
            
            existingPoints.push(d);
        });
        
        // Escalas temporales
        const xExtent = d3.extent(links, d => d.day);
        const timePadding = 1000 * 60 * 60 * 24; // 1 día de padding
        const paddedDomain = [
            new Date(xExtent[0].getTime() - timePadding),
            new Date(xExtent[1].getTime() + timePadding)
        ];
        
        const x = d3.scaleTime()
            .domain(paddedDomain)
            .range([0, width]);
        
        // Crear ejes de forma responsiva
        const xAxisTickFormat = isSmallScreen ? d3.timeFormat("%m/%d") : d3.timeFormat("%b %d");
        const xAxisTicks = isSmallScreen ? d3.timeDay.every(2) : d3.timeDay.every(1);
        
        g.append("g")
            .attr("class", "axis x")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(xAxisTicks).tickFormat(xAxisTickFormat))
            .selectAll("text")
            .style("font-size", isSmallScreen ? "10px" : isMediumScreen ? "12px" : "14px")
            .style("transform", isSmallScreen ? "rotate(-45deg)" : "none")
            .style("text-anchor", isSmallScreen ? "end" : "middle");
        
        g.append("g")
            .attr("class", "axis y")
            .call(d3.axisLeft(d3.scaleLinear().range([height, 0]).domain([0, 1]))
                .tickFormat(() => "")
                .ticks(0));
        
        // Agregar líneas de grid para mejor visualización (responsivo)
        g.append("g")
            .attr("class", "grid-x")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x)
                .ticks(xAxisTicks)
                .tickSize(-height)
                .tickFormat("")
            )
            .style("stroke-dasharray", "3,3")
            .style("opacity", isSmallScreen ? 0.2 : 0.3);
        
        // Etiquetas de personas en eje Y
        const personLabels = g.selectAll(".y-axis-label")
            .data(uniquePersons)
            .enter()
            .append("text")
            .attr("class", "y-axis-label")
            .attr("data-person", d => d)
            .attr("x", -10)
            .attr("y", d => personYScale(d) + personYScale.bandwidth() / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "end")
            .attr("font-size", isSmallScreen ? "10px" : isMediumScreen ? "12px" : "15px")
            .attr("fill", "#333")
            .style("font-weight", "500")
            .text(d => {
                const maxLength = isSmallScreen ? 10 : isMediumScreen ? 14 : 18;
                return d.length > maxLength ? d.substring(0, maxLength) + "..." : d;
            });
        
        // Función para detectar palabras clave sospechosas
        function detectSuspiciousKeywords(content) {
            // Obtener todas las palabras clave del diccionario corruption_events
            const corruption_events = {
                "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
                "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
                "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
                "special access": ["acces", "special", "secured", "corridor", "entrance"],
                "use of intermediaries": ["middleman"],
                "confidentiality abuse": ["confidentiality", "encrypted"],
                "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
                "unauthorized access": ["unauthorized"],
                "favoritism": ["favor"],
                "money laundering": ["funding"]
            };
            
            // Extraer todas las palabras clave
            const allKeywords = Object.values(corruption_events).flat();
            
            const foundKeywords = [];
            const contentLower = content.toLowerCase();
            
            allKeywords.forEach(keyword => {
                if (contentLower.includes(keyword.toLowerCase())) {
                    foundKeywords.push(keyword);
                }
            });
            
            return foundKeywords;
        }
        
        // Función para detectar corruption events
        function detectCorruptionEvents(content) {
            const corruption_events = {
                "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
                "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
                "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
                "special access": ["acces", "special", "secured", "corridor", "entrance"],
                "use of intermediaries": ["middleman"],
                "confidentiality abuse": ["confidentiality", "encrypted"],
                "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
                "unauthorized access": ["unauthorized"],
                "favoritism": ["favor"],
                "money laundering": ["funding"]
            };
            
            const foundEvents = [];
            const contentLower = content.toLowerCase();
            
            Object.entries(corruption_events).forEach(([eventType, keywords]) => {
                keywords.forEach(keyword => {
                    if (contentLower.includes(keyword.toLowerCase())) {
                        if (!foundEvents.includes(eventType)) {
                            foundEvents.push(eventType);
                        }
                    }
                });
            });
            
            return foundEvents;
        }
        
        // Función para crear forma de estrella
        function createStarPath(cx, cy, outerRadius, innerRadius, numPoints) {
            const angle = Math.PI / numPoints;
            let path = "";
            
            for (let i = 0; i < 2 * numPoints; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const x = cx + radius * Math.cos(i * angle - Math.PI / 2);
                const y = cy + radius * Math.sin(i * angle - Math.PI / 2);
                
                if (i === 0) {
                    path += `M ${x},${y}`;
                } else {
                    path += ` L ${x},${y}`;
                }
            }
            path += " Z";
            return path;
        }
        
        // Crear puntos para cada comunicación
        const pointsGroup = g.selectAll(".communication-point")
            .data(links)
            .enter().append("g")
            .attr("class", d => `communication-point ${d.connection_type}`)
            .attr("transform", d => `translate(${x(d.day) + d.x_offset}, ${d.y_position})`)
            .style("cursor", "pointer")
            .style("opacity", d => d.connection_type === "indirect" && !showIndirect ? 0 : 1);
        
        // Agregar formas (círculos o estrellas)
        pointsGroup.each(function(d) {
            const group = d3.select(this);
            
            // Determinar si es pseudónimo: usar el flag is_pseudonym del nodo, 
            // o si es un mensaje indirecto que involucra pseudónimos
            const isPseudonym = d.is_pseudonym || (d.connection_type === "indirect" && d.is_pseudonym);
            
            if (isPseudonym) {
                // Crear estrella para pseudónimos (20% más grande)
                group.append("path")
                    .attr("d", createStarPath(0, 0, 7.2, 3.6, 5))
                    .attr("fill", d => {
                        if (d.connection_type === "direct") return "#4ecdc4";
                        if (d.connection_type === "indirect") return "#ff9f43";
                        return "#ccc";
                    })
                    .attr("stroke", d => d.connection_type === "indirect" ? "#e67e22" : "#333")
                    .attr("stroke-width", d => d.connection_type === "indirect" ? 2 : 1);
            } else {
                // Crear círculo para personas normales (20% más grande)
                group.append("circle")
                    .attr("r", 4.8)
                    .attr("fill", d => {
                        if (d.connection_type === "direct") return "#4ecdc4";
                        if (d.connection_type === "indirect") return "#ff9f43";
                        return "#ccc";
                    })
                    .attr("stroke", d => d.connection_type === "indirect" ? "#e67e22" : "#333")
                    .attr("stroke-width", d => d.connection_type === "indirect" ? 2 : 1);
            }
        });
        
        // Agregar eventos de hover
        pointsGroup.on("mouseover", function(event, d) {
            // No mostrar tooltip si es mensaje indirecto y están ocultos
            if (d.connection_type === "indirect" && !showIndirect) {
                return;
            }
            
            const suspiciousKeywords = detectSuspiciousKeywords(d.content);
            const corruptionEvents = detectCorruptionEvents(d.content);
            
            // Determinar si es pseudónimo: usar el flag is_pseudonym del nodo, 
            // o si es un mensaje indirecto que involucra pseudónimos
            const isPseudonym = d.is_pseudonym || (d.connection_type === "indirect" && d.is_pseudonym);
            
            let tooltipContent = `<strong>${d.other_person}</strong><br/>
                                 Date: ${d3.timeFormat("%Y-%m-%d")(d.day)}<br/>
                                 Type: ${d.connection_type === "indirect" ? "Indirect Communication" : "Direct Communication"}<br/>
                                 ${isPseudonym ? "<strong>Pseudonym:</strong> Yes<br/>" : ""}`;
            
            // Mostrar información de triangulación para mensajes indirectos
            if (d.connection_type === "indirect" && d.pattern_type) {
                tooltipContent += `<br/><strong style="color: #ff9f43;">Triangulation:</strong> ${d.pattern_type}`;
                
                // Mostrar detalles de pseudónimos para mensajes indirectos
                if (d.pseudonym_details) {
                    const pseudonymNames = [];
                    if (d.pseudonym_details.origin_is_pseudonym) pseudonymNames.push(d.other_person);
                    if (d.pseudonym_details.intermediary_is_pseudonym) pseudonymNames.push(d.intermediary);
                    if (d.pseudonym_details.nadia_is_pseudonym) pseudonymNames.push("Nadia Conti");
                    
                    if (pseudonymNames.length > 0) {
                        tooltipContent += `<br/><strong style="color: #dc2626;">Pseudonym participants:</strong> ${pseudonymNames.join(", ")}`;
                    }
                }
            }
            
            if (suspiciousKeywords.length > 0) {
                tooltipContent += `<br/><strong style="color: #dc2626;">Keywords:</strong> ${suspiciousKeywords.join(", ")}`;
            }
            
            if (corruptionEvents.length > 0) {
                tooltipContent += `<br/><strong style="color: #dc2626;">Corruption Events:</strong><br/>&nbsp;&nbsp;&nbsp;&nbsp;${corruptionEvents.join(",<br/>&nbsp;&nbsp;&nbsp;&nbsp;")}`;
            }
            
            tooltip.style("opacity", 1)
                .html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
            
            // Escalar el elemento (20% más grande que antes)
            d3.select(this).select("circle").attr("r", 7.2);
            d3.select(this).select("path").attr("transform", "scale(1.5)");
        })
        .on("mouseout", function(event, d) {
            // No procesar mouseout si es mensaje indirecto y están ocultos
            if (d.connection_type === "indirect" && !showIndirect) {
                return;
            }
            
            tooltip.style("opacity", 0);
            d3.select(this).select("circle").attr("r", 4.8);
            d3.select(this).select("path").attr("transform", "scale(1)");
        });
        
        // Función para toggle de comunicaciones indirectas
        function toggleIndirectCommunications() {
            showIndirect = !showIndirect;
            
            // Actualizar visibilidad de los puntos
            pointsGroup.style("opacity", d => d.connection_type === "indirect" && !showIndirect ? 0 : 1);
            
            // Actualizar la escala Y y obtener personas visibles
            const visiblePersons = updateYScale();
            
            // Recalcular posiciones Y para todos los puntos
            const newPositionMap = new Map();
            links.forEach(d => {
                if (visiblePersons.includes(d.other_person)) {
                    const baseY = personYScale(d.other_person) + personYScale.bandwidth() / 2;
                    const dateKey = d.day.getTime();
                    const personKey = d.other_person;
                    const mapKey = `${personKey}_${dateKey}`;
                    
                    if (!newPositionMap.has(mapKey)) {
                        newPositionMap.set(mapKey, []);
                    }
                    
                    const existingPoints = newPositionMap.get(mapKey);
                    let xOffset = 0;
                    
                    if (existingPoints.length > 0) {
                        xOffset = existingPoints.length * 8;
                    }
                    
                    d.new_y_position = baseY;
                    d.new_x_offset = xOffset;
                    
                    existingPoints.push(d);
                }
            });
            
            // Animar los puntos a sus nuevas posiciones
            pointsGroup.transition()
                .duration(300)
                .attr("transform", d => {
                    if (visiblePersons.includes(d.other_person)) {
                        return `translate(${x(d.day) + (d.new_x_offset || d.x_offset)}, ${d.new_y_position || d.y_position})`;
                    } else {
                        return `translate(${x(d.day) + d.x_offset}, ${d.y_position})`;
                    }
                });
            
            // Actualizar posiciones permanentemente
            links.forEach(d => {
                if (d.new_y_position !== undefined) {
                    d.y_position = d.new_y_position;
                    d.x_offset = d.new_x_offset;
                }
            });
            
            // Actualizar etiquetas de personas
            personLabels.transition()
                .duration(300)
                .style("opacity", d => visiblePersons.includes(d) ? 1 : 0)
                .attr("y", d => visiblePersons.includes(d) ? personYScale(d) + personYScale.bandwidth() / 2 : 0);
            
            // Actualizar texto del botón
            buttonText.text(showIndirect ? "Hide Indirect" : "Show Indirect");
            
            // Actualizar color del botón
            buttonRect.attr("fill", showIndirect ? "#4ecdc4" : "#e74c3c");
        }
        
        // Agregar click event al botón
        toggleButton.on("click", toggleIndirectCommunications);
        
        // Crear leyenda en la parte inferior con más espacio
        const legendSpacing = isSmallScreen ? 60 : 80; // Más espacio del eje X
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${margin.left}, ${height + margin.top + legendSpacing})`);
        
        const legendItems = [
            { color: "#4ecdc4", label: "Direct Communication", shape: "circle" },
            { color: "#ff9f43", label: "Indirect Communication", stroke: "#e67e22", shape: "circle" },
            { color: "transparent", label: "Pseudonym", shape: "star" }
        ];
        
        // Calcular espaciado horizontal para centrar la leyenda
        const itemSpacing = width / legendItems.length;
        const legendFontSize = isSmallScreen ? "12px" : "14px";
        
        legendItems.forEach((item, i) => {
            const legendItem = legend.append("g")
                .attr("transform", `translate(${i * itemSpacing + itemSpacing/2}, 0)`);
            
            if (item.shape === "star") {
                // Crear estrella en la leyenda (20% más grande)
                legendItem.append("path")
                    .attr("d", createStarPath(-50, 0, 7.2, 3.6, 5))
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1);
            } else {
                // Crear círculo en la leyenda (20% más grande)
                legendItem.append("circle")
                    .attr("cx", -50)
                    .attr("cy", 0)
                    .attr("r", 7.2)
                    .attr("fill", item.color)
                    .attr("stroke", item.stroke || "#333")
                    .attr("stroke-width", item.stroke ? 2 : 1);
            }
            
            legendItem.append("text")
                .attr("x", -35)
                .attr("y", 0)
                .attr("dy", "0.35em")
                .style("font-size", legendFontSize)
                .style("fill", "#333")
                .style("text-anchor", "start")
                .text(item.label);
        });
        
        console.log("📊 First temporal graph created successfully");
    }
    
    function createEgocentricNetwork(container, directCommunications, indirectCommunications, wordCloudContainer, timeSeriesContainer, analysisContainer) {
        console.log("🕸️ Creating egocentric network...");
        
        // Definir corruption events para el análisis
        const corruption_events = {
            "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
            "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
            "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
            "special access": ["acces", "special", "secured", "corridor", "entrance"],
            "use of intermediaries": ["middleman"],
            "confidentiality abuse": ["confidentiality", "encrypted"],
            "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
            "unauthorized access": ["unauthorized"],
            "favoritism": ["favor"],
            "money laundering": ["funding"]
        };
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Configurar dimensiones
        const margin = { top: 20, right: 20, bottom: 60, left: 20 };
        const width = isSmallScreen ? 450 : isMediumScreen ? 550 : 650;
        const height = isSmallScreen ? 450 : isMediumScreen ? 550 : 650;
        
        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left + width/2},${margin.top + height/2})`);
        
        // Preparar datos para la red egocéntrica
        const allCommunications = [...directCommunications, ...indirectCommunications];
        
        // Crear nodos únicos
        const nodes = [];
        const nodeSet = new Set();
        
        // Agregar Nadia Conti como nodo central
        nodes.push({
            id: "Nadia Conti",
            name: "Nadia Conti",
            type: "ego",
            communication_count: allCommunications.length,
            x: 0,
            y: 0
        });
        nodeSet.add("Nadia Conti");
        
        // Agregar otros nodos basados en comunicaciones
        allCommunications.forEach(comm => {
            if (!nodeSet.has(comm.other_person)) {
                const commCount = allCommunications.filter(c => c.other_person === comm.other_person).length;
                const isIndirect = comm.connection_type === "indirect";
                
                nodes.push({
                    id: comm.other_person,
                    name: comm.other_person,
                    type: isIndirect ? "indirect" : "direct",
                    communication_count: commCount,
                    is_pseudonym: comm.is_pseudonym
                });
                nodeSet.add(comm.other_person);
            }
        });
        
        // Posicionar nodos en círculo
        const radius = Math.min(width, height) / 2 - 80;
        const otherNodes = nodes.filter(n => n.id !== "Nadia Conti");
        
        otherNodes.forEach((node, i) => {
            const angle = (i * 2 * Math.PI) / otherNodes.length;
            node.x = Math.cos(angle) * radius;
            node.y = Math.sin(angle) * radius;
        });
        
        // Escalas
        const nodeRadiusScale = d3.scaleLinear()
            .domain([1, d3.max(nodes, d => d.communication_count) || 1])
            .range([8, 20]);
        
        // Crear grupos de nodos
        const nodeGroups = g.selectAll(".node-group")
            .data(nodes)
            .enter().append("g")
            .attr("class", "node-group")
            .attr("transform", d => `translate(${d.x},${d.y})`);
        
        // Función para crear estrella (igual que en el primer gráfico)
        function createStarPath(cx, cy, outerRadius, innerRadius, numPoints) {
            const angle = Math.PI / numPoints;
            let path = "";
            
            for (let i = 0; i < 2 * numPoints; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const x = cx + radius * Math.cos(i * angle - Math.PI / 2);
                const y = cy + radius * Math.sin(i * angle - Math.PI / 2);
                
                if (i === 0) {
                    path += `M ${x},${y}`;
                } else {
                    path += ` L ${x},${y}`;
                }
            }
            path += " Z";
            return path;
        }

        // Crear nodos
        nodeGroups.each(function(d) {
            const group = d3.select(this);
            
            // Determinar si es pseudónimo: usar el flag is_pseudonym del nodo
            const isPseudonym = d.is_pseudonym;
            
            if (isPseudonym && d.type !== "ego") {
                // Crear estrella para pseudónimos
                const starSize = nodeRadiusScale(d.communication_count) + 3;
                group.append("path")
                    .attr("d", createStarPath(0, 0, starSize, starSize * 0.5, 5))
                    .attr("fill", () => {
                        if (d.type === "direct") return "#4ecdc4"; // Verde para contactos directos
                        if (d.type === "indirect") return "#ff9f43"; // Naranja para contactos indirectos
                        return "#4ecdc4"; // Verde por defecto
                    })
                    .attr("stroke", d.type === "indirect" ? "#e67e22" : "#333")
                    .attr("stroke-width", d.type === "indirect" ? 2 : 1)
                    .style("cursor", "pointer")
                    .datum(d);
            } else {
                // Crear círculo para contactos normales
                const radius = d.type === "ego" ? (isSmallScreen ? 20 : 25) : nodeRadiusScale(d.communication_count) + 5;
                
                group.append("circle")
                    .attr("r", radius)
                    .attr("fill", () => {
                        if (d.type === "ego") return "#6b7280"; // Gris para Nadia (centro)
                        if (d.type === "indirect") return "#ff9f43"; // Naranja para contactos indirectos
                        return "#4ecdc4"; // Verde para contactos directos
                    })
                    .attr("stroke", d.type === "indirect" ? "#e67e22" : "#333")
                    .attr("stroke-width", d.type === "indirect" ? 2 : 1)
                    .style("cursor", "pointer")
                    .datum(d);
            }
        });
        
        // Etiquetas
        nodeGroups.append("text")
            .attr("class", "ego-label")
            .attr("x", 0)
            .attr("y", d => d.type === "ego" ? 35 : 30)
            .attr("text-anchor", "middle")
            .attr("font-size", d => d.type === "ego" ? "14px" : (isSmallScreen ? "11px" : "12px"))
            .attr("font-weight", d => d.type === "ego" ? "bold" : "normal")
            .attr("fill", "#333")
            .text(d => {
                const maxLength = d.type === "ego" ? 15 : (isSmallScreen ? 8 : 12);
                return d.name.length > maxLength ? d.name.substring(0, maxLength) + "..." : d.name;
            });

        // Leyenda para el ego network (igual que en el primer gráfico)
        const egoLegend = svg.append("g")
            .attr("class", "ego-legend")
            .attr("transform", `translate(${margin.left + 20}, ${height + margin.top + 40})`);

        // Elementos de leyenda (igual que en el primer gráfico)
        const egoLegendItems = [
            { color: "#4ecdc4", label: "Direct Communication", shape: "circle" },
            { color: "#ff9f43", label: "Indirect Communication", stroke: "#e67e22", shape: "circle" },
            { color: "transparent", label: "Pseudonym", shape: "star" }
        ];

        // Calcular espaciado horizontal para centrar la leyenda
        const legendSpacing = (width - 40) / egoLegendItems.length;
        const legendFontSize = isSmallScreen ? "12px" : "14px";

        egoLegendItems.forEach((item, i) => {
            const legendItem = egoLegend.append("g")
                .attr("transform", `translate(${i * legendSpacing + legendSpacing/2}, 0)`);
            
            if (item.shape === "star") {
                // Crear estrella en la leyenda (20% más grande)
                legendItem.append("path")
                    .attr("d", createStarPath(-50, 0, 7.2, 3.6, 5))
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1);
            } else {
                // Crear círculo en la leyenda (20% más grande)
                legendItem.append("circle")
                    .attr("cx", -50)
                    .attr("cy", 0)
                    .attr("r", 7.2)
                    .attr("fill", item.color)
                    .attr("stroke", item.stroke || "#333")
                    .attr("stroke-width", item.stroke ? 2 : 1);
            }
            
            legendItem.append("text")
                .attr("x", -35)
                .attr("y", 0)
                .attr("dy", "0.35em")
                .style("font-size", legendFontSize)
                .style("fill", "#333")
                .style("text-anchor", "start")
                .text(item.label);
        });
        
        // Tooltip para interactividad
        let tooltip = d3.select("body").select(".ego-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("class", "ego-tooltip")
                .style("opacity", 0)
                .style("position", "absolute")
                .style("background", "rgba(0, 0, 0, 0.8)")
                .style("color", "white")
                .style("padding", "8px")
                .style("border-radius", "4px")
                .style("font-size", "12px")
                .style("pointer-events", "none")
                .style("z-index", "1000");
        }
        
        // Eventos de interacción - aplicar tanto a circles como a paths
        nodeGroups.selectAll("circle, path")
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                console.log("🖱️ Mouseover on node:", d.name);
                
                tooltip.style("opacity", 1)
                    .html(`<strong>${d.name}</strong><br/>
                           Type: ${d.type === "ego" ? "Central Node" : d.type}<br/>
                           Communications: ${d.communication_count}<br/>
                           ${d.is_pseudonym ? "Pseudonym" : ""}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
                
                // Resaltar el nodo actual
                nodeGroups.selectAll("circle, path")
                    .style("opacity", node => node.id === d.id ? 1 : 0.3);
            })
            .on("mouseout", function() {
                console.log("🖱️ Mouseout from node");
                tooltip.style("opacity", 0);
                
                // Restaurar opacidad de todos los nodos
                nodeGroups.selectAll("circle, path")
                    .style("opacity", 1);
            })
            .on("click", function(event, d) {
                console.log(`🖱️ Clicked on ${d.name}, updating visualizations...`);
                
                // Limpiar el contenedor de wordcloud pero preservar el título
                wordCloudContainer.selectAll("*:not(h3)").remove();
                const loadingMessage = wordCloudContainer.append("div")
                    .style("text-align", "center")
                    .style("padding", "20px")
                    .style("color", "#666")
                    .style("margin-top", "20px")
                    .html("Generating word cloud...");
                
                // Determinar el filtro de persona
                const filterPerson = d.type === "ego" ? null : d.name;
                
                // Actualizar wordcloud
                generateWordCloudImage(filterPerson, wordCloudContainer, loadingMessage);
                
                // Actualizar time series chart
                createTimeSeriesChart(timeSeriesContainer, directCommunications, indirectCommunications, filterPerson);
                
                // Guardar nodo seleccionado
                window.currentSelectedNode = d.name;
                
                // Analizar y actualizar descripción de eventos de corrupción
                const analysisData = window.analyzeNodeCorruption(d.name);
                window.updateNodeDescription(analysisData);
                
                // Feedback visual para indicar la selección
                nodeGroups.selectAll("circle, path")
                    .style("stroke-width", node => node.id === d.id ? 4 : 2)
                    .style("stroke", node => node.id === d.id ? "#dc2626" : "#333");
            });
        
        // Usar directamente el análisis container - hacer global para acceso desde timeline
        window.descriptionContainer = analysisContainer;
        
        // Contenido inicial (el título principal ya está en el h3 del contenedor)
        window.descriptionContainer.append("p")
            .attr("class", "initial-message")
            .style("margin", "15px 15px 15px 15px")
            .style("color", "#6b7280")
            .style("font-style", "italic")
            .text("Click on any node to see corruption events and keywords analysis");
        
        // Inicializar con análisis de Nadia Conti
        window.currentSelectedNode = "Nadia Conti";
        
        // Esperar un poco para asegurar que todo esté cargado
        setTimeout(() => {
            console.log('🚀 Initializing Analysis for Nadia Conti...');
            try {
                const initialAnalysis = window.analyzeNodeCorruption("Nadia Conti");
                window.updateNodeDescription(initialAnalysis);
                console.log('✅ Initial analysis completed');
            } catch (error) {
                console.error('❌ Error in initial analysis:', error);
            }
        }, 100);
        
        // Función para analizar eventos de corrupción y palabras clave para un nodo
        // Hacer función global para acceso desde timeline
        window.analyzeNodeCorruption = function analyzeNodeCorruption(nodeName) {
            console.log(`🔍 Analyzing corruption events for: ${nodeName}`);
            // Usar variables globales
            const globalDirect = window.directCommunications || [];
            const globalIndirect = window.indirectCommunications || [];
            
            console.log('📊 Available communications:', {
                directCount: globalDirect.length,
                indirectCount: globalIndirect.length,
                directSample: globalDirect.slice(0, 2),
                indirectSample: globalIndirect.slice(0, 2)
            });
            
            // Obtener todas las comunicaciones relacionadas con este nodo
            let relevantCommunications = [];
            
            if (nodeName === "Nadia Conti") {
                // Para Nadia, usar todas las comunicaciones
                relevantCommunications = [...globalDirect, ...globalIndirect];
            } else {
                // Para otros nodos, filtrar comunicaciones relacionadas
                relevantCommunications = [
                    ...globalDirect.filter(comm => comm.other_person === nodeName),
                    ...globalIndirect.filter(comm => 
                        comm.other_person === nodeName || 
                        (comm.pattern_type && comm.pattern_type.includes(nodeName))
                    )
                ];
            }
            
            console.log(`Found ${relevantCommunications.length} communications for ${nodeName}`);
            console.log('📝 Sample communications:', relevantCommunications.slice(0, 3));
            
            // Analizar eventos de corrupción
            const foundEvents = {};
            const allFoundKeywords = new Set();
            
            // Inicializar contadores
            Object.keys(corruption_events).forEach(eventType => {
                foundEvents[eventType] = {
                    count: 0,
                    keywords: new Set(),
                    messages: []
                };
            });
            
            // Procesar cada comunicación
            relevantCommunications.forEach(comm => {
                const content = comm.content.toLowerCase();
                
                Object.entries(corruption_events).forEach(([eventType, keywords]) => {
                    keywords.forEach(keyword => {
                        if (content.includes(keyword.toLowerCase())) {
                            foundEvents[eventType].count++;
                            foundEvents[eventType].keywords.add(keyword);
                            foundEvents[eventType].messages.push({
                                content: comm.content,
                                date: comm.datetime || comm.day,
                                type: comm.connection_type || 'direct'
                            });
                            allFoundKeywords.add(keyword);
                        }
                    });
                });
            });
            
            // Filtrar solo eventos que tienen ocurrencias
            let activeEvents = Object.entries(foundEvents)
                .filter(([eventType, data]) => data.count > 0)
                .sort(([,a], [,b]) => b.count - a.count);
            
            // Aplicar filtro de eventos seleccionados si existe
            if (window.selectedCorruptionEvents && window.selectedCorruptionEvents.size > 0) {
                activeEvents = activeEvents.filter(([eventType, data]) => 
                    window.selectedCorruptionEvents.has(eventType)
                );
            }
            
            return {
                nodeName,
                totalCommunications: relevantCommunications.length,
                totalEvents: activeEvents.length,
                totalKeywords: allFoundKeywords.size,
                events: activeEvents,
                allKeywords: Array.from(allFoundKeywords),
                isFiltered: window.selectedCorruptionEvents && window.selectedCorruptionEvents.size > 0
            };
        }
        
        // Función para actualizar la descripción del nodo - hacer global para acceso desde timeline
        window.updateNodeDescription = function updateNodeDescription(analysisData) {
            console.log('🎨 Updating node description:', analysisData);
            
            // Verificar que el contenedor existe
            if (!window.descriptionContainer) {
                console.error('❌ Description container not found');
                return;
            }
            
            // Limpiar contenido anterior (mantener solo el título h3)
            window.descriptionContainer.selectAll("div, p").remove();
            
            // Estadísticas generales
            const statsContainer = window.descriptionContainer.append("div")
                .style("margin", "0 15px 15px 15px")
                .style("padding", "10px")
                .style("background", "#ffffff")
                .style("border-radius", "6px")
                .style("border", "1px solid #e5e7eb");
            
            let statsText = `<strong>Communications:</strong> ${analysisData.totalCommunications} | <strong>Corruption Events:</strong> ${analysisData.totalEvents} | <strong>Keywords Found:</strong> ${analysisData.totalKeywords}`;
            
            if (analysisData.isFiltered) {
                statsText += ` <span style="color: #dc2626; font-weight: bold;"></span>`;
            }
            
            statsContainer.append("p")
                .style("margin", "0 0 5px 0")
                .style("font-size", "13px")
                .style("color", "#374151")
                .html(statsText);
            
            if (analysisData.events.length === 0) {
                const noEventsText = analysisData.isFiltered 
                    ? "No corruption events match the selected timeline filters for this node."
                    : "No corruption events detected in communications with this node.";
                    
                window.descriptionContainer.append("p")
                    .style("margin", "0 15px 15px 15px")
                    .style("color", "#6b7280")
                    .style("font-style", "italic")
                    .text(noEventsText);
                return;
            }
            
            // Mostrar eventos de corrupción
            const eventsContainer = window.descriptionContainer.append("div")
                .style("margin", "0 15px 15px 15px")
                .style("max-height", "400px")
                .style("overflow-y", "auto");
            
            analysisData.events.forEach(([eventType, data]) => {
                const eventDiv = eventsContainer.append("div")
                    .style("margin-bottom", "10px")
                    .style("padding", "8px")
                    .style("background", "#ffffff")
                    .style("border-radius", "4px")
                    .style("border", "1px solid #e5e7eb")
                    .style("border-left", "4px solid #dc2626");
                
                // Título del evento
                eventDiv.append("div")
                    .style("font-weight", "600")
                    .style("color", "#dc2626")
                    .style("font-size", "13px")
                    .style("margin-bottom", "5px")
                    .text(`${eventType} (${data.count} occurrences)`);
                
                // Keywords encontradas
                if (data.keywords.size > 0) {
                    const keywordsDiv = eventDiv.append("div")
                        .style("margin-bottom", "8px");
                    
                    keywordsDiv.append("span")
                        .style("font-size", "12px")
                        .style("color", "#6b7280")
                        .style("font-weight", "500")
                        .text("Keywords: ");
                    
                    Array.from(data.keywords).forEach((keyword, index) => {
                        if (index > 0) {
                            keywordsDiv.append("span")
                                .style("color", "#6b7280")
                                .text(", ");
                        }
                        keywordsDiv.append("span")
                            .style("background", "#fef3c7")
                            .style("color", "#92400e")
                            .style("padding", "2px 6px")
                            .style("border-radius", "3px")
                            .style("font-size", "11px")
                            .style("font-weight", "500")
                            .text(keyword);
                    });
                }
                
                // Mostrar todos los mensajes completos
                if (data.messages.length > 0) {
                    const messagesDiv = eventDiv.append("div")
                        .style("margin-top", "8px");
                    
                    messagesDiv.append("div")
                        .style("font-size", "11px")
                        .style("color", "#6b7280")
                        .style("font-weight", "500")
                        .style("margin-bottom", "4px")
                        .text(`Messages (${data.messages.length}):`);
                    
                    // Mostrar todos los mensajes completos
                    data.messages.forEach((msg, index) => {
                        const msgDiv = messagesDiv.append("div")
                            .style("background", "#f9fafb")
                            .style("padding", "8px 12px")
                            .style("border-radius", "4px")
                            .style("margin-bottom", "6px")
                            .style("border-left", "3px solid #d1d5db");
                        
                        // Mostrar mensaje completo sin truncar
                        msgDiv.append("div")
                            .style("font-size", "12px")
                            .style("color", "#4b5563")
                            .style("line-height", "1.4")
                            .style("margin-bottom", "4px")
                            .style("white-space", "pre-wrap")
                            .style("word-wrap", "break-word")
                            .text(msg.content);
                        
                        msgDiv.append("div")
                            .style("font-size", "10px")
                            .style("color", "#9ca3af")
                            .style("font-weight", "500")
                            .text(`${msg.type} - ${d3.timeFormat("%Y-%m-%d")(msg.date)}`);
                    });
                }
            });
        }
        
        console.log("🕸️ Egocentric network created successfully");
    }
    
    // Function to analyze corruption keywords from communications
    function analyzeCorruptionKeywords(filterPerson) {
        // Definir corruption events keywords
        const corruption_events = {
            "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
            "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
            "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
            "special access": ["acces", "special", "secured", "corridor", "entrance"],
            "use of intermediaries": ["middleman"],
            "confidentiality abuse": ["confidentiality", "encrypted"],
            "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
            "unauthorized access": ["unauthorized"],
            "favoritism": ["favor"],
            "money laundering": ["funding"]
        };
        
        // Prepare data for keywords-based word cloud
        const relevantComms = [];
        
        if (filterPerson) {
            // Add direct communications for specific person
            if (window.directCommunications) {
                window.directCommunications.forEach(comm => {
                    if (comm.other_person === filterPerson) {
                        relevantComms.push({
                            source: 'Nadia Conti',
                            target: comm.other_person,
                            content: comm.content,
                            type: 'direct'
                        });
                    }
                });
            }
            
            // Add indirect communications for specific person
            if (window.indirectCommunications) {
                window.indirectCommunications.forEach(comm => {
                    if (comm.other_person === filterPerson || 
                        (comm.pattern_type && comm.pattern_type.includes(filterPerson))) {
                        relevantComms.push({
                            source: 'Nadia Conti',
                            target: filterPerson,
                            content: comm.content,
                            pattern_type: comm.pattern_type,
                            type: 'indirect'
                        });
                    }
                });
            }
        } else {
            // Add ALL communications for ego node (Nadia Conti)
            if (window.directCommunications) {
                window.directCommunications.forEach(comm => {
                    relevantComms.push({
                        source: 'Nadia Conti',
                        target: comm.other_person,
                        content: comm.content,
                        type: 'direct'
                    });
                });
            }
            
            if (window.indirectCommunications) {
                window.indirectCommunications.forEach(comm => {
                    relevantComms.push({
                        source: 'Nadia Conti',
                        target: comm.other_person || 'Unknown',
                        content: comm.content,
                        pattern_type: comm.pattern_type,
                        type: 'indirect'
                    });
                });
            }
        }
        
        // Extract ONLY corruption_events keywords from communications
        const keywordCounts = {};
        
        // Initialize keyword counts for ALL corruption keywords
        Object.values(corruption_events).flat().forEach(keyword => {
            keywordCounts[keyword] = 0;
        });
        
        // Count ONLY these specific keywords in communications
        relevantComms.forEach(comm => {
            const content = comm.content.toLowerCase();
            Object.values(corruption_events).flat().forEach(keyword => {
                if (content.includes(keyword.toLowerCase())) {
                    keywordCounts[keyword]++;
                }
            });
        });
        
        // Filter only keywords that appear in communications (from corruption_events only)
        const foundKeywords = Object.entries(keywordCounts)
            .filter(([keyword, count]) => count > 0)
            .map(([keyword, count]) => ({ keyword, count }));
        
        console.log(`📨 Analyzing ${relevantComms.length} communications for ${filterPerson || 'ALL MESSAGES'}`);
        console.log(`🔑 Found ${foundKeywords.length} corruption keywords:`, foundKeywords.map(k => `${k.keyword}(${k.count})`).join(', '));
        
        return {
            foundKeywords,
            relevantComms,
            corruption_events
        };
    }
    
    function createWordCloud(container, directCommunications, indirectCommunications) {
        console.log("Creating word cloud with Python WordCloud library...");
        
        // Clear previous content
        container.html("");
        
        // Add title to the word cloud
        container.append("h3")
            .style("margin", "15px 0 10px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Corruption Keywords Cloud");
        
        // Create wordcloud container
        const wordcloudDiv = container.append("div")
            .attr("class", "wordcloud-container")
            .style("width", "100%")
            .style("height", "calc(100% - 45px)") // Adjust height to account for title
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("align-items", "center")
            .style("justify-content", "center") // Center vertically
            .style("padding", "10px") // Reduced padding
            .style("flex-grow", "1"); // Allow it to grow and fill available space
        
        // Add loading message
        const loadingMessage = wordcloudDiv.append("div")
            .attr("class", "loading-message")
            .style("text-align", "center")
            .style("color", "#666")
            .style("font-size", "14px")
            .html("Generating word cloud...");
        
        // Generate initial wordcloud (all communications)
        generateWordCloudImage(null, wordcloudDiv, loadingMessage);
        
        return wordcloudDiv;
    }
    
    function generateWordCloudImage(filterPerson, container, loadingMessage) {
        console.log(`Generating wordcloud for filter: ${filterPerson || 'all communications'}`);
        
        // Set responsive dimensions - use more vertical space
        const isSmallScreen = window.innerWidth < 768;
        const containerHeight = container.node().offsetHeight;
        const availableHeight = Math.max(containerHeight - 100, 250); // Account for title and padding
        
        const width = isSmallScreen ? 350 : 550;
        const height = isSmallScreen ? Math.min(availableHeight, 280) : Math.min(availableHeight, 450);
        
        // Call the corruption keywords analysis function
        const result = analyzeCorruptionKeywords(filterPerson);
        
        if (result.foundKeywords.length === 0) {
            // Clear loading message
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            // Clear previous content but preserve the title
            container.selectAll("*:not(h3)").remove();
            
            container.append("div")
                .style("text-align", "center")
                .style("color", "#666")
                .style("padding", "10px")
                .style("font-size", "14px")
                .html("No corruption keywords found in communications");
            return;
        }
        
        // Create text string with only corruption keywords for wordcloud
        const keywordText = result.foundKeywords.map(k => {
            // Repeat keyword based on its count for proper weighting
            return Array(k.count).fill(k.keyword).join(' ');
        }).join(' ');
        
        // Update request body to send only corruption keywords text
        const keywordOnlyRequest = {
            filter_person: filterPerson,
            width: width,
            height: height,
            mode: 'text_only',
            text_content: keywordText,
            keywords_only: true,
            corruption_keywords: result.foundKeywords
        };
        
        console.log(`🎨 Generating wordcloud with corruption keywords only: "${keywordText}"`);
        console.log(`📊 Request data:`, keywordOnlyRequest);
        
        // Clear loading message first
        if (loadingMessage) {
            loadingMessage.remove();
        }
        
        // Clear previous content but preserve the title
        container.selectAll("*:not(h3)").remove();
        
        // Create frontend-only wordcloud with corruption keywords
        createFrontendWordCloud(container, result.foundKeywords, filterPerson);
        
        // NO backend request - using only frontend version to avoid overwriting
        console.log(`✅ Using frontend-only wordcloud to ensure corruption keywords are shown`);
        console.log(`🚫 Skipping backend request to prevent overwriting with old image`);
    }
    
    // Create a simple frontend wordcloud using HTML/CSS
    function createFrontendWordCloud(container, foundKeywords, filterPerson) {
        console.log(`🎨 Creating frontend wordcloud with ${foundKeywords.length} keywords`);
        
        if (foundKeywords.length === 0) {
            container.append("div")
                .style("text-align", "center")
                .style("color", "#666")
                .style("padding", "20px")
                .style("font-size", "14px")
                .html("No corruption keywords found in communications");
            return;
        }
        
        // Definir corruption events y colores (mismos que el timeline)
        const corruption_events = {
            "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
            "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
            "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
            "special access": ["acces", "special", "secured", "corridor", "entrance"],
            "use of intermediaries": ["middleman"],
            "confidentiality abuse": ["confidentiality", "encrypted"],
            "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
            "unauthorized access": ["unauthorized"],
            "favoritism": ["favor"],
            "money laundering": ["funding"]
        };
        
        // Misma escala de colores que el timeline
        const colorScale = d3.scaleOrdinal()
            .domain(Object.keys(corruption_events))
            .range(['#dc2626', '#f59e0b', '#2563eb', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#4338ca', '#65a30d']);
        
        // Función para encontrar la categoría de una palabra
        function getWordCategory(keyword) {
            for (const [category, words] of Object.entries(corruption_events)) {
                if (words.some(word => word.toLowerCase() === keyword.toLowerCase())) {
                    return category;
                }
            }
            return "document destruction and forgery"; // Color por defecto
        }
        
        // Create container for words
        const wordsContainer = container.append("div")
            .style("display", "flex")
            .style("flex-wrap", "wrap")
            .style("justify-content", "space-around")
            .style("align-items", "center")
            .style("align-content", "center")
            .style("gap", "8px")
            .style("padding", "15px")
            .style("height", "calc(100% - 50px)")
            .style("overflow", "hidden")
            .style("line-height", "1.3");
        
        // Calculate max count for scaling
        const maxCount = Math.max(...foundKeywords.map(k => k.count));
        
        // Create word elements with better size distribution
        foundKeywords.forEach(keywordData => {
            const fontSize = Math.max(14, Math.min(42, 16 + (keywordData.count / maxCount) * 26));
            const opacity = Math.max(0.7, keywordData.count / maxCount);
            
            // Obtener color basado en la categoría de la palabra
            const category = getWordCategory(keywordData.keyword);
            const wordColor = colorScale(category);
            
            const wordElement = wordsContainer.append("span")
                .style("font-size", fontSize + "px")
                .style("font-weight", "600")
                .style("color", wordColor) // Usar color de la categoría
                .style("opacity", opacity)
                .style("margin", "3px 6px")
                .style("cursor", "pointer")
                .style("transition", "all 0.3s ease")
                .style("display", "inline-block")
                .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.1)")
                .text(keywordData.keyword)
                .attr("title", `${keywordData.keyword}: ${keywordData.count} occurrences\nCategory: ${category}`)
                .on("mouseover", function() {
                    d3.select(this)
                        .style("transform", "scale(1.2)")
                        .style("opacity", "1");
                })
                .on("mouseout", function() {
                    d3.select(this)
                        .style("transform", "scale(1)")
                        .style("opacity", opacity);
                });
        });
        
        // Add info text
        container.append("div")
            .style("text-align", "center")
            .style("color", "#666")
            .style("font-size", "12px")
            .style("margin-top", "10px")
            
    }
    
    // Old fetch code (keeping for reference but using frontend version above)
    function generateWordCloudImageOld(filterPerson, container, loadingMessage) {
        const result = analyzeCorruptionKeywords(filterPerson);
        
        // Make request to wordcloud endpoint with corruption keywords only
        fetch('/wordcloud/nadia_analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(keywordOnlyRequest)
        })
            .then(response => response.json())
            .then(data => {
                // Clear loading message
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                
                // Clear previous content but preserve the title
                container.selectAll("*:not(h3)").remove();
                
                if (data.error) {
                    console.error("Error generating wordcloud:", data.error);
                    container.append("div")
                        .style("text-align", "center")
                        .style("color", "#666")
                        .style("padding", "10px")
                        .style("font-size", "14px")
                        .html(`Error: ${data.error}`);
                    return;
                }
                
                if (data.image) {
                    // Create image element with tooltip
                    const img = container.append("img")
                        .attr("src", data.image)
                        .attr("alt", "Word Cloud")
                        .style("max-width", "95%")
                        .style("max-height", "95%") // Use almost all available space
                        .style("width", "auto")
                        .style("height", "auto")
                        .style("border", "1px solid #ddd")
                        .style("border-radius", "8px")
                        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
                        .style("cursor", "pointer")
                        .style("object-fit", "contain") // Maintain aspect ratio while filling space
                        .attr("title", `Corruption Keywords Cloud - ${result.foundKeywords.length} corruption keywords from ${result.relevantComms.length} communications`);
                    
                    // Add tooltip functionality for wordcloud image
                    let wordcloudTooltip = d3.select("body").select(".wordcloud-tooltip");
                    if (wordcloudTooltip.empty()) {
                        wordcloudTooltip = d3.select("body").append("div")
                            .attr("class", "wordcloud-tooltip")
                            .style("opacity", 0)
                            .style("position", "absolute")
                            .style("background", "rgba(0, 0, 0, 0.8)")
                            .style("color", "white")
                            .style("padding", "8px")
                            .style("border-radius", "4px")
                            .style("font-size", "12px")
                            .style("pointer-events", "none")
                            .style("z-index", "1000");
                    }
                    
                    img.on("mouseover", function(event) {
                        wordcloudTooltip.style("opacity", 1)
                            .html(`<strong>Corruption Keywords Cloud</strong><br/>
                                   Keywords: ${result.foundKeywords.length}<br/>
                                   Communications: ${result.relevantComms.length}<br/>
                                   ${filterPerson ? `Filtered by: ${filterPerson}` : "All communications"}<br/>
                                   <small>Shows only corruption_events keywords</small>`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 10) + "px");
                    })
                    .on("mouseout", function() {
                        wordcloudTooltip.style("opacity", 0);
                    });
                    
                } else {
                    container.append("div")
                        .style("text-align", "center")
                        .style("color", "#666")
                        .style("padding", "10px")
                        .style("font-size", "14px")
                        .html("No corruption keywords found in communications");
                }
            })
            .catch(error => {
                console.error("Error fetching wordcloud:", error);
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                // Clear previous content but preserve the title
                container.selectAll("*:not(h3)").remove();
                container.append("div")
                    .style("text-align", "center")
                    .style("color", "#666")
                    .style("padding", "10px")
                    .style("font-size", "14px")
                    .html("Error loading word cloud");
            });
    }
    
    function createTimeSeriesChart(container, directCommunications, indirectCommunications, filterPerson) {
        console.log(`📈 Creating time series chart for ${filterPerson || 'all communications'}`);
        console.log('📊 Container info:', {
            containerExists: !!container,
            containerNode: container ? container.node() : null,
            directCommsCount: directCommunications ? directCommunications.length : 0,
            indirectCommsCount: indirectCommunications ? indirectCommunications.length : 0
        });
        
        // Clear previous content
        container.selectAll("*:not(h3)").remove();
        
        // Variables responsive - definir ANTES de usar
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Establecer dimensiones fijas del contenedor para mantener consistencia
        const fixedHeight = isSmallScreen ? "585px" : "675px"; // Reducido 10% para hacer el gráfico menos alto
        container.style("height", fixedHeight)
            .style("max-height", fixedHeight)
            .style("overflow", "visible"); // Cambiar a visible para ver si hay elementos cortados
        
        // Configurar dimensiones - timeline responsive y estable
        const margin = {
            top: 30, // Más espacio arriba para el título
            right: isSmallScreen ? 30 : 40,
            bottom: isSmallScreen ? 80 : 100, // Más espacio para el eje X
            left: isSmallScreen ? 50 : 60
        };
        
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        
        // Usar dimensiones ajustadas para columna más estrecha
        const containerWidth = isSmallScreen ? 450 : 550; // Ajustado para columna de 45%
        const containerHeight = isSmallScreen ? 450 : 585; // Reducido 10% para hacer el gráfico menos alto
        
        const width = containerWidth - margin.left - margin.right;
        const height = containerHeight - margin.top - margin.bottom - 120; // Más espacio para leyenda completa
        
        console.log(`📐 Timeline dimensions: width=${width}, height=${height}, containerWidth=${containerWidth}, containerHeight=${containerHeight}`);
        
        // Crear SVG con dimensiones estables
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .style("margin", "10px 15px")
            .style("display", "block")
            .style("max-width", "100%")
            .style("max-height", "100%")
            .style("background", "transparent");
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        console.log('🎨 SVG created successfully:', {
            svgWidth: width + margin.left + margin.right,
            svgHeight: height + margin.top + margin.bottom,
            innerWidth: width,
            innerHeight: height
        });
        
        // Definir corruption events
        const corruption_events = {
            "document destruction and forgery": ["destroy", "destruction", "documentation", "documented", "revised", "modified", "changed"],
            "permission management": ["permit", "approval", "approved", "authorization", "cancel", "canceled", "cancellation"],
            "illicit payments and bribery": ["payment", "fee", "funding", "cost", "favor", "protocol", "arrangement"],
            "special access": ["acces", "special", "secured", "corridor", "entrance"],
            "use of intermediaries": ["middleman"],
            "confidentiality abuse": ["confidentiality", "encrypted"],
            "suspicious activity": ["unusual", "suspiciou", "suspect", "questioning"],
            "unauthorized access": ["unauthorized"],
            "favoritism": ["favor"],
            "money laundering": ["funding"]
        };
        
        // Filtrar comunicaciones según la persona seleccionada
        let allCommunications = [...directCommunications, ...indirectCommunications];
        if (filterPerson) {
            allCommunications = allCommunications.filter(comm => 
                comm.other_person === filterPerson || 
                (comm.pattern_type && comm.pattern_type.includes(filterPerson))
            );
        }
        
        if (allCommunications.length === 0) {
            container.append("div")
                .style("text-align", "center")
                .style("padding", "40px")
                .style("color", "#666")
                .text("No communications found for selected person");
            return;
        }
        
        // Procesar datos por fecha y tipo de corruption event
        const dateEventCounts = {};
        
        allCommunications.forEach(comm => {
            const date = d3.timeDay(comm.day);
            const dateKey = d3.timeFormat("%Y-%m-%d")(date);
            
            if (!dateEventCounts[dateKey]) {
                dateEventCounts[dateKey] = {};
                Object.keys(corruption_events).forEach(eventType => {
                    dateEventCounts[dateKey][eventType] = 0;
                });
            }
            
            // Verificar cada tipo de corruption event
            const content = comm.content.toLowerCase();
            Object.entries(corruption_events).forEach(([eventType, keywords]) => {
                keywords.forEach(keyword => {
                    if (content.includes(keyword)) {
                        dateEventCounts[dateKey][eventType]++;
                    }
                });
            });
        });
        
        // Convertir a array de datos para D3
        const timeSeriesData = Object.entries(dateEventCounts).map(([dateStr, events]) => ({
            date: d3.timeParse("%Y-%m-%d")(dateStr),
            ...events
        })).sort((a, b) => a.date - b.date);
        
        console.log('🔍 Timeline data processing:', {
            dateEventCounts: Object.keys(dateEventCounts).length,
            timeSeriesData: timeSeriesData.length,
            firstData: timeSeriesData[0]
        });
        
        if (timeSeriesData.length === 0) {
            container.append("div")
                .style("text-align", "center")
                .style("padding", "40px")
                .style("color", "#666")
                .text("No corruption events found in communications");
            return;
        }
        
        // Verificar si hay datos reales de eventos
        const hasAnyEventData = timeSeriesData.some(d => 
            Object.keys(corruption_events).some(eventType => d[eventType] > 0)
        );
        
        console.log('📊 Event data check:', {
            hasAnyEventData,
            sampleEventCounts: timeSeriesData.slice(0, 3).map(d => {
                const eventCounts = {};
                Object.keys(corruption_events).forEach(eventType => {
                    eventCounts[eventType] = d[eventType];
                });
                return { date: d3.timeFormat("%Y-%m-%d")(d.date), ...eventCounts };
            })
        });
        
        if (!hasAnyEventData) {
            // Mostrar mensaje más informativo y mantener el gráfico
            g.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "14px")
                .style("fill", "#666")
                .text("No corruption events detected in selected communications");
            
            // Crear una línea básica de comunicaciones para mostrar actividad
            const basicCommData = {};
            allCommunications.forEach(comm => {
                const date = d3.timeDay(comm.day);
                const dateKey = d3.timeFormat("%Y-%m-%d")(date);
                
                if (!basicCommData[dateKey]) {
                    basicCommData[dateKey] = 0;
                }
                basicCommData[dateKey]++;
            });
            
            const basicTimeSeriesData = Object.entries(basicCommData).map(([dateStr, count]) => ({
                date: d3.timeParse("%Y-%m-%d")(dateStr),
                value: count
            })).sort((a, b) => a.date - b.date);
            
            if (basicTimeSeriesData.length > 0) {
                const basicXScale = d3.scaleTime()
                    .domain(d3.extent(basicTimeSeriesData, d => d.date))
                    .range([0, width]);
                
                const basicYScale = d3.scaleLinear()
                    .domain([0, d3.max(basicTimeSeriesData, d => d.value)])
                    .range([height, 0]);
                
                const basicLine = d3.line()
                    .x(d => basicXScale(d.date))
                    .y(d => basicYScale(d.value))
                    .curve(d3.curveMonotoneX);
                
                // Dibujar línea básica de comunicaciones
                g.append("path")
                    .datum(basicTimeSeriesData)
                    .attr("fill", "none")
                    .attr("stroke", "#94a3b8")
                    .attr("stroke-width", 2)
                    .attr("d", basicLine)
                    .style("opacity", 0.7);
                
                // Dibujar puntos
                g.selectAll(".basic-dot")
                    .data(basicTimeSeriesData)
                    .enter().append("circle")
                    .attr("class", "basic-dot")
                    .attr("cx", d => basicXScale(d.date))
                    .attr("cy", d => basicYScale(d.value))
                    .attr("r", 3)
                    .attr("fill", "#94a3b8");
                
                // Agregar ejes para la línea básica
                g.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0,${height})`)
                    .call(d3.axisBottom(basicXScale)
                        .ticks(d3.timeDay.every(1))
                        .tickFormat(d3.timeFormat("%m/%d")));
                
                g.append("g")
                    .attr("class", "y-axis")
                    .call(d3.axisLeft(basicYScale).ticks(5));
                
                // Agregar etiqueta
                g.append("text")
                    .attr("x", width / 2)
                    .attr("y", height + 40)
                    .attr("text-anchor", "middle")
                    .style("font-size", "12px")
                    .style("fill", "#666")
                    .text("Communication Activity Timeline");
            }
            
            console.log('📊 Timeline completed with basic communications data');
            return;
        }
        
        // Escalas
        const xScale = d3.scaleTime()
            .domain(d3.extent(timeSeriesData, d => d.date))
            .range([0, width]);
        
        const maxCount = d3.max(timeSeriesData, d => 
            d3.max(Object.keys(corruption_events), eventType => d[eventType])
        );
        
        const yScale = d3.scaleLinear()
            .domain([0, maxCount || 1])
            .range([height, 0]);
        
        // Colores para cada línea
        const colorScale = d3.scaleOrdinal()
            .domain(Object.keys(corruption_events))
            .range(['#dc2626', '#f59e0b', '#2563eb', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#4338ca', '#65a30d']);
        
        // Crear líneas
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);
        
        // Agregar ejes
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
                .ticks(d3.timeDay.every(1))
                .tickFormat(d3.timeFormat("%m/%d")))
            .selectAll("text")
            .style("font-size", isSmallScreen ? "10px" : "12px")
            .style("transform", isSmallScreen ? "rotate(-45deg)" : "none")
            .style("text-anchor", isSmallScreen ? "end" : "middle");
        
        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale).ticks(5))
            .selectAll("text")
            .style("font-size", isSmallScreen ? "10px" : "12px");
        
        // Agregar grid
        g.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
                .ticks(d3.timeDay.every(1))
                .tickSize(-height)
                .tickFormat("")
            )
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3);
        
        g.append("g")
            .attr("class", "grid")
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-width)
                .tickFormat("")
            )
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3);
        
        // Crear tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "timeseries-tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
        
        // Variables para controlar visibilidad y resaltado de líneas
        const visibleLines = new Set(Object.keys(corruption_events));
        const highlightedLines = new Set(); // Cambiar a Set para múltiples selecciones
        
        // Variable global para filtrar mensajes en Analysis
        window.selectedCorruptionEvents = new Set();
        
        // Dibujar líneas para cada corruption event
        Object.keys(corruption_events).forEach(eventType => {
            const eventData = timeSeriesData.map(d => ({
                date: d.date,
                value: d[eventType]
            }));
            
            // Solo dibujar líneas que tengan al menos un valor > 0
            const hasData = eventData.some(d => d.value > 0);
            console.log(`📈 Event type "${eventType}":`, {
                hasData,
                totalValues: eventData.reduce((sum, d) => sum + d.value, 0),
                maxValue: Math.max(...eventData.map(d => d.value))
            });
            
            if (!hasData) return;
            
            // Línea
            g.append("path")
                .datum(eventData)
                .attr("class", `line-${eventType.replace(/\s+/g, '-')}`)
                .attr("fill", "none")
                .attr("stroke", colorScale(eventType))
                .attr("stroke-width", 2)
                .attr("d", line)
                .style("opacity", 1)
                .style("cursor", "pointer")
                .on("click", function(event) {
                    event.stopPropagation(); // Evitar que se propague al área de limpiar
                    highlightLine(eventType);
                });
            
            // Puntos
            g.selectAll(`.dot-${eventType.replace(/\s+/g, '-')}`)
                .data(eventData.filter(d => d.value > 0))
                .enter().append("circle")
                .attr("class", `dot-${eventType.replace(/\s+/g, '-')}`)
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yScale(d.value))
                .attr("r", 4)
                .attr("fill", colorScale(eventType))
                .style("cursor", "pointer")
                .style("opacity", 1)
                .on("mouseover", function(event, d) {
                    tooltip.style("opacity", 1)
                        .html(`<strong>${eventType}</strong><br/>
                               Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br/>
                               Count: ${d.value}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px");
                })
                .on("mouseout", function() {
                    tooltip.style("opacity", 0);
                })
                .on("click", function(event) {
                    event.stopPropagation(); // Evitar que se propague al área de limpiar
                    highlightLine(eventType);
                });
        });
        
        // Función para resaltar/desresaltar líneas (múltiples selecciones)
        function highlightLine(eventType) {
            if (highlightedLines.has(eventType)) {
                // Si ya está resaltada, quitarla de la selección
                highlightedLines.delete(eventType);
            } else {
                // Agregar a la selección
                highlightedLines.add(eventType);
            }
            
            // Actualizar visualización
            updateHighlighting();
        }
        
        // Función para actualizar el resaltado basado en las selecciones actuales
        function updateHighlighting() {
            Object.keys(corruption_events).forEach(type => {
                const hasData = timeSeriesData.some(d => d[type] > 0);
                if (!hasData) return;
                
                const isVisible = visibleLines.has(type);
                const isHighlighted = highlightedLines.has(type);
                
                let opacity, strokeWidth, dotRadius, legendBg, legendWeight, legendOpacity;
                
                if (highlightedLines.size === 0) {
                    // Sin resaltado: mostrar según visibilidad
                    opacity = isVisible ? 1 : 0.2;
                    strokeWidth = 2;
                    dotRadius = 4;
                    legendBg = "transparent";
                    legendWeight = "normal";
                    legendOpacity = isVisible ? 1 : 0.5;
                } else {
                    // Con resaltado: resaltar seleccionadas, atenuar las demás
                    if (isHighlighted) {
                        opacity = 1;
                        strokeWidth = 3;
                        dotRadius = 5;
                        legendBg = "#dbeafe";
                        legendWeight = "bold";
                        legendOpacity = 1;
                    } else {
                        opacity = 0.2;
                        strokeWidth = 1;
                        dotRadius = 3;
                        legendBg = "transparent";
                        legendWeight = "normal";
                        legendOpacity = 0.5;
                    }
                }
                
                // Aplicar estilos
                g.select(`.line-${type.replace(/\s+/g, '-')}`).style("opacity", opacity).style("stroke-width", strokeWidth);
                g.selectAll(`.dot-${type.replace(/\s+/g, '-')}`).style("opacity", opacity).attr("r", dotRadius);
                d3.select(`.legend-item-${type.replace(/\s+/g, '-')}`).style("background-color", legendBg).style("font-weight", legendWeight).style("opacity", legendOpacity);
            });
        }
        
        // Función para limpiar el resaltado
        function clearHighlight() {
            highlightedLines.clear();
            updateHighlighting();
            
            // Limpiar filtro de Analysis
            window.selectedCorruptionEvents.clear();
            updateAnalysisFilter();
        }
        
        // Función para actualizar el filtro de Analysis basado en eventos seleccionados
        function updateAnalysisFilter() {
            // Actualizar variable global con eventos resaltados
            window.selectedCorruptionEvents = new Set(highlightedLines);
            
            console.log('🔄 Updating analysis filter:', Array.from(window.selectedCorruptionEvents));
            
            // Si hay un nodo actualmente seleccionado, re-analizar con filtro
            if (window.currentSelectedNode && window.analyzeNodeCorruption && window.updateNodeDescription) {
                console.log('📊 Re-analyzing node:', window.currentSelectedNode);
                const analysisData = window.analyzeNodeCorruption(window.currentSelectedNode);
                window.updateNodeDescription(analysisData);
            } else {
                console.log('⚠️ Missing required functions or node:', {
                    currentNode: window.currentSelectedNode,
                    analyzeFunction: !!window.analyzeNodeCorruption,
                    updateFunction: !!window.updateNodeDescription
                });
            }
        }
        
        // Leyenda debajo del gráfico
        const legendItems = Object.keys(corruption_events).filter(eventType => {
            return timeSeriesData.some(d => d[eventType] > 0);
        });
        
        if (legendItems.length > 0) {
            // Crear contenedor HTML para la leyenda con dimensiones estables
            const legendContainer = container.append("div")
                .attr("class", "legend-container")
                .style("display", "flex")
                .style("flex-wrap", "wrap")
                .style("justify-content", "center")
                .style("gap", "10px")
                .style("margin-top", "10px")
                .style("padding", "15px")
                .style("background", "#f8f9fa")
                .style("border-radius", "6px")
                .style("margin-left", "15px")
                .style("margin-right", "15px")
                .style("margin-bottom", "15px");
            
            legendItems.forEach(eventType => {
                const legendItem = legendContainer.append("div")
                    .attr("class", `legend-item-${eventType.replace(/\s+/g, '-')}`)
                    .style("display", "flex")
                    .style("align-items", "center")
                    .style("gap", "6px")
                    .style("font-size", isSmallScreen ? "12px" : "14px")
                    .style("color", "#374151")
                    .style("cursor", "pointer")
                    .style("padding", "5px")
                    .style("border-radius", "4px")
                    .style("transition", "background-color 0.2s");
                
                // Crear SVG pequeño para la línea de color
                const legendSvg = legendItem.append("svg")
                    .attr("width", 20)
                    .attr("height", 12);
                
                legendSvg.append("line")
                    .attr("x1", 2)
                    .attr("x2", 18)
                    .attr("y1", 6)
                    .attr("y2", 6)
                    .attr("stroke", colorScale(eventType))
                    .attr("stroke-width", 2);
                
                legendSvg.append("circle")
                    .attr("cx", 10)
                    .attr("cy", 6)
                    .attr("r", 2)
                    .attr("fill", colorScale(eventType));
                
                // Texto de la leyenda
                legendItem.append("span")
                    .text(eventType.length > 25 ? eventType.substring(0, 25) + "..." : eventType)
                    .attr("title", eventType); // Tooltip para nombres largos
                
                // Agregar interactividad
                legendItem
                    .on("mouseover", function() {
                        const currentBg = d3.select(this).style("background-color");
                        if (currentBg === "transparent" || currentBg === "rgba(0, 0, 0, 0)") {
                            d3.select(this).style("background-color", "#e5e7eb");
                        }
                    })
                    .on("mouseout", function() {
                        const isHighlighted = highlightedLines.has(eventType);
                        if (!isHighlighted) {
                            d3.select(this).style("background-color", "transparent");
                        }
                    })
                    .on("click", function(event) {
                        event.stopPropagation(); // Evitar que se propague al área de limpiar
                        
                        // Verificar si es shift+click para toggle, click normal para highlight
                        if (event.shiftKey) {
                            // Toggle visibilidad de la línea (shift+click)
                            const isVisible = visibleLines.has(eventType);
                            
                            if (isVisible) {
                                // Ocultar línea
                                visibleLines.delete(eventType);
                                // También quitar del resaltado si estaba resaltada
                                highlightedLines.delete(eventType);
                            } else {
                                // Mostrar línea
                                visibleLines.add(eventType);
                            }
                            
                            updateHighlighting();
                        } else {
                            // Resaltar/desresaltar línea (click normal)
                            highlightLine(eventType);
                            
                            // Actualizar filtro para Analysis
                            updateAnalysisFilter();
                        }
                    });
            });
        }
        
        // Título con filtro
        const title = filterPerson ? `Corruption Events: ${filterPerson}` : "Corruption Events: All Communications";
        g.append("text")
            .attr("x", width / 2)
            .attr("y", -5)
            .attr("text-anchor", "middle")
            .style("font-size", isSmallScreen ? "12px" : "14px")
            .style("font-weight", "600")
            .style("fill", "#374151")
            .text(title);
        
        // Área invisible para limpiar resaltado con doble-click
        g.append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", Math.max(0, width))
            .attr("height", Math.max(0, height))
            .style("fill", "transparent")
            .style("pointer-events", "all")
            .on("dblclick", function() {
                clearHighlight();
            });
        
        console.log(`📈 Time series chart created with ${timeSeriesData.length} data points`);
    }
    
    // Relationship color function
    function getRelationshipColor(relationship_type) {
        const colors = {
            'default': '#4ecdc4',
            'business': '#2563eb',
            'family': '#dc2626',
            'colleague': '#f59e0b',
            'friend': '#059669',
            'authority': '#7c3aed'
        };
        return colors[relationship_type] || colors['default'];
    }
    
    // Load relationship colors (placeholder function)
    function loadRelationshipColors() {
        return Promise.resolve();
    }
}

// Export the init function
window.init_nadia_analysis = init_nadia_analysis;