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
        console.log("🎨 Creating temporal network visualization...");
        console.log("📊 Direct communications:", directCommunications?.length || 0);
        console.log("📊 Indirect communications:", indirectCommunications?.length || 0);
        
        const container = d3.select("#network-graph");
        console.log("📦 Container found:", !container.empty());
        container.html(""); // Limpiar contenido previo
        
        // Variables de responsive design globales para esta función
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        console.log("📱 Screen type:", isSmallScreen ? "small" : isMediumScreen ? "medium" : "large");
        
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
            .style("gap", isSmallScreen ? "15px" : "25px")
            .style("align-items", "center")
            .style("flex-wrap", "wrap")
            .style("justify-content", "center")
            .style("flex-direction", isSmallScreen ? "column" : "row");
        
        // Elementos de leyenda
        const legendItems = [
            { type: "direct", color: "#4ecdc4", label: "Direct Communication", shape: "circle" },
            { type: "indirect", color: "#ff9f43", label: "Indirect Communication", shape: "circle" },
            { type: "pseudonym-single", color: "#f59e0b", label: "Single Pseudonym", shape: "star" },
            { type: "pseudonym-multiple", color: "#dc2626", label: "Multiple Pseudonyms", shape: "star" }
            // Removido: { type: "line-direct", color: "#666", label: "Direct Timeline", shape: "line-solid" }
            // Removido: { type: "line-indirect", color: "#ff9f43", label: "Indirect Timeline", shape: "line-dashed" }
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
                .style("font-size", isSmallScreen ? "12px" : "14px")
                .style("color", "#374151")
                .style("font-weight", "500")
                .text(item.label);
        });
        
        // Contenedor de eventos de comunicación debajo del gráfico (responsive)
        const eventsContainer = mainContainer.append("div")
            .attr("id", "network-events-container")
            .style("width", "100%")
            .style("max-height", isSmallScreen ? "400px" : "600px")
            .style("overflow-y", "auto")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff")
            .style("padding", isSmallScreen ? "10px" : "15px");
        
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
        
        // Crear gráfico de red egocéntrico debajo del temporal
        // Crear contenedor con layout de dos columnas
        const dualContainer = mainContainer.append("div")
            .style("display", "flex")
            .style("gap", "20px")
            .style("margin-top", "20px")
            .style("width", "100%")
            .style("min-height", "700px");

        // Gráfico de red egocéntrico en la izquierda
        const egoNetworkContainer = dualContainer.append("div")
            .attr("id", "ego-network-container")
            .style("width", "60%")
            .style("min-height", "700px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff");
        
        egoNetworkContainer.append("h3")
            .style("margin", "10px 0 15px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Nadia Conti - Ego Network");
        
        // Columna derecha para wordcloud y time series
        const rightColumn = dualContainer.append("div")
            .style("width", "40%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("gap", "20px");

        // Nube de palabras
        const wordCloudContainer = rightColumn.append("div")
            .attr("id", "word-cloud-container")
            .style("width", "100%")
            .style("min-height", "400px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff");

        wordCloudContainer.append("h3")
            .style("margin", "10px 0 15px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Word Cloud Analysis");

        // Gráfico de series temporales de corruption events
        const timeSeriesContainer = rightColumn.append("div")
            .attr("id", "time-series-container")
            .style("width", "100%")
            .style("min-height", "400px")
            .style("border", "1px solid #e2e8f0")
            .style("border-radius", "8px")
            .style("background", "#ffffff");

        timeSeriesContainer.append("h3")
            .style("margin", "10px 0 15px 15px")
            .style("color", "#374151")
            .style("font-size", "18px")
            .style("font-weight", "600")
            .text("Corruption Events Timeline");

        // Guardar comunicaciones globalmente para acceso desde wordcloud
        window.directCommunications = directCommunications;
        window.indirectCommunications = indirectCommunications;
        
        createEgocentricNetwork(egoNetworkContainer, directCommunications, indirectCommunications, wordCloudContainer, timeSeriesContainer);
        createWordCloud(wordCloudContainer, directCommunications, indirectCommunications);
        createTimeSeriesChart(timeSeriesContainer, directCommunications, indirectCommunications, null);
    }
    
    // Variable global para almacenar la escala de colores del relationship graph
    let relationshipColorScale = null;
    
    // Función para cargar los datos de relaciones y crear la escala de colores
    async function loadRelationshipColors() {
        try {
            const response = await fetch('/data/relationships');
            const relationshipData = await response.json();
            
            // Guardar datos globalmente para acceso desde otras funciones
            window.relationshipData = relationshipData;
            
            // Extraer tipos únicos de relaciones igual que en graph.js
            const linkTypes = Array.from(new Set(relationshipData.edges.map(d => d.type)));
            console.log("🎨 Relationship types found in data:", linkTypes);
            console.log("🎨 Total relationship edges loaded:", relationshipData.edges.length);
            
            // Debug: mostrar todas las relaciones de Nadia Conti
            const nadiaRelationships = relationshipData.edges.filter(edge => 
                edge.source === "Nadia Conti" || edge.target === "Nadia Conti"
            );
            console.log("🔗 Nadia Conti relationships:", nadiaRelationships.map(r => ({
                partner: r.source === "Nadia Conti" ? r.target : r.source,
                type: r.type
            })));
            
            // Crear la escala de colores igual que en graph.js
            relationshipColorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(linkTypes);
            
            console.log("🎨 Color mapping:", linkTypes.map(type => `${type}: ${relationshipColorScale(type)}`));
            
            return relationshipColorScale;
        } catch (error) {
            console.error("Error loading relationship data:", error);
            // Fallback a colores fijos si no se puede cargar
            return d3.scaleOrdinal(d3.schemeCategory10).domain([
                'AccessPermission', 'Colleagues', 'Coordinates', 'Friends', 
                'Jurisdiction', 'Operates', 'Reports', 'Suspicious', 'Unfriendly'
            ]);
        }
    }
    
    // Función para obtener colores según tipo de relación (igual que en relationship graph)
    function getRelationshipColor(relationshipType) {
        if (!relationshipColorScale) {
            // Colores de fallback si no se ha cargado la escala
            const fallbackColors = {
                'AccessPermission': '#1f77b4',  // Blue
                'Colleagues': '#ff7f0e',        // Orange
                'Coordinates': '#2ca02c',       // Green
                'Friends': '#d62728',           // Red
                'Jurisdiction': '#9467bd',      // Purple
                'Operates': '#8c564b',          // Brown
                'Reports': '#e377c2',           // Pink
                'Suspicious': '#7f7f7f',        // Gray
                'Unfriendly': '#bcbd22',        // Olive
                'default': '#17becf'            // Cyan for unknown types
            };
            return fallbackColors[relationshipType] || fallbackColors['default'];
        }
        
        return relationshipColorScale(relationshipType) || '#17becf';
    }
    
    function createEgocentricNetwork(container, directCommunications, indirectCommunications, wordCloudContainer, timeSeriesContainer) {
        console.log("🕸️ Creating egocentric network...");
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Dimensiones del SVG - más espacioso
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        const margin = { top: 40, right: 40, bottom: 40, left: 40 };
        const width = Math.max(500, containerRect.width - margin.left - margin.right);
        const height = isSmallScreen ? 500 : isMediumScreen ? 600 : 700;
        
        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        // Preparar datos para la red egocéntrica
        const allCommunications = [...directCommunications, ...indirectCommunications];
        
        // Debug: mostrar todos los nombres en comunicaciones
        const allOtherPersons = [...new Set(allCommunications.map(c => c.other_person))];
        console.log("📞 All communication partners:", allOtherPersons);
        
        // Crear nodos únicos
        const nodes = [];
        const nodeSet = new Set();
        
        // Agregar Nadia Conti como nodo central
        nodes.push({
            id: "Nadia Conti",
            name: "Nadia Conti",
            type: "ego", // Nodo central
            is_pseudonym: false,
            communication_count: allCommunications.length
        });
        nodeSet.add("Nadia Conti");
        
        // Agregar otros nodos basados en comunicaciones con información temporal
        allCommunications.forEach(comm => {
            if (!nodeSet.has(comm.other_person)) {
                // Encontrar la primera comunicación (más temprana) con esta persona
                const firstCommunication = allCommunications
                    .filter(c => c.other_person === comm.other_person)
                    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
                
                // Obtener tipo de relación desde los datos de relaciones
                let relationshipType = 'default';
                if (window.relationshipData && window.relationshipData.edges) {
                    // Primero intentar matching exacto
                    let relationshipEdge = window.relationshipData.edges.find(edge => 
                        (edge.source === "Nadia Conti" && edge.target === comm.other_person) ||
                        (edge.target === "Nadia Conti" && edge.source === comm.other_person)
                    );
                    
                    // Si no encuentra, intentar matching parcial (para casos como "The Accountant")
                    if (!relationshipEdge) {
                        relationshipEdge = window.relationshipData.edges.find(edge => {
                            const partner = edge.source === "Nadia Conti" ? edge.target : 
                                           edge.target === "Nadia Conti" ? edge.source : null;
                            if (partner) {
                                return partner.includes(comm.other_person) || comm.other_person.includes(partner);
                            }
                            return false;
                        });
                    }
                    
                    if (relationshipEdge && relationshipEdge.type) {
                        relationshipType = relationshipEdge.type;
                        console.log(`🔗 Found relationship: Nadia Conti ↔ ${comm.other_person} = ${relationshipType}`);
                    } else {
                        console.log(`❌ No relationship found for: ${comm.other_person}`);
                        // Debug específico para nombres que sabemos que deberían existir
                        if (["Sam", "The Accountant", "Nemo Reef"].includes(comm.other_person)) {
                            console.log(`🔍 Debugging ${comm.other_person}:`);
                            const allNadiaEdges = window.relationshipData.edges
                                .filter(e => e.source === "Nadia Conti" || e.target === "Nadia Conti");
                            
                            console.log(`All Nadia relationships:`, allNadiaEdges.map(e => ({
                                partner: e.source === "Nadia Conti" ? e.target : e.source,
                                type: e.type,
                                source: e.source,
                                target: e.target
                            })));
                            
                            // Buscar coincidencias parciales
                            const partialMatches = allNadiaEdges.filter(e => {
                                const partner = e.source === "Nadia Conti" ? e.target : e.source;
                                return partner.toLowerCase().includes(comm.other_person.toLowerCase()) || 
                                       comm.other_person.toLowerCase().includes(partner.toLowerCase());
                            });
                            console.log(`Partial matches for ${comm.other_person}:`, partialMatches);
                        }
                    }
                }
                
                nodes.push({
                    id: comm.other_person,
                    name: comm.other_person,
                    type: comm.connection_type || "direct",
                    is_pseudonym: comm.is_pseudonym || false,
                    communication_count: allCommunications.filter(c => c.other_person === comm.other_person).length,
                    first_communication_date: firstCommunication.date,
                    relationship_type: relationshipType
                });
                nodeSet.add(comm.other_person);
            }
        });
        
        // Crear enlaces
        const links = allCommunications.map(comm => ({
            source: "Nadia Conti",
            target: comm.other_person,
            type: comm.connection_type || "direct",
            is_pseudonym: comm.is_pseudonym || false,
            communication_count: 1
        }));
        
        // Agrupar enlaces por destino para mostrar peso
        const linkMap = new Map();
        links.forEach(link => {
            const key = `${link.source}-${link.target}`;
            if (linkMap.has(key)) {
                linkMap.get(key).communication_count++;
                if (link.is_pseudonym) linkMap.get(key).is_pseudonym = true;
                if (link.type === "indirect") linkMap.get(key).type = "indirect";
            } else {
                linkMap.set(key, { ...link });
            }
        });
        
        const uniqueLinks = Array.from(linkMap.values());
        
        console.log("🕸️ Network data:", { nodes: nodes.length, links: uniqueLinks.length });
        
        // Leyenda de colores de relaciones comentada ya que no se muestran líneas
        // const relationshipTypes = [...new Set(nodes.filter(n => n.relationship_type && n.relationship_type !== 'default').map(n => n.relationship_type))];
        // console.log("🎨 Relationship types found:", relationshipTypes);
        
        // // Agregar leyenda si hay tipos de relación
        // if (relationshipTypes.length > 0) {
        //     const legend = g.append("g")
        //         .attr("class", "relationship-legend")
        //         .attr("transform", `translate(${width - 200}, 20)`);
        //     
        //     legend.append("text")
        //         .attr("x", 0)
        //         .attr("y", 0)
        //         .attr("font-weight", "bold")
        //         .attr("font-size", "12px")
        //         .text("Relationship Types:");
        //     
        //     relationshipTypes.forEach((type, i) => {
        //         const legendItem = legend.append("g")
        //             .attr("transform", `translate(0, ${20 + i * 20})`);
        //         
        //         legendItem.append("line")
        //             .attr("x1", 0)
        //             .attr("y1", 0)
        //             .attr("x2", 15)
        //             .attr("y2", 0)
        //             .attr("stroke", getRelationshipColor(type))
        //             .attr("stroke-width", 3);
        //         
        //         legendItem.append("text")
        //             .attr("x", 20)
        //             .attr("y", 4)
        //             .attr("font-size", "10px")
        //             .text(type);
        //     });
        // }
        
        // Configurar layout circular - radio más grande para mayor espaciado
        const radius = Math.min(width, height) / 2 - 120;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Posicionar nodos en círculo ordenados por temporalidad (excepto Nadia en el centro)
        const otherNodes = nodes.filter(n => n.id !== "Nadia Conti")
            .sort((a, b) => new Date(a.first_communication_date) - new Date(b.first_communication_date));
        const angleStep = (2 * Math.PI) / otherNodes.length;
        
        otherNodes.forEach((node, i) => {
            const angle = i * angleStep;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
            node.fx = node.x; // Fijar posición
            node.fy = node.y;
        });
        
        // Posicionar Nadia en el centro
        const nadiaNode = nodes.find(n => n.id === "Nadia Conti");
        nadiaNode.x = centerX;
        nadiaNode.y = centerY;
        nadiaNode.fx = centerX;
        nadiaNode.fy = centerY;
        
        // Escalas para tamaños y colores
        const communicationExtent = d3.extent(nodes, d => d.communication_count);
        const nodeRadiusScale = d3.scaleLinear()
            .domain(communicationExtent)
            .range([isSmallScreen ? 4 : 6, isSmallScreen ? 12 : 15]);
        
        const linkWidthScale = d3.scaleLinear()
            .domain(d3.extent(uniqueLinks, d => d.communication_count))
            .range([2, 8]); // Líneas más gruesas y más rango de variación
        
        // Crear elementos del gráfico
        
        // Enlaces - líneas comentadas para remover conexiones en ego network
        // const linkElements = g.selectAll(".ego-link")
        //     .data(uniqueLinks)
        //     .enter().append("line")
        //     .attr("class", "ego-link")
        //     .attr("stroke", d => {
        //         // Buscar el tipo de relación para esta línea
        //         const targetNode = nodes.find(n => n.id === d.target);
        //         const relationshipType = targetNode ? targetNode.relationship_type : 'default';
        //         const color = getRelationshipColor(relationshipType);
        //         return color;
        //     })
        //     .attr("stroke-width", d => linkWidthScale(d.communication_count))
        //     .attr("stroke-opacity", 0.8)
        //     .attr("x1", centerX)
        //     .attr("y1", centerY)
        //     .attr("x2", d => {
        //         const targetNode = nodes.find(n => n.id === d.target);
        //         return targetNode ? targetNode.x : centerX;
        //     })
        //     .attr("y2", d => {
        //         const targetNode = nodes.find(n => n.id === d.target);
        //         return targetNode ? targetNode.y : centerY;
        //     });
        
        // Nodos - crear un grupo para cada nodo para manejar tanto elipses como estrellas
        const nodeGroups = g.selectAll(".ego-node-group")
            .data(nodes)
            .enter().append("g")
            .attr("class", "ego-node-group")
            .attr("transform", d => `translate(${d.x},${d.y})`);
        
        // Añadir formas según el tipo (estrella o círculo)
        const nodeElements = nodeGroups.each(function(d) {
            const group = d3.select(this);
            
            if (d.is_pseudonym) {
                // Crear estrella más grande para pseudónimos, proporcional al tamaño del nodo
                const baseRadius = d.type === "ego" ? (isSmallScreen ? 20 : 25) : nodeRadiusScale(d.communication_count) + 5;
                const starSize = baseRadius * 1.2; // Estrella más grande
                
                // Crear estrella proporcional
                const starPath = `M0,${-starSize} L${starSize*0.3},${-starSize*0.3} L${starSize},${-starSize*0.3} L${starSize*0.5},${starSize*0.1} L${starSize*0.8},${starSize} L0,${starSize*0.5} L${-starSize*0.8},${starSize} L${-starSize*0.5},${starSize*0.1} L${-starSize},${-starSize*0.3} L${-starSize*0.3},${-starSize*0.3} Z`;
                
                group.append("path")
                    .attr("d", starPath)
                    .attr("fill", () => {
                        if (d.type === "ego") return "#2563eb"; // Azul para Nadia (centro)
                        // Para pseudónimos siempre usar amarillo/naranja como en el primer gráfico
                        return "#f59e0b"; // Amarillo/naranja para todos los pseudónimos
                    })
                    .attr("stroke", "#333")
                    .attr("stroke-width", 2)
                    .style("cursor", "pointer")
                    .datum(d); // Asegurar que los datos estén disponibles
            } else {
                // Crear círculo para contactos normales
                const radius = d.type === "ego" ? (isSmallScreen ? 20 : 25) : nodeRadiusScale(d.communication_count) + 5;
                
                group.append("circle")
                    .attr("r", radius)
                    .attr("fill", () => {
                        if (d.type === "ego") return "#2563eb"; // Azul para Nadia (centro)
                        if (d.type === "indirect") return "#ff9f43"; // Naranja para contactos indirectos
                        return "#4ecdc4"; // Verde/teal para contactos directos
                    })
                    .attr("stroke", "#333")
                    .attr("stroke-width", 2)
                    .style("cursor", "pointer")
                    .datum(d); // Asegurar que los datos estén disponibles
            }
        });
        
        // Etiquetas
        const labelElements = g.selectAll(".ego-label")
            .data(nodes)
            .enter().append("text")
            .attr("class", "ego-label")
            .attr("x", d => d.x)
            .attr("y", d => d.y + (d.type === "ego" ? 30 : 25))
            .attr("text-anchor", "middle")
            .attr("font-size", d => d.type === "ego" ? "12px" : (isSmallScreen ? "9px" : "10px"))
            .attr("font-weight", d => d.type === "ego" ? "bold" : "normal")
            .attr("fill", "#333")
            .text(d => {
                const maxLength = d.type === "ego" ? 15 : (isSmallScreen ? 8 : 12);
                return d.name.length > maxLength ? d.name.substring(0, maxLength) + "..." : d.name;
            });

        // Leyenda para el ego network
        const egoLegend = d3.select(container.node())
            .append("div")
            .attr("class", "ego-legend")
            .style("display", "flex")
            .style("gap", "20px")
            .style("margin-top", "20px")
            .style("justify-content", "center")
            .style("flex-wrap", "wrap")
            .style("align-items", "center");

        // Elementos de leyenda para ego network
        const egoLegendItems = [
            { type: "direct", color: "#4ecdc4", label: "Direct Communication", shape: "circle" },
            { type: "indirect", color: "#ff9f43", label: "Indirect Communication", shape: "circle" },
            { type: "pseudonym-single", color: "#f59e0b", label: "Single Pseudonym", shape: "star" },
            { type: "pseudonym-multiple", color: "#dc2626", label: "Multiple Pseudonyms", shape: "star" },
            { type: "center", color: "#4ecdc4", label: "Nadia Conti (center)", shape: "circle" }
        ];

        egoLegendItems.forEach(item => {
            const legendItem = egoLegend.append("div")
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
                .style("font-size", isSmallScreen ? "12px" : "14px")
                .style("color", "#374151")
                .style("font-weight", "500")
                .text(item.label);
        });
        
        // Tooltip para interactividad - evitar duplicados
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
                
                // Preparar información del tipo de relación
                const relationshipInfo = d.relationship_type && d.relationship_type !== 'default' ? 
                    `<br/>Relationship: <span style="color: ${getRelationshipColor(d.relationship_type)}; font-weight: bold;">${d.relationship_type}</span>` : 
                    '';
                
                tooltip.style("opacity", 1)
                    .html(`<strong>${d.name}</strong><br/>
                           Type: ${d.type === "ego" ? "Central Node" : d.type}<br/>
                           Communications: ${d.communication_count}${relationshipInfo}<br/>
                           ${d.first_communication_date ? `First Contact: ${d.first_communication_date}<br/>` : ""}
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
                
                // Limpiar el contenedor de wordcloud y mostrar mensaje de carga
                wordCloudContainer.selectAll("*").remove();
                const loadingMessage = wordCloudContainer.append("div")
                    .style("text-align", "center")
                    .style("padding", "20px")
                    .style("color", "#666")
                    .html("Generating word cloud...");
                
                // Determinar el filtro de persona
                const filterPerson = d.type === "ego" ? null : d.name;
                
                // Actualizar wordcloud
                generateWordCloudImage(filterPerson, wordCloudContainer, loadingMessage);
                
                // Actualizar time series chart
                createTimeSeriesChart(timeSeriesContainer, directCommunications, indirectCommunications, filterPerson);
                
                // Feedback visual para indicar la selección
                nodeGroups.selectAll("circle, path")
                    .style("stroke-width", node => node.id === d.id ? 4 : 2)
                    .style("stroke", node => node.id === d.id ? "#dc2626" : "#333");
            });
        
        // Segunda leyenda eliminada - solo mantenemos la primera leyenda que está arriba
        
        console.log("🕸️ Egocentric network created successfully");
    }
    
    function createActualTemporalGraph(container, directCommunications, indirectCommunications, indirectCount, toggleButton, eventsContainer) {
        // Variables de responsive design
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
            
            // Crear SVG para el símbolo de leyenda
            const symbol = legendItem.append("svg")
                .attr("width", 16)
                .attr("height", 16);
            
            if (item.shape === "star") {
                // Estrella más grande proporcional al círculo
                const starPath = "M8,0.5 L9.8,5.5 L15.5,5.5 L11,9 L12.8,14 L8,11.5 L3.2,14 L5,9 L0.5,5.5 L6.2,5.5 Z";
                symbol.append("path")
                    .attr("d", starPath)
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1);
            } else if (item.shape === "oval") {
                // Elipse ovalada más ancha
                symbol.append("ellipse")
                    .attr("cx", 8)
                    .attr("cy", 8)
                    .attr("rx", 9)
                    .attr("ry", 4)
                    .attr("fill", item.color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1);
            } else if (item.shape === "oval-star") {
                // Estrella ovalada
                const starPath = "M8,2 L8.6,5.2 L11.5,5.2 L9.2,7 L9.8,10.2 L8,8.4 L6.2,10.2 L6.8,7 L4.5,5.2 L7.4,5.2 Z";
                symbol.append("path")
                    .attr("d", starPath)
                    .attr("fill", item.color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1);
            } else if (item.shape === "ellipse-star") {
                // Primero la elipse
                symbol.append("ellipse")
                    .attr("cx", 8)
                    .attr("cy", 8)
                    .attr("rx", 7)
                    .attr("ry", 5)
                    .attr("fill", item.color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1);
                
                // Luego la estrella pequeña encima
                const smallStarPath = "M8,1 L8.8,3.2 L11,3.2 L9.1,4.8 L9.9,7 L8,5.4 L6.1,7 L6.9,4.8 L5,3.2 L7.2,3.2 Z";
                symbol.append("path")
                    .attr("d", smallStarPath)
                    .attr("fill", "#ffd700")
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 0.5);
            } else if (item.shape === "line") {
                symbol.append("line")
                    .attr("x1", 2)
                    .attr("y1", 8)
                    .attr("x2", 14)
                    .attr("y2", 8)
                    .attr("stroke", item.color)
                    .attr("stroke-width", 4)
                    .attr("stroke-opacity", 0.8);
            } else if (item.shape === "ellipse") {
                symbol.append("ellipse")
                    .attr("cx", 8)
                    .attr("cy", 8)
                    .attr("rx", 7)
                    .attr("ry", 5)
                    .attr("fill", item.color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1);
            } else if (item.shape === "circle") {
                symbol.append("circle")
                    .attr("cx", 8)
                    .attr("cy", 8)
                    .attr("r", 7)
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1);
            } else {
                symbol.append("circle")
                    .attr("cx", 8)
                    .attr("cy", 8)
                    .attr("r", 6)
                    .attr("fill", item.color)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1);
            }
            
            legendItem.append("span")
                .style("font-size", "12px")
                .style("color", "#374151")
                .text(item.label);
        });
        
        console.log("🕸️ Egocentric network created successfully");
    }
    
    function createActualTemporalGraph(container, directCommunications, indirectCommunications, indirectCount, toggleButton, eventsContainer) {
        // Variables de responsive design
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Configurar dimensiones del SVG de forma responsive
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        // Ajustar márgenes según el tamaño de pantalla
        const margin = {
            top: 20,
            right: isSmallScreen ? 20 : 50,
            bottom: isSmallScreen ? 40 : 50,
            left: isSmallScreen ? 80 : isMediumScreen ? 120 : 150
        };
        
        const width = Math.max(300, containerRect.width - margin.left - margin.right);
        
        // Calcular altura basada en el número de personas únicas y tamaño de pantalla
        const allCommunications = [...directCommunications, ...indirectCommunications];
        const uniquePersons = [...new Set(allCommunications.map(d => d.other_person))];
        
        const baseHeight = isSmallScreen ? 200 : 300;
        const personHeight = isSmallScreen ? 20 : isMediumScreen ? 24 : 28;
        const minHeight = isSmallScreen ? 300 : 400;
        const maxHeight = isSmallScreen ? 800 : isMediumScreen ? 1000 : 1200;
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
            const baseY = personYScale(d.other_person) + personYScale.bandwidth() / 2;
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
            .call(d3.axisBottom(x).ticks(d3.timeDay.every(1)).tickFormat(d3.timeFormat("%b %d")))
            .selectAll("text")
            .style("font-size", isSmallScreen ? "12px" : "15px")
            .style("transform", isSmallScreen ? "rotate(-45deg)" : "none")
            .style("text-anchor", isSmallScreen ? "end" : "middle");
        
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
                .attr("font-size", isSmallScreen ? "10px" : isMediumScreen ? "12px" : "15px")
                .attr("fill", "#333")
                .style("font-weight", "500")
                .text(() => {
                    const maxLength = isSmallScreen ? 10 : isMediumScreen ? 14 : 18;
                    return person.length > maxLength ? person.substring(0, maxLength) + "..." : person;
                });
        });
        
        // Configurar contador y estado
        indirectCount.text(`(${indirectCommunications.length} indirect communications found)`);
        let showIndirect = true;
        
        console.log(`🎯 Graph setup: ${directCommunications.length} direct, ${indirectCommunications.length} indirect communications`);
        
        // Función para detectar palabras clave sospechosas
        function detectSuspiciousKeywords(content) {
            // Obtener todas las palabras clave del diccionario corruption_events
            const corruption_events = {
                "document destruction and forgery": [
                    "destroy", "destruction", "documentation", "documented",
                    "revised", "modified", "changed"
                ],
                "permission management": [
                    "permit", "approval", "approved", "authorization",
                    "cancel", "canceled", "cancellation"
                ],
                "illicit payments and bribery": [
                    "payment", "fee", "funding", "cost",
                    "favor", "protocol", "arrangement"
                ],
                "special access": [
                    "acces", "special", "secured",
                    "corridor", "entrance"
                ],
                "use of intermediaries": [
                    "middleman"
                ],
                "confidentiality abuse": [
                    "confidentiality", "encrypted"
                ],
                "suspicious activity": [
                    "unusual", "suspiciou", "suspect", "questioning"
                ],
                "unauthorized access": [
                    "unauthorized"
                ],
                "favoritism": [
                    "favor"
                ],
                "money laundering": [
                    "funding"
                ]
            };
            
            // Crear un array con todas las palabras clave de corruption_events
            const suspicious_keywords = [];
            Object.values(corruption_events).forEach(keywords => {
                suspicious_keywords.push(...keywords);
            });
            
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

        function detectCorruptionEvents(content) {
            const corruption_events = {
                "document destruction and forgery": [
                    "destroy", "destruction", "documentation", "documented",
                    "revised", "modified", "changed"
                ],
                "permission management": [
                    "permit", "approval", "approved", "authorization",
                    "cancel", "canceled", "cancellation"
                ],
                "illicit payments and bribery": [
                    "payment", "fee", "funding", "cost",
                    "favor", "protocol", "arrangement"
                ],
                "special access": [
                    "acces", "special", "secured",
                    "corridor", "entrance"
                ],
                "use of intermediaries": [
                    "middleman"
                ],
                "confidentiality abuse": [
                    "confidentiality", "encrypted"
                ],
                "suspicious activity": [
                    "unusual", "suspiciou", "suspect", "questioning"
                ],
                "unauthorized access": [
                    "unauthorized"
                ],
                "favoritism": [
                    "favor"
                ],
                "money laundering": [
                    "funding"
                ]
            };
            
            if (!content) return [];
            
            const contentLower = content.toLowerCase();
            const foundEvents = [];
            
            Object.keys(corruption_events).forEach(eventType => {
                const keywords = corruption_events[eventType];
                const hasKeyword = keywords.some(keyword => contentLower.includes(keyword));
                if (hasKeyword && !foundEvents.includes(eventType)) {
                    foundEvents.push(eventType);
                }
            });
            
            return foundEvents;
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
                        .text(`🔗 INDIRECT ${event.has_any_pseudonym ? ` ${event.pseudonym_count} Pseudonym(s)` : ''}`);
                } else if (event.is_pseudonym) {
                    bubble.append("div")
                        .style("font-size", "11px")
                        .style("color", "#dc2626")
                        .style("font-weight", "600")
                        .style("margin-bottom", "4px")
                        .text("PSEUDONYM");
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
                        .text("Suspicious Keywords:");
                    
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

                // Detectar y mostrar corruption events
                const corruptionEvents = detectCorruptionEvents(event.content);
                if (corruptionEvents.length > 0) {
                    const corruptionDiv = bubble.append("div")
                        .style("margin-top", "6px")
                        .style("margin-bottom", "6px");
                    
                    corruptionDiv.append("div")
                        .style("font-size", "10px")
                        .style("color", "#7c2d12")
                        .style("font-weight", "600")
                        .style("margin-bottom", "3px")
                        .text("Corruption Events:");
                    
                    const corruptionContainer = corruptionDiv.append("div")
                        .style("display", "flex")
                        .style("flex-wrap", "wrap")
                        .style("gap", "3px");
                    
                    corruptionEvents.forEach(event => {
                        corruptionContainer.append("span")
                            .style("background-color", "#fed7aa")
                            .style("color", "#7c2d12")
                            .style("padding", "2px 6px")
                            .style("border-radius", "10px")
                            .style("font-size", "10px")
                            .style("font-weight", "500")
                            .style("border", "1px solid #fb923c")
                            .text(event);
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
                const baseY = currentPersonYScale(d.other_person) + currentPersonYScale.bandwidth() / 2;
                const yOffset = d.connection_type === "indirect" ? 12 : 0;
                d.y_position = baseY + yOffset;
            });
            
            // Actualizar personYScale global para uso en otras funciones
            personYScale = currentPersonYScale;
            
            // Dibujar líneas de conexión
            const directPersonDays = d3.group(visibleDirects, d => d.other_person);
            const indirectPersonDays = d3.group(visibleIndirects, d => d.other_person);
            
            // Líneas directas (sólidas) - COMENTADO por solicitud del usuario
            // directPersonDays.forEach((personLinks, person) => {
            //     const sortedLinks = personLinks.sort((a, b) => a.datetime - b.datetime);
            //     if (sortedLinks.length > 1) {
            //         const line = d3.line()
            //             .x(d => x(d.day))
            //             .y(d => d.y_position)
            //             .curve(d3.curveLinear);
            //         
            //         g.append("path")
            //             .datum(sortedLinks)
            //             .attr("class", "direct-connection-line")
            //             .attr("d", line)
            //             .attr("stroke", "#666")
            //             .attr("stroke-width", 1.5)
            //             .attr("stroke-opacity", 0.7)
            //             .attr("fill", "none");
            //     }
            // });
            
            // Líneas indirectas (punteadas) - COMENTADO por solicitud del usuario
            // indirectPersonDays.forEach((personLinks, person) => {
            //     const sortedLinks = personLinks.sort((a, b) => a.datetime - b.datetime);
            //     if (sortedLinks.length > 1) {
            //         const line = d3.line()
            //             .x(d => x(d.day))
            //             .y(d => d.y_position)
            //             .curve(d3.curveLinear);
            //         
            //         g.append("path")
            //             .datum(sortedLinks)
            //             .attr("class", "indirect-connection-line")
            //             .attr("d", line)
            //             .attr("stroke", "#ff9f43")
            //             .attr("stroke-width", 2)
            //             .attr("stroke-opacity", 0.8)
            //             .attr("stroke-dasharray", "5,5")
            //             .attr("fill", "none");
            //     }
            // });
            
            // Símbolos para puntos (responsive)
            const symbolSize = isSmallScreen ? 50 : isMediumScreen ? 65 : 80;
            const symbolGen = d3.symbol()
                .size(symbolSize)
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
                            `<br/>Keywords: <span style="color: #dc2626; font-weight: bold;">${suspiciousKeywords.join(", ")}</span>` : 
                            "";
                        
                        // Detectar corruption events
                        const corruptionEvents = detectCorruptionEvents(d.content);
                        const corruptionText = corruptionEvents.length > 0 ? 
                            `<br/>Corruption Events: <span style="color: #dc2626; font-weight: bold;">${corruptionEvents.join(",<br/>&nbsp;&nbsp;&nbsp;&nbsp;")}</span>` : 
                            "";
                        
                        tooltip.style("opacity", 1)
                            .html(`<strong>${d.other_person}</strong><br/>
                                   ${d.datetime.toLocaleDateString()}<br/>
                                   ${d.datetime.toLocaleTimeString()}<br/>
                                   Communication: Direct<br/>
                                   Direction: ${direction}${keywordsText}${corruptionText}`)
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
                            `<br/>Keywords: <span style="color: #dc2626; font-weight: bold;">${suspiciousKeywords.join(", ")}</span>` : 
                            "";
                        
                        // Detectar corruption events en comunicaciones indirectas
                        const corruptionEvents = detectCorruptionEvents(d.content);
                        const corruptionText = corruptionEvents.length > 0 ? 
                            `<br/>Corruption Events: <span style="color: #dc2626; font-weight: bold;">${corruptionEvents.join(",<br/>&nbsp;&nbsp;&nbsp;&nbsp;")}</span>` : 
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
                                   Gap: ${d.time_gap_hours.toFixed(1)}h${keywordsText}${corruptionText}`)
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
            
            console.log(`About to call updateVisualization with ${indirectCommunications.length} indirect communications available`);
            updateVisualization();
        });
        
        // Renderizado inicial
        updateVisualization();
        
        // Agregar listener para redimensionamiento de ventana
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                console.log("🔄 Redimensionando ventana...");
                // Recrear toda la visualización
                d3.select("#network-graph").html("");
                createTemporalNetworkVisualization(directCommunications, indirectCommunications);
            }, 300);
        });
    }

    function createWordCloud(container, directCommunications, indirectCommunications) {
        console.log("Creating word cloud with Python WordCloud library...");
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Clear previous content
        container.html("");
        
        // Create wordcloud container
        const wordcloudDiv = container.append("div")
            .attr("class", "wordcloud-container")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("align-items", "center")
            .style("justify-content", "flex-start")
            .style("padding-top", "80px");
        
        // Add loading message
        const loadingMessage = wordcloudDiv.append("div")
            .attr("class", "loading-message")
            .style("text-align", "center")
            .style("color", "#666")
            .html("Generating word cloud...");
        
        // Generate initial wordcloud (all communications)
        generateWordCloudImage(null, wordcloudDiv, loadingMessage);
        
        return wordcloudDiv;
    }
    
    function generateWordCloudImage(filterPerson, container, loadingMessage) {
        console.log(`Generating wordcloud for filter: ${filterPerson || 'all communications'}`);
        
        // Prepare request parameters
        const params = new URLSearchParams();
        if (filterPerson) {
            params.append('filter_person', filterPerson);
            
            // Determine if this is an indirect communication node
            const allComms = [...window.directCommunications || [], ...window.indirectCommunications || []];
            const isIndirectNode = window.indirectCommunications && 
                window.indirectCommunications.some(comm => 
                    comm.other_person === filterPerson || 
                    (comm.pattern_type && comm.pattern_type.includes(filterPerson))
                );
            
            if (isIndirectNode) {
                params.append('include_indirect', 'true');
                console.log(`📡 ${filterPerson} is an indirect communication node`);
                
                // Debug: mostrar las comunicaciones indirectas de esta persona
                const personIndirectComms = window.indirectCommunications.filter(comm => 
                    comm.other_person === filterPerson || 
                    (comm.pattern_type && comm.pattern_type.includes(filterPerson))
                );
                console.log(`📡 Indirect communications for ${filterPerson}:`, personIndirectComms);
                console.log(`📡 Content available:`, personIndirectComms.map(c => ({
                    content: c.content,
                    pattern_type: c.pattern_type,
                    other_person: c.other_person
                })));
            }
        }
        
        // Set responsive dimensions
        const isSmallScreen = window.innerWidth < 768;
        const width = isSmallScreen ? 400 : 600;
        const height = isSmallScreen ? 200 : 300;
        
        params.append('width', width);
        params.append('height', height);
        
        // Prepare POST data with actual communications
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
        
        // Always send communications via POST for better control
        const requestBody = {
            filter_person: filterPerson,
            width: parseInt(params.get('width')),
            height: parseInt(params.get('height')),
            communications: relevantComms
        };
        
        console.log(`📨 Sending ${relevantComms.length} communications for ${filterPerson || 'ALL MESSAGES'}:`, relevantComms.slice(0, 3), '...');
        
        // Make request to wordcloud endpoint (always POST now)
        fetch('/wordcloud/nadia_analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        })
            .then(response => response.json())
            .then(data => {
                // Clear loading message
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                
                // Clear previous content
                container.selectAll("*").remove();
                
                if (data.error) {
                    console.error("Error generating wordcloud:", data.error);
                    container.append("div")
                        .style("text-align", "center")
                        .style("color", "#666")
                        .html(`Error: ${data.error}`);
                    return;
                }
                
                if (data.image) {
                    // Create image element with tooltip
                    const img = container.append("img")
                        .attr("src", data.image)
                        .attr("alt", "Word Cloud")
                        .style("max-width", "100%")
                        .style("max-height", "100%")
                        .style("border", "1px solid #ddd")
                        .style("border-radius", "8px")
                        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
                        .style("cursor", "pointer")
                        .attr("title", `Word Cloud - ${data.word_count} unique words from ${data.filtered_communications} communications`);
                    
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
                            .html(`<strong>Word Cloud Analysis</strong><br/>
                                   Words: ${data.word_count}<br/>
                                   Communications: ${data.filtered_communications}<br/>
                                   ${filterPerson ? `Filtered by: ${filterPerson}` : "All communications"}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 10) + "px");
                    })
                    .on("mouseout", function() {
                        wordcloudTooltip.style("opacity", 0);
                    });
                    
                    //console.log(`✅ Wordcloud generated: ${data.word_count} words from ${data.filtered_communications} communications`);
                } else {
                    container.append("div")
                        .style("text-align", "center")
                        .style("color", "#666")
                        .html("No words to display");
                }
            })
            .catch(error => {
                console.error("Error fetching wordcloud:", error);
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                container.selectAll("*").remove();
                container.append("div")
                    .style("text-align", "center")
                    .style("color", "#666")
                    .html("Error loading word cloud");
            });
    }
    
    // Updated createWordCloudContent function (legacy, keeping for compatibility)
    function createWordCloudContent(container, directCommunications, indirectCommunications) {
        console.log("Creating word cloud content...");
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Extraer texto de todas las comunicaciones
        const allCommunications = [...directCommunications, ...indirectCommunications];
        const allText = allCommunications
            .map(comm => comm.content || "")
            .join(" ");

        // Palabras a filtrar (stopwords y palabras comunes)
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
            'here', 'there', 'where', 'when', 'why', 'how', 'what', 'who', 'which',
            'from', 'up', 'out', 'down', 'off', 'over', 'under', 'again', 'further',
            'then', 'once', 'now', 'very', 'too', 'also', 'just', 'more', 'most', 'other'
        ]);

        // Procesar texto y contar palabras
        const words = allText
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopwords.has(word))
            .reduce((acc, word) => {
                acc[word] = (acc[word] || 0) + 1;
                return acc;
            }, {});

        // Convertir a array y ordenar por frecuencia
        const wordArray = Object.entries(words)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 150) // Top 150 palabras para mayor densidad
            .map(([word, count]) => ({ text: word, size: count }));

        if (wordArray.length === 0) {
            container.append("div")
                .style("padding", "20px")
                .style("text-align", "center")
                .style("color", "#6b7280")
                .text("No keywords found in messages");
            return;
        }

        // Configurar dimensiones
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const width = containerRect.width - margin.left - margin.right;
        const height = 600;

        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left + width/2},${margin.top + height/2})`);

        // Escalas para tamaño de texto
        const maxCount = Math.max(...wordArray.map(d => d.size));
        const minCount = Math.min(...wordArray.map(d => d.size));
        
        const fontSizeScale = d3.scaleLinear()
            .domain([minCount, maxCount])
            .range([isSmallScreen ? 6 : 8, isSmallScreen ? 20 : 24]);

        // Colores para las palabras
        const colorScale = d3.scaleOrdinal()
            .range(['#4ecdc4', '#ff9f43', '#f59e0b', '#2563eb', '#dc2626', '#059669', '#7c3aed']);

        // Layout en forma de nube - distribución aleatoria pero organizada
        const maxRadius = Math.min(width, height) / 2 - 40;
        const centerWords = wordArray.slice(0, 8); // Más palabras importantes al centro
        const cloudWords = wordArray.slice(8); // Resto distribuido en nube
        
        // Función para verificar si hay colisión entre textos
        const placedWords = [];
        
        function getWordBounds(x, y, text, fontSize, isVertical = false) {
            if (isVertical) {
                // Para texto vertical, intercambiar dimensiones
                const textWidth = fontSize;
                const textHeight = text.length * fontSize * 0.6;
                return {
                    x1: x - textWidth/2,
                    x2: x + textWidth/2,
                    y1: y - textHeight/2,
                    y2: y + textHeight/2
                };
            } else {
                // Para texto horizontal
                const textWidth = text.length * fontSize * 0.6;
                const textHeight = fontSize;
                return {
                    x1: x - textWidth/2,
                    x2: x + textWidth/2,
                    y1: y - textHeight/2,
                    y2: y + textHeight/2
                };
            }
        }
        
        function isColliding(bounds1, bounds2, padding = 2) {
            return !(bounds1.x2 + padding < bounds2.x1 || 
                     bounds2.x2 + padding < bounds1.x1 || 
                     bounds1.y2 + padding < bounds2.y1 || 
                     bounds2.y2 + padding < bounds1.y1);
        }
        
        function findNonCollidingPosition(text, fontSize, wordIndex) {
            console.log(`🔍 Positioning word: "${text}" (index: ${wordIndex})`);
            
            // Generar hash simple para esta palabra
            let wordHash = 0;
            for (let i = 0; i < text.length; i++) {
                wordHash = ((wordHash << 5) - wordHash + text.charCodeAt(i)) & 0xffffffff;
            }
            wordHash = Math.abs(wordHash + contentHash + wordIndex) || 1;
            
            // Generador determinístico simple
            let seed = wordHash;
            function seededRandom() {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            }
            
            // Determinar orientación determinísticamente
            const randomValue = seededRandom();
            const isVertical = randomValue < 0.3; // 30% vertical, 70% horizontal
            console.log(`🎯 Word "${text}": random=${randomValue.toFixed(3)}, isVertical=${isVertical}`);
            
            // Intentar posiciones en espiral mejorado
            const maxR = Math.min(width, height) / 2 - 60;
            let radius = 20;
            let angle = seededRandom() * 2 * Math.PI;
            const angleStep = 0.2;
            const radiusStep = 6;
            
            for (let attempt = 0; attempt < 150; attempt++) {
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius * 0.7;
                
                const bounds = getWordBounds(x, y, text, fontSize, isVertical);
                
                // Verificar colisiones con padding más grande
                let hasCollision = false;
                for (const placed of placedWords) {
                    if (isColliding(bounds, placed.bounds, 8)) {
                        hasCollision = true;
                        break;
                    }
                }
                
                if (!hasCollision) {
                    console.log(`✅ Found position for "${text}" at (${x.toFixed(1)}, ${y.toFixed(1)}) - ${isVertical ? 'VERTICAL' : 'HORIZONTAL'}`);
                    return { x, y, bounds, isVertical };
                }
                
                // Siguiente posición en espiral más denso
                angle += angleStep;
                if (attempt % 6 === 0) {
                    radius += radiusStep;
                }
                if (attempt % 12 === 0) {
                    angle = seededRandom() * 2 * Math.PI; // Reset angle occasionally
                }
                
                // Si el radio es muy grande, resetear
                if (radius > maxR) {
                    radius = 20;
                    angle += Math.PI / 6; // Offset angle
                }
            }
            
            // Fallback simple
            const fallbackAngle = seededRandom() * 2 * Math.PI;
            const fallbackRadius = maxR * 0.8;
            const x = Math.cos(fallbackAngle) * fallbackRadius;
            const y = Math.sin(fallbackAngle) * fallbackRadius * 0.7;
            
            console.log(`⚠️ Using fallback position for "${text}"`);
            return { 
                x, 
                y, 
                bounds: getWordBounds(x, y, text, fontSize, isVertical), 
                isVertical 
            };
        }

        // Posicionar palabras centrales primero (más importantes)
        centerWords.forEach((d, i) => {
            const fontSize = fontSizeScale(d.size);
            const angle = (i * 2 * Math.PI) / centerWords.length;
            const radius = 30 + i * 10;
            
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            // Determinar orientación para palabras centrales también
            const centerHash = d.text.length * 100 + (i * 50);
            const isVertical = (centerHash % 10) < 3; // 30% vertical para centrales
            
            const bounds = getWordBounds(x, y, d.text, fontSize, isVertical);
            
            placedWords.push({ bounds });
            
            g.append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", "middle")
                .attr("font-size", fontSize + "px")
                .attr("font-weight", "700")
                .attr("fill", colorScale(i))
                .attr("opacity", 0.9)
                .style("cursor", "pointer")
                .style("writing-mode", isVertical ? "vertical-rl" : "horizontal-tb")
                .text(d.text)
                .on("mouseover", function(event) {
                    d3.select(this).attr("opacity", 1).attr("font-weight", "800");
                    
                    const tooltip = d3.select("body").append("div")
                        .attr("class", "word-tooltip")
                        .style("position", "absolute")
                        .style("background", "rgba(0, 0, 0, 0.8)")
                        .style("color", "white")
                        .style("padding", "8px")
                        .style("border-radius", "4px")
                        .style("font-size", "12px")
                        .style("pointer-events", "none")
                        .style("z-index", "1000")
                        .html(`"${d.text}" appears ${d.size} times`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this).attr("opacity", 0.9).attr("font-weight", "700");
                    d3.selectAll(".word-tooltip").remove();
                });
        });

        // Posicionar el resto de palabras en forma de nube
        cloudWords.forEach((d, i) => {
            const fontSize = fontSizeScale(d.size);
            const position = findNonCollidingPosition(d.text, fontSize, i + centerWords.length);
            
            placedWords.push({ bounds: position.bounds });
            
            g.append("text")
                .attr("x", position.x)
                .attr("y", position.y)
                .attr("text-anchor", "middle")
                .attr("font-size", fontSize + "px")
                .attr("font-weight", "600")
                .attr("fill", colorScale(i + centerWords.length))
                .attr("opacity", 0.8)
                .style("cursor", "pointer")
                .style("writing-mode", position.isVertical ? "vertical-rl" : "horizontal-tb")
                .text(d.text)
                .on("mouseover", function(event) {
                    d3.select(this).attr("opacity", 1);
                    
                    const tooltip = d3.select("body").append("div")
                        .attr("class", "word-tooltip")
                        .style("position", "absolute")
                        .style("background", "rgba(0, 0, 0, 0.8)")
                        .style("color", "white")
                        .style("padding", "8px")
                        .style("border-radius", "4px")
                        .style("font-size", "12px")
                        .style("pointer-events", "none")
                        .style("z-index", "1000")
                        .html(`"${d.text}" appears ${d.size} times`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this).attr("opacity", 0.8);
                    d3.selectAll(".word-tooltip").remove();
                });
        });

        console.log("📊 Word cloud created with", wordArray.length, "words");
        console.log("🎯 Total placed words:", placedWords.length);
    }

    function updateWordCloud(container, directCommunications, indirectCommunications, selectedPerson) {
        console.log(`🔄 Updating word cloud for: ${selectedPerson || "all messages"}`);
        
        // Actualizar el título
        container.select("h3").text(
            selectedPerson ? `Keywords: ${selectedPerson}` : "Message Keywords"
        );
        
        // Find the wordcloud container or create it
        let wordcloudDiv = container.select(".wordcloud-container");
        if (wordcloudDiv.empty()) {
            wordcloudDiv = container.append("div")
                .attr("class", "wordcloud-container")
                .style("width", "100%")
                .style("height", "100%")
                .style("display", "flex")
                .style("align-items", "center")
                .style("justify-content", "center");
        }
        
        // Generate new wordcloud with filter
        generateWordCloudImage(selectedPerson, wordcloudDiv, null);
    }

    // Removed duplicate createWordCloud function - now handled by the earlier implementation

    function createWordCloudContent(container, directCommunications, indirectCommunications) {
        console.log("🔧 Creating word cloud...", { 
            directComms: directCommunications.length, 
            indirectComms: indirectCommunications.length 
        });
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Extraer texto de todas las comunicaciones
        const allCommunications = [...directCommunications, ...indirectCommunications];
        const allText = allCommunications
            .map(comm => comm.content || "")
            .join(" ");

        // Crear una semilla determinística basada en el contenido
        const contentHash = allText.split('').reduce((hash, char) => {
            return ((hash << 5) - hash + char.charCodeAt(0)) & 0xffffffff;
        }, 0);

        // Palabras a filtrar (stopwords y palabras comunes)
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
            'here', 'there', 'where', 'when', 'why', 'how', 'what', 'who', 'which',
            'from', 'up', 'out', 'down', 'off', 'over', 'under', 'again', 'further',
            'then', 'once', 'now', 'very', 'too', 'also', 'just', 'more', 'most', 'other'
        ]);

        // Procesar texto y contar palabras
        const words = allText
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopwords.has(word))
            .reduce((acc, word) => {
                acc[word] = (acc[word] || 0) + 1;
                return acc;
            }, {});

        // Convertir a array y ordenar por frecuencia
        const wordArray = Object.entries(words)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 150) // Top 150 palabras para mayor densidad
            .map(([word, count]) => ({ text: word, size: count }));

        if (wordArray.length === 0) {
            container.append("div")
                .style("padding", "20px")
                .style("text-align", "center")
                .style("color", "#6b7280")
                .text("No keywords found in messages");
            return;
        }

        // Configurar dimensiones
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const width = containerRect.width - margin.left - margin.right;
        const height = 600;

        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left + width/2},${margin.top + height/2})`);

        // Escalas para tamaño de texto
        const maxCount = Math.max(...wordArray.map(d => d.size));
        const minCount = Math.min(...wordArray.map(d => d.size));
        
        const fontSizeScale = d3.scaleLinear()
            .domain([minCount, maxCount])
            .range([isSmallScreen ? 6 : 8, isSmallScreen ? 20 : 24]);

        // Colores para las palabras
        const colorScale = d3.scaleOrdinal()
            .range(['#4ecdc4', '#ff9f43', '#f59e0b', '#2563eb', '#dc2626', '#059669', '#7c3aed']);

        // Layout en forma de nube - distribución aleatoria pero organizada
        const maxRadius = Math.min(width, height) / 2 - 40;
        const centerWords = wordArray.slice(0, 8); // Más palabras importantes al centro
        const cloudWords = wordArray.slice(8); // Resto distribuido en nube
        
        // Función para verificar si hay colisión entre textos
        const placedWords = [];
        
        function getWordBounds(x, y, text, fontSize, isVertical = false) {
            if (isVertical) {
                // Para texto vertical, intercambiar dimensiones
                const textWidth = fontSize;
                const textHeight = text.length * fontSize * 0.6;
                return {
                    x1: x - textWidth/2,
                    x2: x + textWidth/2,
                    y1: y - textHeight/2,
                    y2: y + textHeight/2
                };
            } else {
                // Para texto horizontal
                const textWidth = text.length * fontSize * 0.6;
                const textHeight = fontSize;
                return {
                    x1: x - textWidth/2,
                    x2: x + textWidth/2,
                    y1: y - textHeight/2,
                    y2: y + textHeight/2
                };
            }
        }
        
        function isColliding(bounds1, bounds2, padding = 2) {
            return !(bounds1.x2 + padding < bounds2.x1 || 
                     bounds2.x2 + padding < bounds1.x1 || 
                     bounds1.y2 + padding < bounds2.y1 || 
                     bounds2.y2 + padding < bounds1.y1);
        }
        
        function findNonCollidingPosition(text, fontSize, wordIndex) {
            console.log(`🔍 Positioning word: "${text}" (index: ${wordIndex})`);
            
            // Generar hash simple para esta palabra
            let wordHash = 0;
            for (let i = 0; i < text.length; i++) {
                wordHash = ((wordHash << 5) - wordHash + text.charCodeAt(i)) & 0xffffffff;
            }
            wordHash = Math.abs(wordHash + contentHash + wordIndex) || 1;
            
            // Generador determinístico simple
            let seed = wordHash;
            function seededRandom() {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            }
            
            // Determinar orientación determinísticamente
            const randomValue = seededRandom();
            const isVertical = randomValue < 0.3; // 30% vertical, 70% horizontal
            console.log(`🎯 Word "${text}": random=${randomValue.toFixed(3)}, isVertical=${isVertical}`);
            
            // Intentar posiciones en espiral mejorado
            const maxR = Math.min(width, height) / 2 - 60;
            let radius = 20;
            let angle = seededRandom() * 2 * Math.PI;
            const angleStep = 0.2;
            const radiusStep = 6;
            
            for (let attempt = 0; attempt < 150; attempt++) {
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius * 0.7;
                
                const bounds = getWordBounds(x, y, text, fontSize, isVertical);
                
                // Verificar colisiones con padding más grande
                let hasCollision = false;
                for (const placed of placedWords) {
                    if (isColliding(bounds, placed.bounds, 8)) {
                        hasCollision = true;
                        break;
                    }
                }
                
                if (!hasCollision) {
                    console.log(`✅ Found position for "${text}" at (${x.toFixed(1)}, ${y.toFixed(1)}) - ${isVertical ? 'VERTICAL' : 'HORIZONTAL'}`);
                    return { x, y, bounds, isVertical };
                }
                
                // Siguiente posición en espiral más denso
                angle += angleStep;
                if (attempt % 6 === 0) {
                    radius += radiusStep;
                }
                if (attempt % 12 === 0) {
                    angle = seededRandom() * 2 * Math.PI; // Reset angle occasionally
                }
                
                // Si el radio es muy grande, resetear
                if (radius > maxR) {
                    radius = 20;
                    angle += Math.PI / 6; // Offset angle
                }
            }
            
            // Fallback simple
            const fallbackAngle = seededRandom() * 2 * Math.PI;
            const fallbackRadius = maxR * 0.8;
            const x = Math.cos(fallbackAngle) * fallbackRadius;
            const y = Math.sin(fallbackAngle) * fallbackRadius * 0.7;
            
            console.log(`⚠️ Using fallback position for "${text}"`);
            return { 
                x, 
                y, 
                bounds: getWordBounds(x, y, text, fontSize, isVertical), 
                isVertical 
            };
        }

        // Posicionar palabras centrales primero (más importantes)
        centerWords.forEach((d, i) => {
            const fontSize = fontSizeScale(d.size);
            const angle = (i * 2 * Math.PI) / centerWords.length;
            const radius = 30 + i * 10;
            
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            // Determinar orientación para palabras centrales también
            const centerHash = d.text.length * 100 + (i * 50);
            const isVertical = (centerHash % 10) < 3; // 30% vertical para centrales
            
            const bounds = getWordBounds(x, y, d.text, fontSize, isVertical);
            
            placedWords.push({ bounds });
            
            g.append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", "middle")
                .attr("font-size", fontSize + "px")
                .attr("font-weight", "700")
                .attr("fill", colorScale(i))
                .attr("opacity", 0.9)
                .style("cursor", "pointer")
                .style("writing-mode", isVertical ? "vertical-rl" : "horizontal-tb")
                .text(d.text)
                .on("mouseover", function(event) {
                    d3.select(this).attr("opacity", 1).attr("font-weight", "800");
                    
                    const tooltip = d3.select("body").append("div")
                        .attr("class", "word-tooltip")
                        .style("position", "absolute")
                        .style("background", "rgba(0, 0, 0, 0.8)")
                        .style("color", "white")
                        .style("padding", "8px")
                        .style("border-radius", "4px")
                        .style("font-size", "12px")
                        .style("pointer-events", "none")
                        .style("z-index", "1000")
                        .html(`"${d.text}" appears ${d.size} times`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this).attr("opacity", 0.9).attr("font-weight", "700");
                    d3.selectAll(".word-tooltip").remove();
                });
        });

        // Posicionar el resto de palabras en forma de nube
        cloudWords.forEach((d, i) => {
            const fontSize = fontSizeScale(d.size);
            const position = findNonCollidingPosition(d.text, fontSize, i + centerWords.length);
            
            placedWords.push({ bounds: position.bounds });
            
            g.append("text")
                .attr("x", position.x)
                .attr("y", position.y)
                .attr("text-anchor", "middle")
                .attr("font-size", fontSize + "px")
                .attr("font-weight", "600")
                .attr("fill", colorScale(i + centerWords.length))
                .attr("opacity", 0.8)
                .style("cursor", "pointer")
                .style("writing-mode", position.isVertical ? "vertical-rl" : "horizontal-tb")
                .text(d.text)
                .on("mouseover", function(event) {
                    d3.select(this).attr("opacity", 1);
                    
                    const tooltip = d3.select("body").append("div")
                        .attr("class", "word-tooltip")
                        .style("position", "absolute")
                        .style("background", "rgba(0, 0, 0, 0.8)")
                        .style("color", "white")
                        .style("padding", "8px")
                        .style("border-radius", "4px")
                        .style("font-size", "12px")
                        .style("pointer-events", "none")
                        .style("z-index", "1000")
                        .html(`"${d.text}" appears ${d.size} times`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this).attr("opacity", 0.8);
                    d3.selectAll(".word-tooltip").remove();
                });
        });

        console.log("📊 Word cloud created with", wordArray.length, "words");
        console.log("🎯 Total placed words:", placedWords.length);
    }
    
    function createTimeSeriesChart(container, directCommunications, indirectCommunications, filterPerson) {
        console.log(`📈 Creating time series chart for ${filterPerson || 'all communications'}`);
        
        // Clear previous content
        container.selectAll("*:not(h3)").remove();
        
        // Variables responsive
        const isSmallScreen = window.innerWidth < 768;
        const isMediumScreen = window.innerWidth < 1024;
        
        // Configurar dimensiones
        const margin = {
            top: 20,
            right: isSmallScreen ? 60 : 80,
            bottom: isSmallScreen ? 40 : 60,
            left: isSmallScreen ? 40 : 60
        };
        
        const containerNode = container.node();
        const containerRect = containerNode.getBoundingClientRect();
        const width = containerRect.width - margin.left - margin.right - 40; // 40px para padding
        const height = 320 - margin.top - margin.bottom;
        
        // Crear SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .style("margin", "20px");
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
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
        
        if (timeSeriesData.length === 0) {
            container.append("div")
                .style("text-align", "center")
                .style("padding", "40px")
                .style("color", "#666")
                .text("No corruption events found in communications");
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
        
        // Dibujar líneas para cada corruption event
        Object.keys(corruption_events).forEach(eventType => {
            const eventData = timeSeriesData.map(d => ({
                date: d.date,
                value: d[eventType]
            }));
            
            // Solo dibujar líneas que tengan al menos un valor > 0
            const hasData = eventData.some(d => d.value > 0);
            if (!hasData) return;
            
            // Línea
            g.append("path")
                .datum(eventData)
                .attr("class", `line-${eventType.replace(/\s+/g, '-')}`)
                .attr("fill", "none")
                .attr("stroke", colorScale(eventType))
                .attr("stroke-width", 2)
                .attr("d", line);
            
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
                });
        });
        
        // Leyenda debajo del gráfico
        const legendItems = Object.keys(corruption_events).filter(eventType => {
            return timeSeriesData.some(d => d[eventType] > 0);
        });
        
        if (legendItems.length > 0) {
            // Crear contenedor HTML para la leyenda
            const legendContainer = container.append("div")
                .attr("class", "legend-container")
                .style("display", "flex")
                .style("flex-wrap", "wrap")
                .style("justify-content", "center")
                .style("gap", "15px")
                .style("margin-top", "15px")
                .style("padding", "10px")
                .style("background", "#f8f9fa")
                .style("border-radius", "6px")
                .style("margin-left", "20px")
                .style("margin-right", "20px");
            
            legendItems.forEach(eventType => {
                const legendItem = legendContainer.append("div")
                    .style("display", "flex")
                    .style("align-items", "center")
                    .style("gap", "6px")
                    .style("font-size", "11px")
                    .style("color", "#374151");
                
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