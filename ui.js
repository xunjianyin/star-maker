// UI Controller for Star-Maker
class UIController {
    constructor(canvas, physicsEngine, presetSystems) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.physics = physicsEngine;
        this.presets = presetSystems;
        
        // Simulation state
        this.planets = [];
        this.isPaused = false;
        this.isPlacingPlanet = false;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectedPlanet = null;
        
        // Camera controls
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1,
            minZoom: 0.1,
            maxZoom: 5
        };
        
        // Performance tracking
        this.fps = 60;
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Settings
        this.settings = {
            showForces: true,
            showTrails: true,
            enableCollisions: true
        };
        
        this.initializeControls();
        this.initializeCanvas();
        this.loadSettings();
    }

    initializeCanvas() {
        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }

    initializeControls() {
        // Range inputs
        this.massSlider = document.getElementById('mass');
        this.densitySlider = document.getElementById('density');
        this.velocitySlider = document.getElementById('velocity');
        this.planetColor = document.getElementById('planet-color');
        
        // Unit selectors
        this.massUnit = document.getElementById('mass-unit');
        this.velocityUnit = document.getElementById('velocity-unit');
        
        // Buttons
        this.clearBtn = document.getElementById('clear-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.saveBtn = document.getElementById('save-btn');
        this.loadBtn = document.getElementById('load-btn');
        
        // Checkboxes
        this.showForcesCheck = document.getElementById('show-forces');
        this.showTrailsCheck = document.getElementById('show-trails');
        this.collisionsCheck = document.getElementById('collisions');
        
        // Preset buttons
        this.presetButtons = document.querySelectorAll('.preset-btn');
        
        // File input
        this.fileInput = document.getElementById('file-input');
        
        this.bindEventListeners();
        this.updateControlValues();
    }

    bindEventListeners() {
        // Range sliders
        this.massSlider.addEventListener('input', () => this.updateControlValues());
        this.densitySlider.addEventListener('input', () => this.updateControlValues());
        this.velocitySlider.addEventListener('input', () => this.updateControlValues());
        
        // Buttons
        this.clearBtn.addEventListener('click', () => this.clearAllPlanets());
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.resetBtn.addEventListener('click', () => this.resetSimulation());
        this.saveBtn.addEventListener('click', () => this.saveSystem());
        this.loadBtn.addEventListener('click', () => this.fileInput.click());
        
        // Checkboxes
        this.showForcesCheck.addEventListener('change', () => {
            this.settings.showForces = this.showForcesCheck.checked;
        });
        
        this.showTrailsCheck.addEventListener('change', () => {
            this.settings.showTrails = this.showTrailsCheck.checked;
        });
        
        this.collisionsCheck.addEventListener('change', () => {
            this.settings.enableCollisions = this.collisionsCheck.checked;
        });
        
        // Preset buttons
        this.presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                this.loadPreset(preset);
            });
        });
        
        // File input
        this.fileInput.addEventListener('change', (e) => this.loadSystemFromFile(e));
    }

    updateControlValues() {
        // Update displayed values
        document.getElementById('mass-value').textContent = this.massSlider.value;
        document.getElementById('density-value').textContent = this.densitySlider.value;
        document.getElementById('velocity-value').textContent = this.velocitySlider.value;
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldX = (x - this.camera.x * this.camera.zoom) / this.camera.zoom;
        const worldY = (y - this.camera.y * this.camera.zoom) / this.camera.zoom;
        
        return { x: worldX, y: worldY };
    }

    getTouchPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldX = (x - this.camera.x * this.camera.zoom) / this.camera.zoom;
        const worldY = (y - this.camera.y * this.camera.zoom) / this.camera.zoom;
        
        return { x: worldX, y: worldY };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        
        if (e.button === 0) { // Left click
            const clickedPlanet = this.findPlanetAtPosition(pos.x, pos.y);
            
            if (clickedPlanet) {
                this.selectedPlanet = clickedPlanet;
                this.isDragging = true;
                this.dragStart = { x: pos.x, y: pos.y };
            } else {
                this.createPlanet(pos.x, pos.y);
            }
        } else if (e.button === 2) { // Right click - pan
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY, isPan: true };
        }
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        
        if (this.isDragging) {
            if (this.dragStart.isPan) { // Right drag - pan camera
                const dx = e.clientX - this.dragStart.x;
                const dy = e.clientY - this.dragStart.y;
                
                this.camera.x += dx / this.camera.zoom;
                this.camera.y += dy / this.camera.zoom;
                
                this.dragStart = { x: e.clientX, y: e.clientY, isPan: true };
            } else if (this.selectedPlanet) { // Left drag - set velocity
                const dx = pos.x - this.dragStart.x;
                const dy = pos.y - this.dragStart.y;
                
                this.selectedPlanet.vx = dx * 0.5;
                this.selectedPlanet.vy = dy * 0.5;
                
                this.showVelocityIndicator(this.selectedPlanet, dx, dy);
            }
        }
    }

    handleMouseUp(e) {
        this.isDragging = false;
        this.selectedPlanet = null;
        this.hideVelocityIndicator();
    }

    handleWheel(e) {
        e.preventDefault();
        
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(this.camera.minZoom, 
                       Math.min(this.camera.maxZoom, this.camera.zoom * zoomFactor));
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Zoom towards mouse position
        this.camera.x -= (mouseX / newZoom - mouseX / this.camera.zoom);
        this.camera.y -= (mouseY / newZoom - mouseY / this.camera.zoom);
        this.camera.zoom = newZoom;
    }

    // Touch event handlers
    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const pos = this.getTouchPos(e);
            this.createPlanet(pos.x, pos.y);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        // Implement touch panning if needed
    }

    handleTouchEnd(e) {
        e.preventDefault();
    }

    findPlanetAtPosition(x, y) {
        return this.planets.find(planet => {
            const dx = planet.x - x;
            const dy = planet.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= planet.radius.visual;
        });
    }

    createPlanet(x, y) {
        const mass = this.physics.convertMass(
            parseFloat(this.massSlider.value), 
            this.massUnit.value
        );
        
        const density = parseFloat(this.densitySlider.value);
        
        const initialVelocityValue = parseFloat(this.velocitySlider.value);
        let vx = 0, vy = 0;
        
        if (initialVelocityValue > 0) {
            // Find the most massive body to use as reference for velocity scaling
            let centralBody = null;
            let maxMass = 0;
            
            this.planets.forEach(planet => {
                if (planet.mass > maxMass) {
                    maxMass = planet.mass;
                    centralBody = planet;
                }
            });
            
            if (centralBody) {
                const dx = x - centralBody.x;
                const dy = y - centralBody.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 10) {
                    // Calculate what the orbital velocity should be at this distance
                    const orbitalSpeed = this.physics.calculateOrbitalVelocity(centralBody, distance);
                    
                    let finalSpeed;
                    if (this.velocityUnit.value === 'orbital') {
                        // User value is a direct multiplier of orbital velocity
                        const velocityMultiplier = initialVelocityValue / 10; // Scale slider value (0-50) to (0-5)
                        finalSpeed = orbitalSpeed * velocityMultiplier;
                    } else {
                        // Convert from other units and scale to match physics
                        const velocity = this.physics.convertVelocity(initialVelocityValue, this.velocityUnit.value);
                        finalSpeed = velocity * 0.001; // Scale for physics simulation
                    }
                    
                    // Set velocity perpendicular to radius vector (tangential for circular orbit)
                    vx = (-dy / distance) * finalSpeed;
                    vy = (dx / distance) * finalSpeed;
                    
                    console.log(`Orbital speed at distance ${distance.toFixed(1)}: ${orbitalSpeed.toFixed(3)}, Final speed: ${finalSpeed.toFixed(3)}`);
                } else {
                    // Too close to central body, use a small horizontal velocity
                    vx = initialVelocityValue * 0.1;
                    vy = 0;
                }
            } else {
                // No central body found, use absolute velocity
                // Convert velocity and use a reasonable scale for free-floating objects
                const velocity = this.physics.convertVelocity(initialVelocityValue, this.velocityUnit.value);
                const scaledVelocity = velocity * 0.0001; // Much smaller scale for no-gravity scenarios
                vx = scaledVelocity;
                vy = 0;
            }
        } else {
            // Velocity is 0, suggest optimal orbital velocity
            const suggestedVel = this.physics.suggestOrbitalVelocity(this.planets, x, y);
            vx = suggestedVel.vx;
            vy = suggestedVel.vy;
        }
        
        const planet = {
            x,
            y,
            vx,
            vy,
            mass,
            density,
            color: this.planetColor.value,
            trail: [],
            id: Date.now() + Math.random(),
            fx: 0,
            fy: 0,
            forces: []
        };
        
        planet.radius = this.physics.calculateRadius(mass, density);
        this.planets.push(planet);
        
        this.updateInfoPanel();
        
        console.log(`Created planet at (${x.toFixed(1)}, ${y.toFixed(1)}) with velocity (${vx.toFixed(3)}, ${vy.toFixed(3)}) and radius ${planet.radius.visual.toFixed(1)}px`);
    }

    showVelocityIndicator(planet, dx, dy) {
        const indicator = document.getElementById('velocity-indicator');
        const rect = this.canvas.getBoundingClientRect();
        
        indicator.style.display = 'block';
        indicator.style.left = `${rect.left + planet.x}px`;
        indicator.style.top = `${rect.top + planet.y}px`;
        
        const velocity = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate what the orbital velocity should be for reference
        let referenceText = `Velocity: ${(velocity * 0.1).toFixed(1)} units`;
        
        // If there's a central body, show velocity as a multiplier of orbital velocity
        if (this.planets.length > 0) {
            let centralBody = null;
            let maxMass = 0;
            
            this.planets.forEach(p => {
                if (p !== planet && p.mass > maxMass) {
                    maxMass = p.mass;
                    centralBody = p;
                }
            });
            
            if (centralBody) {
                const distanceToCentral = Math.sqrt(
                    (planet.x - centralBody.x) ** 2 + 
                    (planet.y - centralBody.y) ** 2
                );
                
                if (distanceToCentral > 10) {
                    const orbitalSpeed = this.physics.calculateOrbitalVelocity(centralBody, distanceToCentral);
                    const currentSpeed = Math.sqrt(planet.vx ** 2 + planet.vy ** 2);
                    const multiplier = currentSpeed / orbitalSpeed;
                    
                    referenceText = `Velocity: ${multiplier.toFixed(2)}× orbital speed`;
                    if (multiplier < 0.8) {
                        referenceText += " (will fall)";
                    } else if (multiplier > 1.2) {
                        referenceText += " (will escape)";
                    } else {
                        referenceText += " (stable orbit)";
                    }
                }
            }
        }
        
        indicator.querySelector('.velocity-text').textContent = referenceText;
    }

    hideVelocityIndicator() {
        const indicator = document.getElementById('velocity-indicator');
        indicator.style.display = 'none';
    }

    clearAllPlanets() {
        this.planets = [];
        this.updateInfoPanel();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.pauseBtn.textContent = this.isPaused ? '▶️ Play' : '⏸️ Pause';
    }

    resetSimulation() {
        this.clearAllPlanets();
        this.camera = { x: 0, y: 0, zoom: 1, minZoom: 0.1, maxZoom: 5 };
        this.isPaused = false;
        this.pauseBtn.textContent = '⏸️ Pause';
    }

    loadPreset(presetName) {
        switch(presetName) {
            case 'solar':
                this.planets = this.presets.createSolarSystem(this.canvas.width, this.canvas.height);
                break;
            case 'binary':
                this.planets = this.presets.createBinaryStars(this.canvas.width, this.canvas.height);
                break;
            case 'asteroid':
                this.planets = this.presets.createAsteroidField(this.canvas.width, this.canvas.height);
                break;
            case 'galaxy':
                this.planets = this.presets.createMiniGalaxy(this.canvas.width, this.canvas.height);
                break;
        }
        this.updateInfoPanel();
    }

    saveSystem() {
        const systemData = {
            planets: this.planets,
            camera: this.camera,
            settings: this.settings,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(systemData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `star-system-${Date.now()}.json`;
        link.click();
    }

    loadSystemFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const systemData = JSON.parse(e.target.result);
                
                if (systemData.planets) {
                    this.planets = systemData.planets;
                }
                
                if (systemData.camera) {
                    this.camera = { ...this.camera, ...systemData.camera };
                }
                
                if (systemData.settings) {
                    this.settings = { ...this.settings, ...systemData.settings };
                    this.updateSettingsUI();
                }
                
                this.updateInfoPanel();
            } catch (error) {
                alert('Error loading system file: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    }

    updateSettingsUI() {
        this.showForcesCheck.checked = this.settings.showForces;
        this.showTrailsCheck.checked = this.settings.showTrails;
        this.collisionsCheck.checked = this.settings.enableCollisions;
    }

    updateInfoPanel() {
        // Update planet count
        document.getElementById('planet-count').textContent = `Planets: ${this.planets.length}`;
        
        // Calculate total mass
        const totalMass = this.planets.reduce((sum, planet) => sum + planet.mass, 0);
        const totalMassEarth = totalMass / this.physics.earthMass;
        document.getElementById('total-mass').textContent = 
            `Total Mass: ${totalMassEarth.toFixed(2)} Earth Masses`;
        
        // Energy display
        document.getElementById('kinetic-energy').textContent = 
            `Kinetic Energy: ${(this.physics.totalKineticEnergy / 1e30).toFixed(2)}×10³⁰ J`;
        document.getElementById('potential-energy').textContent = 
            `Potential Energy: ${(this.physics.totalPotentialEnergy / 1e30).toFixed(2)}×10³⁰ J`;
    }

    updateFPS(deltaTime) {
        this.frameCount++;
        if (this.frameCount % 10 === 0) {
            this.fps = Math.round(1000 / deltaTime);
            document.getElementById('fps-counter').textContent = `FPS: ${this.fps}`;
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('star-maker-settings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
                this.updateSettingsUI();
            } catch (e) {
                console.warn('Could not load saved settings');
            }
        }
    }

    saveSettings() {
        localStorage.setItem('star-maker-settings', JSON.stringify(this.settings));
    }

    // Rendering methods
    render() {
        this.ctx.save();
        
        // Clear canvas with space background
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply camera transform
        this.ctx.translate(this.camera.x * this.camera.zoom, this.camera.y * this.camera.zoom);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        
        // Draw starfield background
        this.drawStarfield();
        
        // Draw orbital trails
        if (this.settings.showTrails) {
            this.drawOrbitalTrails();
        }
        
        // Draw gravitational force vectors
        if (this.settings.showForces) {
            this.drawForceVectors();
        }
        
        // Draw planets
        this.drawPlanets();
        
        this.ctx.restore();
    }

    drawStarfield() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        
        // Fixed starfield that doesn't move with camera
        for (let i = 0; i < 100; i++) {
            const x = (i * 31) % (this.canvas.width / this.camera.zoom);
            const y = (i * 47) % (this.canvas.height / this.camera.zoom);
            this.ctx.fillRect(x - this.camera.x, y - this.camera.y, 1, 1);
        }
    }

    drawOrbitalTrails() {
        this.planets.forEach(planet => {
            if (planet.trail && planet.trail.length > 1) {
                this.ctx.strokeStyle = planet.color + '60'; // Add transparency
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                
                planet.trail.forEach((point, index) => {
                    if (index === 0) {
                        this.ctx.moveTo(point.x, point.y);
                    } else {
                        this.ctx.lineTo(point.x, point.y);
                    }
                });
                
                this.ctx.stroke();
            }
        });
    }

    drawForceVectors() {
        this.planets.forEach(planet => {
            if (planet.forces) {
                planet.forces.forEach(force => {
                    const magnitude = Math.sqrt(force.fx * force.fx + force.fy * force.fy);
                    if (magnitude > 0.1) {
                        const scale = Math.min(50, magnitude * 1e10);
                        const endX = planet.x + force.fx * scale;
                        const endY = planet.y + force.fy * scale;
                        
                        this.drawArrow(planet.x, planet.y, endX, endY, '#00ff88');
                    }
                });
            }
        });
    }

    drawArrow(startX, startY, endX, endY, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        
        // Main line
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        // Arrowhead
        const headSize = 5;
        const angle = Math.atan2(endY - startY, endX - startX);
        
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(
            endX - headSize * Math.cos(angle - Math.PI / 6),
            endY - headSize * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(
            endX - headSize * Math.cos(angle + Math.PI / 6),
            endY - headSize * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
    }

    drawPlanets() {
        this.planets.forEach(planet => {
            // Planet body
            this.ctx.fillStyle = planet.color;
            this.ctx.beginPath();
            this.ctx.arc(planet.x, planet.y, planet.radius.visual, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Planet outline
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Planet glow effect
            const gradient = this.ctx.createRadialGradient(
                planet.x, planet.y, 0,
                planet.x, planet.y, planet.radius.visual * 2
            );
            gradient.addColorStop(0, planet.color + '40');
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(planet.x, planet.y, planet.radius.visual * 2, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }
} 