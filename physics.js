// Physics Engine for Star-Maker
class PhysicsEngine {
    constructor() {
        // Physical constants
        this.G = 6.67430e-11; // Gravitational constant
        this.earthMass = 5.972e24; // kg
        this.earthRadius = 6.371e6; // meters
        this.AU = 1.496e11; // Astronomical unit in meters
        
        // Simulation parameters
        this.timeStep = 0.016; // 60 FPS
        this.scaleFactor = 1e-9; // Scale for visualization
        this.velocityScale = 1000; // Velocity scaling for visualization
        
        // Energy calculation
        this.totalKineticEnergy = 0;
        this.totalPotentialEnergy = 0;
    }

    // Convert units for display and calculation
    convertMass(value, unit) {
        switch(unit) {
            case 'earth': return value * this.earthMass;
            case 'kg': return value * 1e24;
            case 'sun': return value * 1.989e30;
            default: return value * this.earthMass;
        }
    }

    convertVelocity(value, unit) {
        switch(unit) {
            case 'kms': return value * 1000;
            case 'ms': return value;
            case 'orbital': return value * 29780; // Earth's orbital velocity
            default: return value * 1000;
        }
    }

    // Calculate radius from mass and density
    calculateRadius(mass, density) {
        // density in g/cm³, convert to kg/m³
        const densityKgM3 = density * 1000;
        // Volume = mass / density
        const volume = mass / densityKgM3;
        // radius = (3V / 4π)^(1/3)
        const radius = Math.pow((3 * volume) / (4 * Math.PI), 1/3);
        
        // Scale for visualization (minimum 3 pixels, maximum 80 pixels)
        // Use a better scaling approach
        const earthRadius = 6.371e6; // Earth radius in meters
        const relativeRadius = radius / earthRadius; // Relative to Earth
        const baseSize = 8; // Base size in pixels
        const visualRadius = Math.max(3, Math.min(80, baseSize * Math.pow(relativeRadius, 0.3)));
        
        return { actual: radius, visual: visualRadius };
    }

    // Calculate gravitational force between two bodies
    calculateGravitationalForce(body1, body2) {
        const dx = body2.x - body1.x;
        const dy = body2.y - body1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Avoid division by zero and extreme forces
        if (distance < (body1.radius.visual + body2.radius.visual) || distance < 1) {
            return { fx: 0, fy: 0, distance };
        }
        
        // Use gravitational force formula: F = G * m1 * m2 / r²
        // Scale masses and distance for screen coordinates
        const m1 = body1.mass / this.earthMass; // Mass in Earth masses
        const m2 = body2.mass / this.earthMass;
        const G_scaled = 50; // Tuned gravitational constant for visualization
        
        const force = G_scaled * m1 * m2 / (distance * distance);
        
        // Force components (unit vector * force magnitude)
        const fx = force * (dx / distance);
        const fy = force * (dy / distance);
        
        return { fx, fy, distance };
    }

    // Apply gravitational forces to all bodies (N-body problem)
    applyGravitationalForces(planets) {
        // Reset forces
        planets.forEach(planet => {
            planet.fx = 0;
            planet.fy = 0;
            planet.forces = []; // Reset forces array for visualization
        });

        // Calculate forces between all pairs
        for (let i = 0; i < planets.length; i++) {
            for (let j = i + 1; j < planets.length; j++) {
                const force = this.calculateGravitationalForce(planets[i], planets[j]);
                
                // Apply Newton's third law (equal and opposite forces)
                planets[i].fx += force.fx;
                planets[i].fy += force.fy;
                planets[j].fx -= force.fx;
                planets[j].fy -= force.fy;
                
                // Store force data for visualization
                planets[i].forces.push({
                    target: planets[j],
                    fx: force.fx,
                    fy: force.fy,
                    magnitude: Math.sqrt(force.fx * force.fx + force.fy * force.fy)
                });
                
                planets[j].forces.push({
                    target: planets[i],
                    fx: -force.fx,
                    fy: -force.fy,
                    magnitude: Math.sqrt(force.fx * force.fx + force.fy * force.fy)
                });
            }
        }
    }

