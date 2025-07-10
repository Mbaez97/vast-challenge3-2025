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
        d3.select("#network-tab").html(`
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
window.init_nadia_analysis = init_nadia_analysis;