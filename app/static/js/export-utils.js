/**
 * Export utilities for saving visualizations as SVG and PNG
 */

// Export functionality for visualizations
window.ExportUtils = {
    
    /**
     * Export SVG element as SVG file
     * @param {string} svgSelector - CSS selector for the SVG element
     * @param {string} filename - Name for the exported file
     */
    exportSVG: function(svgSelector, filename) {
        const svg = d3.select(svgSelector).node();
        if (!svg) {
            console.error('SVG element not found:', svgSelector);
            return;
        }
        
        // Clone the SVG to avoid modifying the original
        const svgClone = svg.cloneNode(true);
        
        // Add white background if not present
        this.addWhiteBackground(svgClone);
        
        // Add inline styles to preserve fonts and styling
        this.inlineStyles(svgClone);
        
        // Get SVG string with proper XML declaration and namespace
        const svgString = this.getSVGString(svgClone);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        
        // Create download link
        const url = URL.createObjectURL(svgBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'visualization.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
    
    /**
     * Export SVG element as PNG file
     * @param {string} svgSelector - CSS selector for the SVG element
     * @param {string} filename - Name for the exported file
     * @param {number} scale - Scale factor for PNG resolution (default: 2)
     */
    exportPNG: function(svgSelector, filename, scale = 2) {
        const svg = d3.select(svgSelector).node();
        if (!svg) {
            console.error('SVG element not found:', svgSelector);
            return;
        }
        
        // Clone the SVG to avoid modifying the original
        const svgClone = svg.cloneNode(true);
        
        // Add white background if not present
        this.addWhiteBackground(svgClone);
        
        // Add inline styles to preserve fonts and styling
        this.inlineStyles(svgClone);
        
        // Get SVG dimensions
        const svgRect = svg.getBoundingClientRect();
        const width = svgRect.width * scale;
        const height = svgRect.height * scale;
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Create image from SVG
        const img = new Image();
        const svgString = this.getSVGString(svgClone);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = function() {
            // Draw image on canvas
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert canvas to PNG blob
            canvas.toBlob(function(blob) {
                const pngUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = pngUrl;
                link.download = filename || 'visualization.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(pngUrl);
            }, 'image/png');
            
            URL.revokeObjectURL(url);
        };
        
        img.onerror = function() {
            console.error('Failed to load SVG for PNG export');
            URL.revokeObjectURL(url);
        };
        
        img.src = url;
    },
    
    /**
     * Add white background to SVG if not present
     * @param {SVGElement} svg - SVG element to modify
     */
    addWhiteBackground: function(svg) {
        // Check if background already exists
        const existingBackground = svg.querySelector('rect[data-background="true"]');
        if (existingBackground) return;
        
        // Get SVG dimensions from viewBox or width/height
        let width, height;
        if (svg.viewBox && svg.viewBox.baseVal) {
            width = svg.viewBox.baseVal.width;
            height = svg.viewBox.baseVal.height;
        } else {
            width = svg.getAttribute('width') || svg.getBoundingClientRect().width || 800;
            height = svg.getAttribute('height') || svg.getBoundingClientRect().height || 600;
        }
        
        // Create white background rectangle
        const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        background.setAttribute('width', width);
        background.setAttribute('height', height);
        background.setAttribute('fill', 'white');
        background.setAttribute('data-background', 'true');
        
        // Insert at the beginning
        svg.insertBefore(background, svg.firstChild);
    },
    
    /**
     * Inline CSS styles into SVG elements to preserve fonts and styling
     * @param {SVGElement} svg - SVG element to modify
     */
    inlineStyles: function(svg) {
        // Get all stylesheets
        const styleSheets = Array.from(document.styleSheets);
        const styles = {};
        
        // Extract relevant styles
        styleSheets.forEach(sheet => {
            try {
                const rules = Array.from(sheet.cssRules || sheet.rules || []);
                rules.forEach(rule => {
                    if (rule.type === CSSRule.STYLE_RULE) {
                        const selector = rule.selectorText;
                        const cssText = rule.style.cssText;
                        if (cssText) {
                            styles[selector] = cssText;
                        }
                    }
                });
            } catch (e) {
                // Cross-origin stylesheets may throw errors
                console.warn('Cannot access stylesheet:', e);
            }
        });
        
        // Apply computed styles to elements
        const allElements = svg.querySelectorAll('*');
        allElements.forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const inlineStyle = [];
            
            // Key properties that affect appearance
            const importantProperties = [
                'font-family', 'font-size', 'font-weight', 'font-style',
                'fill', 'stroke', 'stroke-width', 'opacity',
                'text-anchor', 'dominant-baseline', 'alignment-baseline'
            ];
            
            importantProperties.forEach(prop => {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'normal') {
                    inlineStyle.push(`${prop}: ${value}`);
                }
            });
            
            if (inlineStyle.length > 0) {
                const currentStyle = element.getAttribute('style') || '';
                element.setAttribute('style', currentStyle + '; ' + inlineStyle.join('; '));
            }
        });
    },
    
    /**
     * Get properly formatted SVG string with XML declaration and namespace
     * @param {SVGElement} svg - SVG element
     * @returns {string} Formatted SVG string
     */
    getSVGString: function(svg) {
        // Ensure proper namespace
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        
        // Serialize SVG
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        
        // Add XML declaration
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
    },
    
    /**
     * Get current visualization name from active tab
     */
    getCurrentVisualizationName: function() {
        const activeTab = document.querySelector('.nav-link.active');
        return activeTab ? activeTab.dataset.vizName : 'visualization';
    },
    
    /**
     * Find SVG elements in the current active visualization
     */
    findVisualizationSVGs: function() {
        const vizName = this.getCurrentVisualizationName();
        const activeTabContent = document.querySelector(`#${vizName}`);
        
        if (!activeTabContent) return [];
        
        // Find all SVG elements in the active tab
        const svgs = activeTabContent.querySelectorAll('svg');
        return Array.from(svgs).map((svg, index) => ({
            element: svg,
            selector: `#${vizName} svg:nth-of-type(${index + 1})`,
            name: this.generateSVGName(svg, vizName, index)
        }));
    },
    
    /**
     * Generate appropriate name for SVG based on its container or ID
     */
    generateSVGName: function(svg, vizName, index) {
        // Try to get a meaningful name from the SVG's parent container
        const parent = svg.parentElement;
        if (parent && parent.id) {
            // Clean up the ID to make it more readable
            const cleanId = parent.id.replace(/[^a-zA-Z0-9-]/g, '_');
            return `${vizName}_${cleanId}`;
        }
        
        // Look for data attributes or class names that might indicate purpose
        if (svg.dataset && svg.dataset.name) {
            return `${vizName}_${svg.dataset.name}`;
        }
        
        if (svg.classList.length > 0) {
            const className = Array.from(svg.classList).find(cls => 
                cls.includes('chart') || cls.includes('graph') || cls.includes('plot')
            );
            if (className) {
                return `${vizName}_${className}`;
            }
        }
        
        // Try to infer from common visualization container patterns
        const containers = ['vis', 'chart', 'graph', 'plot', 'legend', 'density'];
        for (const container of containers) {
            if (parent && parent.id && parent.id.includes(container)) {
                return `${vizName}_${container}`;
            }
        }
        
        // Use index if no meaningful name found
        return `${vizName}_part_${index + 1}`;
    }
};