    // Check for collisions between planets
    checkCollisions(planets, enableCollisions) {
        if (!enableCollisions) return planets;

        const remaining = [];
        const collided = new Set();

        for (let i = 0; i < planets.length; i++) {
            if (collided.has(i)) continue;

            let currentPlanet = { ...planets[i] };
            let hasCollided = false;

            for (let j = i + 1; j < planets.length; j++) {
                if (collided.has(j)) continue;

                const dx = planets[j].x - currentPlanet.x;
                const dy = planets[j].y - currentPlanet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Check if planets are touching
                if (distance < (currentPlanet.radius.visual + planets[j].radius.visual)) {
                    // Perfectly inelastic collision - conserve momentum and mass
                    const totalMass = currentPlanet.mass + planets[j].mass;
                    
                    // New velocity (conservation of momentum)
                    const newVx = (currentPlanet.mass * currentPlanet.vx + planets[j].mass * planets[j].vx) / totalMass;
                    const newVy = (currentPlanet.mass * currentPlanet.vy + planets[j].mass * planets[j].vy) / totalMass;
                    
                    // New position (center of mass)
                    const newX = (currentPlanet.mass * currentPlanet.x + planets[j].mass * planets[j].x) / totalMass;
                    const newY = (currentPlanet.mass * currentPlanet.y + planets[j].mass * planets[j].y) / totalMass;
                    
                    // Create merged planet
                    currentPlanet = {
                        x: newX,
                        y: newY,
                        vx: newVx,
                        vy: newVy,
                        mass: totalMass,
                        density: (currentPlanet.density + planets[j].density) / 2,
                        color: this.blendColors(currentPlanet.color, planets[j].color),
                        trail: [...(currentPlanet.trail || []), ...(planets[j].trail || [])],
                        id: Date.now() + Math.random()
                    };
                    
                    // Recalculate radius based on new mass
                    currentPlanet.radius = this.calculateRadius(currentPlanet.mass, currentPlanet.density);
                    
                    collided.add(j);
                    hasCollided = true;
                }
            }

            remaining.push(currentPlanet);
        }

        return remaining;
    }

