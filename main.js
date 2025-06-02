// Main application entry point for Star-Maker
class StarMakerApp {
    constructor() {
        // Get canvas element
        this.canvas = document.getElementById('simulation-canvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found!');
        }

        // Initialize core components
        this.physics = new PhysicsEngine();
        this.presets = new PresetSystems(this.physics);
        this.ui = new UIController(this.canvas, this.physics, this.presets);
        
        // Animation state
        this.animationId = null;
        this.lastTime = 0;
        this.isRunning = false;
        
        // Performance monitoring
        this.frameCount = 0;
        this.fpsUpdateInterval = 1000; // Update FPS every second
        this.lastFpsUpdate = 0;
        
        // Initialize application
        this.init();
    }

    init() {
        console.log('🌟 Initializing Star-Maker...');
        
        // Set up initial state
        this.ui.resizeCanvas();
        
        // Add keyboard shortcuts
        this.setupKeyboardControls();
        
        // Start the simulation
        this.start();
        
        console.log('✨ Star-Maker initialized successfully!');
        
        // Show welcome message
        this.showWelcomeMessage();
    }

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.ui.togglePause();
                    break;
                    
                case 'KeyC':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.ui.clearAllPlanets();
                    }
                    break;
                    
                case 'KeyR':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.ui.resetSimulation();
                    }
                    break;
                    
                case 'KeyS':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.ui.saveSystem();
                    }
                    break;
                    
                case 'KeyF':
                    e.preventDefault();
                    this.ui.settings.showForces = !this.ui.settings.showForces;
                    this.ui.showForcesCheck.checked = this.ui.settings.showForces;
                    break;
                    
                case 'KeyT':
                    e.preventDefault();
                    this.ui.settings.showTrails = !this.ui.settings.showTrails;
                    this.ui.showTrailsCheck.checked = this.ui.settings.showTrails;
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    this.ui.selectedPlanet = null;
                    this.ui.isDragging = false;
                    this.ui.hideVelocityIndicator();
                    break;
                    
                case 'Digit1':
                    this.ui.loadPreset('solar');
                    break;
                    
                case 'Digit2':
                    this.ui.loadPreset('binary');
                    break;
                    
                case 'Digit3':
                    this.ui.loadPreset('asteroid');
                    break;
                    
                case 'Digit4':
                    this.ui.loadPreset('galaxy');
                    break;
            }
        });
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.animate();
        }
    }

    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    animate(currentTime = performance.now()) {
        if (!this.isRunning) return;

        // Calculate delta time
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update simulation if not paused
        if (!this.ui.isPaused) {
            this.update(deltaTime);
        }

        // Render frame
        this.render();

        // Update performance counters
        this.updatePerformance(currentTime, deltaTime);

        // Schedule next frame
        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    update(deltaTime) {
        // Run physics simulation
        this.ui.planets = this.physics.simulateStep(this.ui.planets, {
            enableCollisions: this.ui.settings.enableCollisions
        });

        // Update UI information
        this.ui.updateInfoPanel();
        
        // Auto-save settings periodically
        if (this.frameCount % 600 === 0) { // Every 10 seconds at 60fps
            this.ui.saveSettings();
        }
    }

    render() {
        // Clear and render the scene
        this.ui.render();
    }

    updatePerformance(currentTime, deltaTime) {
        this.frameCount++;
        
        // Update FPS counter
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.ui.updateFPS(deltaTime);
            this.lastFpsUpdate = currentTime;
        }
        
        // Performance monitoring
        if (deltaTime > 33) { // More than 30fps drop
            console.warn(`Performance warning: Frame took ${deltaTime.toFixed(2)}ms`);
        }
    }

    showWelcomeMessage() {
        // Create welcome overlay
        const welcome = document.createElement('div');
        welcome.id = 'welcome-overlay';
        welcome.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(10px);
            color: white;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            text-align: center;
            max-width: 600px;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;

        content.innerHTML = `
            <h2 style="font-size: 2.5em; margin-bottom: 20px; background: linear-gradient(45deg, #4a90e2, #9c27b0, #e91e63); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ✨ Welcome to Star-Maker!
            </h2>
            <p style="font-size: 1.2em; margin-bottom: 20px; opacity: 0.9;">
                Create your own planetary systems with realistic physics!
            </p>
            <div style="text-align: left; margin: 20px 0; font-size: 0.95em;">
                <h3 style="color: #4a90e2; margin-bottom: 15px;">🎮 Quick Start:</h3>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin: 8px 0;">• <strong>Left Click:</strong> Create planets</li>
                    <li style="margin: 8px 0;">• <strong>Drag Planets:</strong> Set initial velocity</li>
                    <li style="margin: 8px 0;">• <strong>Right Click + Drag:</strong> Pan view</li>
                    <li style="margin: 8px 0;">• <strong>Mouse Wheel:</strong> Zoom in/out</li>
                    <li style="margin: 8px 0;">• <strong>Try Presets:</strong> Solar System, Binary Stars, etc.</li>
                </ul>
                <h3 style="color: #4a90e2; margin: 15px 0;">⌨️ Keyboard Shortcuts:</h3>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin: 5px 0;">• <strong>Space:</strong> Pause/Play</li>
                    <li style="margin: 5px 0;">• <strong>F:</strong> Toggle force vectors</li>
                    <li style="margin: 5px 0;">• <strong>T:</strong> Toggle orbital trails</li>
                    <li style="margin: 5px 0;">• <strong>1-4:</strong> Load presets</li>
                </ul>
            </div>
            <button id="start-button" style="
                background: linear-gradient(45deg, #4a90e2, #9c27b0);
                color: white;
                border: none;
                padding: 15px 30px;
                font-size: 1.1em;
                border-radius: 10px;
                cursor: pointer;
                margin-top: 20px;
                transition: transform 0.3s ease;
            ">
                🚀 Start Creating!
            </button>
        `;

        welcome.appendChild(content);
        document.body.appendChild(welcome);

        // Add button hover effect
        const button = content.querySelector('#start-button');
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 5px 15px rgba(74, 144, 226, 0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = 'none';
        });

        // Remove welcome overlay when clicked
        button.addEventListener('click', () => {
            welcome.style.opacity = '0';
            welcome.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                if (welcome.parentNode) {
                    welcome.parentNode.removeChild(welcome);
                }
            }, 500);
        });

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (welcome.parentNode) {
                button.click();
            }
        }, 10000);
    }

    // Public API methods
    addPlanet(x, y, properties = {}) {
        const planet = {
            x,
            y,
            vx: properties.vx || 0,
            vy: properties.vy || 0,
            mass: properties.mass || this.physics.earthMass,
            density: properties.density || 5.5,
            color: properties.color || '#4a90e2',
            trail: [],
            id: Date.now() + Math.random()
        };
        
        planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
        this.ui.planets.push(planet);
        this.ui.updateInfoPanel();
        
        return planet;
    }

    removePlanet(planetId) {
        const index = this.ui.planets.findIndex(p => p.id === planetId);
        if (index !== -1) {
            this.ui.planets.splice(index, 1);
            this.ui.updateInfoPanel();
            return true;
        }
        return false;
    }

    getPlanets() {
        return [...this.ui.planets];
    }

    clearSystem() {
        this.ui.clearAllPlanets();
    }

    pauseSimulation() {
        this.ui.isPaused = true;
        this.ui.pauseBtn.textContent = '▶️ Play';
    }

    resumeSimulation() {
        this.ui.isPaused = false;
        this.ui.pauseBtn.textContent = '⏸️ Pause';
    }

    // Error handling
    handleError(error) {
        console.error('Star-Maker Error:', error);
        
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #e74c3c;
            color: white;
            padding: 15px;
            border-radius: 10px;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 5px 15px rgba(231, 76, 60, 0.3);
        `;
        
        errorDiv.innerHTML = `
            <strong>⚠️ Error:</strong><br>
            ${error.message || 'An unexpected error occurred'}
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Global error handling
window.addEventListener('error', (e) => {
    if (window.starMaker) {
        window.starMaker.handleError(e.error);
    }
});

window.addEventListener('unhandledrejection', (e) => {
    if (window.starMaker) {
        window.starMaker.handleError(new Error(e.reason));
    }
});

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Create global app instance
        window.starMaker = new StarMakerApp();
        
        // Add to global scope for debugging
        if (typeof window !== 'undefined') {
            window.StarMaker = {
                app: window.starMaker,
                physics: window.starMaker.physics,
                ui: window.starMaker.ui,
                presets: window.starMaker.presets
            };
        }
        
        console.log('🌟 Star-Maker is ready! Access via window.StarMaker for debugging.');
        
    } catch (error) {
        console.error('Failed to initialize Star-Maker:', error);
        
        // Show fallback error message
        document.body.innerHTML = `
            <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
                color: white;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
            ">
                <div>
                    <h1 style="color: #e74c3c; margin-bottom: 20px;">⚠️ Initialization Error</h1>
                    <p>Failed to load Star-Maker. Please refresh the page and try again.</p>
                    <p style="opacity: 0.7; margin-top: 10px;">Error: ${error.message}</p>
                    <button onclick="location.reload()" style="
                        background: #4a90e2;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-top: 20px;
                    ">
                        🔄 Reload Page
                    </button>
                </div>
            </div>
        `;
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StarMakerApp;
} 