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