    // Blend two colors for collision merging
    blendColors(color1, color2) {
        const hex1 = color1.replace('#', '');
        const hex2 = color2.replace('#', '');
        
        const r1 = parseInt(hex1.substr(0, 2), 16);
        const g1 = parseInt(hex1.substr(2, 2), 16);
        const b1 = parseInt(hex1.substr(4, 2), 16);
        
        const r2 = parseInt(hex2.substr(0, 2), 16);
        const g2 = parseInt(hex2.substr(2, 2), 16);
        const b2 = parseInt(hex2.substr(4, 2), 16);
        
        const r = Math.round((r1 + r2) / 2);
        const g = Math.round((g1 + g2) / 2);
        const b = Math.round((b1 + b2) / 2);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    // Update planet positions using proper physics integration
    updatePlanetPositions(planets) {
        planets.forEach(planet => {
            // Calculate acceleration from forces (F = ma, so a = F/m)
            const massInEarthMasses = planet.mass / this.earthMass;
            const ax = planet.fx / massInEarthMasses;
            const ay = planet.fy / massInEarthMasses;
            
            // Use a smaller time step for numerical stability
            const dt = 0.008; // Optimized for orbital mechanics
            
            // Leapfrog integration for better energy conservation
            // Update velocity by half step
            planet.vx += ax * dt * 0.5;
            planet.vy += ay * dt * 0.5;
            
            // Update position by full step
            planet.x += planet.vx * dt;
            planet.y += planet.vy * dt;
            
            // Update velocity by another half step (completed full step)
            planet.vx += ax * dt * 0.5;
            planet.vy += ay * dt * 0.5;
            
            // Add to trail for orbital visualization (less frequently for performance)
            if (!planet.trail) planet.trail = [];
            if (planet.trail.length === 0 || planet.trail.length % 3 === 0) {
                planet.trail.push({ x: planet.x, y: planet.y });
            }
            
            // Limit trail length for performance
            if (planet.trail.length > 800) {
                planet.trail.shift();
            }
        });
        
        // Clear forces after updating all positions
        planets.forEach(planet => {
            planet.forces = [];
        });
    }

    // Calculate total system energy
    calculateSystemEnergy(planets) {
        this.totalKineticEnergy = 0;
        this.totalPotentialEnergy = 0;

        // Kinetic energy: KE = 0.5 * m * v²
        planets.forEach(planet => {
            const velocity = Math.sqrt(planet.vx * planet.vx + planet.vy * planet.vy);
            this.totalKineticEnergy += 0.5 * planet.mass * velocity * velocity;
        });

        // Potential energy: PE = -G * m1 * m2 / r
        for (let i = 0; i < planets.length; i++) {
            for (let j = i + 1; j < planets.length; j++) {
                const dx = planets[j].x - planets[i].x;
                const dy = planets[j].y - planets[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy) / this.scaleFactor;
                
                this.totalPotentialEnergy -= this.G * planets[i].mass * planets[j].mass / distance;
            }
        }
    }

    // Calculate escape velocity for a given distance from a planet
    calculateEscapeVelocity(planet, distance) {
        const actualDistance = distance / this.scaleFactor;
        return Math.sqrt(2 * this.G * planet.mass / actualDistance);
    }

    // Calculate orbital velocity for circular orbit around a central body
    calculateOrbitalVelocity(centralBody, orbitRadius) {
        if (orbitRadius <= 0) return 0;
        
        // v = sqrt(G * M / r) - simplified for screen coordinates
        const M = centralBody.mass / this.earthMass; // Central mass in Earth masses
        const G_scaled = 50; // Same G as in force calculation
        
        return Math.sqrt(G_scaled * M / orbitRadius);
    }

    // Suggest optimal velocity for stable orbit
    suggestOrbitalVelocity(planets, newPlanetX, newPlanetY) {
        if (planets.length === 0) return { vx: 0, vy: 0 };

        // Find the most massive body (likely a star)
        let centralBody = null;
        let maxMass = 0;

        planets.forEach(planet => {
            if (planet.mass > maxMass) {
                maxMass = planet.mass;
                centralBody = planet;
            }
        });

        if (!centralBody) return { vx: 0, vy: 0 };

        // Calculate distance to central body
        const dx = newPlanetX - centralBody.x;
        const dy = newPlanetY - centralBody.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) return { vx: 0, vy: 0 }; // Too close

        // Calculate orbital velocity magnitude
        const orbitalSpeed = this.calculateOrbitalVelocity(centralBody, distance);
        
        // Direction perpendicular to radius vector (for circular orbit)
        // Rotate the radius vector 90 degrees counterclockwise
        const vx = (-dy / distance) * orbitalSpeed;
        const vy = (dx / distance) * orbitalSpeed;

        return { vx, vy };
    }

    // Main simulation step
    simulateStep(planets, options = {}) {
        const { enableCollisions = true } = options;

        // Apply gravitational forces
        this.applyGravitationalForces(planets);
        
        // Update positions
        this.updatePlanetPositions(planets);
        
        // Handle collisions
        const updatedPlanets = this.checkCollisions(planets, enableCollisions);
        
        // Calculate system energy
        this.calculateSystemEnergy(updatedPlanets);
        
        return updatedPlanets;
    }
}

// Preset planetary systems
class PresetSystems {
    constructor(physicsEngine) {
        this.physics = physicsEngine;
    }

    // Solar System (simplified)
    createSolarSystem(canvasWidth, canvasHeight) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const scale = Math.min(canvasWidth, canvasHeight) / 800;

        // Create the sun first
        const sun = {
            x: centerX,
            y: centerY,
            vx: 0,
            vy: 0,
            mass: this.physics.convertMass(333000, 'earth'),
            density: 1.41,
            color: '#FDB813',
            trail: [],
            id: 'sun',
            fx: 0,
            fy: 0,
            forces: []
        };
        
        const planets = [sun];

        // Calculate proper orbital velocities for each planet
        const planetData = [
            { distance: 60 * scale, mass: 0.055, density: 5.43, color: '#8C7853', id: 'mercury' },
            { distance: 90 * scale, mass: 0.815, density: 5.24, color: '#FFC649', id: 'venus' },
            { distance: 120 * scale, mass: 1.0, density: 5.51, color: '#6B93D6', id: 'earth' },
            { distance: 160 * scale, mass: 0.107, density: 3.93, color: '#CD5C5C', id: 'mars' }
        ];