// Global variables for export state
let currentExportType = null;
let currentExportSVGs = [];

// Main export dialog function
window.showExportDialog = function(exportType) {
    console.log('showExportDialog called with type:', exportType);
    currentExportType = exportType;
    currentExportSVGs = window.ExportUtils.findVisualizationSVGs();
    
    console.log('Found SVGs:', currentExportSVGs.length);
    
    if (currentExportSVGs.length === 0) {
        alert('No visualizations found to export');
        return;
    }
    
    if (currentExportSVGs.length === 1) {
        // Single SVG - export directly
        console.log('Single SVG found, exporting directly');
        exportSingleVisualization(0);
        return;
    }
    
    // Multiple SVGs - show selection modal
    console.log('Multiple SVGs found, showing modal');
    try {
        populateExportModal();
        const modalElement = document.getElementById('exportModal');
        if (!modalElement) {
            console.error('Export modal element not found');
            alert('Export modal not available. Please refresh the page.');
            return;
        }
        
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    } catch (error) {
        console.error('Error showing modal:', error);
        alert('Error showing export dialog. Please refresh the page.');
    }
};

// Populate the export modal with visualization options
function populateExportModal() {
    const vizList = document.getElementById('visualizationList');
    vizList.innerHTML = '';
    
    currentExportSVGs.forEach((svg, index) => {
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action';
        item.innerHTML = `
            <div class="form-check">
                <input class="form-check-input" type="radio" name="vizSelection" id="viz${index}" value="${index}">
                <label class="form-check-label w-100" for="viz${index}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${svg.name}</h6>
                            <small class="text-muted">Container: ${svg.element.parentElement?.id || 'unnamed'}</small>
                        </div>
                        <small class="text-muted">${Math.round(svg.element.getBoundingClientRect().width)}×${Math.round(svg.element.getBoundingClientRect().height)}px</small>
                    </div>
                </label>
            </div>
        `;
        vizList.appendChild(item);
    });
    
    // Select first option by default
    if (currentExportSVGs.length > 0) {
        document.getElementById('viz0').checked = true;
    }
    
    // Update modal title based on export type
    const modalTitle = document.getElementById('exportModalLabel');
    const typeText = currentExportType === 'svg' ? 'SVG' : 
                    currentExportType === 'png-hd' ? 'High-res PNG' : 'PNG';
    modalTitle.textContent = `Export as ${typeText}`;
}

