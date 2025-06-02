# ✨ Star-Maker - Interactive Planetary System Simulator

**Star-Maker** is a web-based interactive planetary system simulator that lets you create, customize, and observe gravitational interactions between celestial bodies in real-time. Built with modern web technologies and realistic physics calculations.

![Star-Maker Screenshot](https://via.placeholder.com/800x400/1a1a2e/4a90e2?text=Star-Maker+Simulator)

## 🌟 Features

### 🔬 **Realistic Physics**
- **N-body Gravitational Simulation**: Accurate calculations using Newton's law of universal gravitation
- **Collision Detection**: Realistic planetary collisions with mass and momentum conservation
- **Energy Conservation**: Real-time kinetic and potential energy calculations
- **Orbital Mechanics**: Accurate escape velocity and orbital velocity calculations

### 🎨 **Interactive Creation**
- **Visual Planet Designer**: Click-to-create planets with customizable properties
- **Drag-and-Drop Velocity**: Set initial velocities by dragging planets
- **Smart Orbital Suggestions**: Auto-calculated orbital velocities for stable orbits
- **Real-time Scaling**: Mass-to-radius calculations based on density

### 📊 **Advanced Controls**
- **Multi-Unit Support**: Switch between Earth masses, kilograms, and solar masses
- **Density Control**: Adjust planetary density affecting size and composition
- **Velocity Units**: km/s, m/s, and orbital unit options
- **Color Customization**: Beautiful color palette for visual distinction

### 🌟 **Preset Scenarios**
- **🌞 Solar System**: Simplified version of our solar system
- **⭐ Binary Stars**: Dual star system with orbital mechanics
- **☄️ Asteroid Field**: Central star with orbiting asteroid belt
- **🌌 Mini Galaxy**: Spiral galaxy structure with central black hole

### 🎮 **Interactive Controls**
- **Mouse Controls**: 
  - Left-click to place planets
  - Right-click and drag to pan view
  - Mouse wheel to zoom in/out
  - Drag planets to set velocity vectors
- **Keyboard Shortcuts**:
  - `Space`: Pause/Resume simulation
  - `F`: Toggle gravitational force vectors
  - `T`: Toggle orbital trails
  - `1-4`: Load preset scenarios
  - `Ctrl+S`: Save system
  - `Ctrl+C`: Clear all planets

### 💾 **Save & Load System**
- **JSON Export**: Save planetary systems with full state
- **Backward Compatibility**: Version-controlled save format
- **Persistent Settings**: Auto-save user preferences
- **System Restoration**: Load complete simulations including camera state

### 📱 **Responsive Design**
- **Cross-Platform**: Works on desktop, tablet, and mobile devices
- **Adaptive Layout**: Responsive grid system for different screen sizes
- **Touch Support**: Mobile-optimized touch controls
- **Performance Optimized**: 60 FPS on modern devices

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No additional software installation required

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/star-maker.git
   cd star-maker
   ```

2. Open `index.html` in your web browser:
   ```bash
   open index.html
   ```
   Or simply drag the file into your browser window.

### Usage
1. **Create Your First Planet**: Left-click anywhere on the black canvas
2. **Set Initial Velocity**: Click and drag from a planet to set its velocity vector
3. **Adjust Properties**: Use the control panel to modify mass, density, and color
4. **Try Presets**: Click preset buttons to load pre-built planetary systems
5. **Explore**: Use right-click to pan, mouse wheel to zoom, and watch the physics unfold!

## 🎯 Controls Reference

### Mouse Controls
| Action | Control |
|--------|---------|
| Create Planet | Left Click |
| Set Velocity | Left Click + Drag on Planet |
| Pan View | Right Click + Drag |
| Zoom | Mouse Wheel |
| Remove Planet | Double Click on Planet |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Pause/Resume |
| `F` | Toggle Force Vectors |
| `T` | Toggle Orbital Trails |
| `1` | Load Solar System |
| `2` | Load Binary Stars |
| `3` | Load Asteroid Field |
| `4` | Load Mini Galaxy |
| `Ctrl+S` | Save System |
| `Ctrl+C` | Clear All |
| `Ctrl+R` | Reset Simulation |
| `Esc` | Cancel Current Action |

## 🔧 Technical Details

### Architecture
```
Star-Maker/
├── index.html          # Main HTML structure
├── styles.css          # Modern CSS styling with gradients
├── physics.js          # Physics engine and calculations
├── ui.js              # User interface controller
├── main.js            # Application entry point and orchestration
└── README.md          # This documentation
```

### Physics Engine (`physics.js`)
- **PhysicsEngine Class**: Core gravitational calculations
- **N-body Problem**: Efficient force calculations between all planetary pairs
- **Verlet Integration**: Stable numerical integration for position updates
- **Collision Detection**: Spatial partitioning for performance
- **Energy Calculations**: Real-time system energy monitoring

### Key Classes
```javascript
// Physics Engine
class PhysicsEngine {
    simulateStep(planets, options)    // Main simulation loop
    calculateGravitationalForce()     // Newton's law implementation
    checkCollisions()                 // Collision detection and merging
    calculateSystemEnergy()           // Energy conservation tracking
}

// Preset Systems
class PresetSystems {
    createSolarSystem()               // Solar system preset
    createBinaryStars()               // Binary star system
    createAsteroidField()             // Asteroid belt simulation
    createMiniGalaxy()                // Spiral galaxy structure
}

// UI Controller
class UIController {
    handleMouseDown/Move/Up()         // Mouse interaction handling
    render()                          // Canvas rendering pipeline
    updateInfoPanel()                 // Real-time statistics display
}
```

### Performance Optimizations
- **Efficient Force Calculations**: O(n²) optimization with spatial awareness
- **Trail Management**: Limited trail length for memory efficiency
- **Canvas Optimization**: Minimal redraws and efficient rendering
- **Collision Optimization**: Early exit conditions and spatial partitioning

## 🎨 Customization

### Adding New Presets
```javascript
// In PresetSystems class
createCustomSystem(canvasWidth, canvasHeight) {
    return [
        {
            x: canvasWidth / 2,
            y: canvasHeight / 2,
            vx: 0, vy: 0,
            mass: this.physics.convertMass(100, 'earth'),
            density: 5.5,
            color: '#ff6b6b',
            trail: [],
            id: 'custom-planet'
        }
        // Add more planets...
    ].map(planet => {
        planet.radius = this.physics.calculateRadius(planet.mass, planet.density);
        return planet;
    });
}
```

### Modifying Physics Constants
```javascript
// In PhysicsEngine constructor
this.G = 6.67430e-11;        // Gravitational constant
this.timeStep = 0.016;       // Simulation time step (60 FPS)
this.scaleFactor = 1e-9;     // Visualization scale
```

### Custom Styling
The CSS uses CSS custom properties for easy theming:
```css
:root {
    --primary-color: #4a90e2;
    --secondary-color: #9c27b0;
    --accent-color: #e91e63;
    --background-gradient: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
}
```

## 🧪 API Reference

### Public Methods
```javascript
// Access via window.StarMaker.app

// Planet Management
addPlanet(x, y, properties)     // Add planet at position
removePlanet(planetId)          // Remove planet by ID
getPlanets()                    // Get all planets array
clearSystem()                   // Remove all planets

// Simulation Control
pauseSimulation()               // Pause physics
resumeSimulation()              // Resume physics
```

### Example Usage
```javascript
// Create a custom planet
const planet = window.StarMaker.app.addPlanet(400, 300, {
    mass: 5.972e24,           // Earth mass in kg
    density: 5.5,             // g/cm³
    color: '#00ff88',         // Hex color
    vx: 10,                   // Initial velocity X
    vy: 5                     // Initial velocity Y
});

// Access physics engine directly
const escapeVel = window.StarMaker.physics.calculateEscapeVelocity(planet, 100);
```

## 🌍 Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 70+ | ✅ Full |
| Firefox | 65+ | ✅ Full |
| Safari | 12+ | ✅ Full |
| Edge | 79+ | ✅ Full |
| Mobile Safari | 12+ | ✅ Full |
| Chrome Mobile | 70+ | ✅ Full |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style and conventions
- Add comments for complex physics calculations
- Test on multiple browsers and devices
- Optimize for performance (target 60 FPS)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Newton's law of universal gravitation for the physics foundation
- Modern web APIs for Canvas and performance optimization
- The astronomy community for inspiration and real-world data
- Open source community for best practices and patterns

## 🔗 Links

- [Live Demo](https://your-demo-link.com)
- [Documentation](https://your-docs-link.com)
- [Issues](https://github.com/yourusername/star-maker/issues)
- [Discussions](https://github.com/yourusername/star-maker/discussions)

---

**Made with ✨ and ❤️ for space enthusiasts and physics lovers everywhere!** 