        planetData.forEach(data => {
            // Calculate proper orbital velocity
            const orbitalSpeed = this.physics.calculateOrbitalVelocity(sun, data.distance);
            
            const planet = {
                x: centerX + data.distance,
                y: centerY,
                vx: 0,
                vy: orbitalSpeed, // Perpendicular to radius for circular orbit
                mass: this.physics.convertMass(data.mass, 'earth'),
                density: data.density,
                color: data.color,
                trail: [],
                id: data.id,
                fx: 0,
                fy: 0,
                forces: []
            };
            
            planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
            planets.push(planet);
        });

        // Set radius for sun
        sun.radius = this.physics.calculateRadius(sun.mass, sun.density);

        return planets;
    }

    // Binary star system
    createBinaryStars(canvasWidth, canvasHeight) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const separation = 100;
        const orbitalVelocity = 15;

        return [
            {
                x: centerX - separation/2,
                y: centerY,
                vx: 0,
                vy: orbitalVelocity,
                mass: this.physics.convertMass(50000, 'earth'),
                density: 1.0,
                color: '#FF6B6B',
                trail: [],
                id: 'star1'
            },
            {
                x: centerX + separation/2,
                y: centerY,
                vx: 0,
                vy: -orbitalVelocity,
                mass: this.physics.convertMass(50000, 'earth'),
                density: 1.0,
                color: '#4ECDC4',
                trail: [],
                id: 'star2'
            }
        ].map(planet => {
            planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
            return planet;
        });
    }

    // Asteroid field
    createAsteroidField(canvasWidth, canvasHeight) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const asteroids = [];

        // Central star
        asteroids.push({
            x: centerX,
            y: centerY,
            vx: 0,
            vy: 0,
            mass: this.physics.convertMass(100000, 'earth'),
            density: 2.0,
            color: '#FFD700',
            trail: [],
            id: 'central-star'
        });

        // Generate random asteroids
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * 2 * Math.PI + Math.random() * 0.5;
            const radius = 80 + Math.random() * 80;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            const orbitalVel = Math.sqrt(6.67430e-11 * asteroids[0].mass / (radius * 1e9)) * 1e-3;
            const vx = -Math.sin(angle) * orbitalVel * (0.8 + Math.random() * 0.4);
            const vy = Math.cos(angle) * orbitalVel * (0.8 + Math.random() * 0.4);

            asteroids.push({
                x,
                y,
                vx,
                vy,
                mass: this.physics.convertMass(0.001 + Math.random() * 0.01, 'earth'),
                density: 2.5 + Math.random() * 2,
                color: `hsl(${Math.random() * 60 + 30}, 70%, ${40 + Math.random() * 30}%)`,
                trail: [],
                id: `asteroid-${i}`
            });
        }

        return asteroids.map(planet => {
            planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
            return planet;
        });
    }

    // Mini galaxy spiral
    createMiniGalaxy(canvasWidth, canvasHeight) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const stars = [];

        // Central black hole
        stars.push({
            x: centerX,
            y: centerY,
            vx: 0,
            vy: 0,
            mass: this.physics.convertMass(1000000, 'earth'),
            density: 10.0,
            color: '#000000',
            trail: [],
            id: 'black-hole'
        });

        // Spiral arms
        for (let arm = 0; arm < 3; arm++) {
            for (let i = 0; i < 8; i++) {
                const t = i / 8;
                const angle = arm * (2 * Math.PI / 3) + t * Math.PI * 1.5;
                const radius = 30 + t * 100;
                
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                
                const orbitalVel = Math.sqrt(6.67430e-11 * stars[0].mass / (radius * 1e9)) * 1e-3;
                const vx = -Math.sin(angle) * orbitalVel * 0.7;
                const vy = Math.cos(angle) * orbitalVel * 0.7;

                stars.push({
                    x: x + (Math.random() - 0.5) * 20,
                    y: y + (Math.random() - 0.5) * 20,
                    vx: vx + (Math.random() - 0.5) * 2,
                    vy: vy + (Math.random() - 0.5) * 2,
                    mass: this.physics.convertMass(100 + Math.random() * 500, 'earth'),
                    density: 0.5 + Math.random() * 2,
                    color: `hsl(${200 + Math.random() * 100}, 80%, ${60 + Math.random() * 30}%)`,
                    trail: [],
                    id: `star-${arm}-${i}`
                });
            }
        }

        return stars.map(planet => {
            planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
            return planet;
        });
    }
} 