// Export the selected visualization
window.exportSelected = function() {
    console.log('exportSelected called');
    const selectedRadio = document.querySelector('input[name="vizSelection"]:checked');
    if (!selectedRadio) {
        alert('Please select a visualization to export');
        return;
    }
    
    const index = parseInt(selectedRadio.value);
    console.log('Selected index:', index, 'Export type:', currentExportType);
    
    // Close modal first to avoid any interference
    const modal = bootstrap.Modal.getInstance(document.getElementById('exportModal'));
    if (modal) {
        modal.hide();
    }
    
    // Small delay to ensure modal is closed before export
    setTimeout(() => {
        exportSingleVisualization(index);
    }, 100);
};

// Export a single visualization by index
function exportSingleVisualization(index) {
    console.log('exportSingleVisualization called with index:', index);
    console.log('Available SVGs:', currentExportSVGs.length);
    
    if (index < 0 || index >= currentExportSVGs.length) {
        console.error('Invalid visualization index:', index);
        return;
    }
    
    const svg = currentExportSVGs[index];
    console.log('Selected SVG:', svg);
    
    try {
        switch (currentExportType) {
            case 'svg':
                const svgName = `${svg.name}.svg`;
                console.log('Exporting SVG as:', svgName);
                window.ExportUtils.exportSVG(svg.selector, svgName);
                break;
            case 'png':
                const pngName = `${svg.name}.png`;
                console.log('Exporting PNG as:', pngName);
                window.ExportUtils.exportPNG(svg.selector, pngName, 2);
                break;
            case 'png-hd':
                const hdPngName = `${svg.name}_hd.png`;
                console.log('Exporting HD PNG as:', hdPngName);
                window.ExportUtils.exportPNG(svg.selector, hdPngName, 4);
                break;
            default:
                console.error('Unknown export type:', currentExportType);
        }
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed. Please check the console for details.');
    }
}

// Legacy functions for backward compatibility
window.exportVisualizationSVG = function() {
    showExportDialog('svg');
};

window.exportVisualizationPNG = function(filename, scale = 2) {
    const exportType = scale > 2 ? 'png-hd' : 'png';
    showExportDialog(exportType);
};