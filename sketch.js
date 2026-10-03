let angle = 0;
let rotationSpeed = 0.01;
let cameraRadius = 300;
let towers = [];
let colorPalettes = [
    ['#c6c5b9', '#62929e', '#4a6d7c', '#393a10', '#475657'],
    ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'],
    ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff'],
    ['#001219', '#005f73', '#0a9396', '#94d2bd', '#e9d8a6', '#ee9b00', '#ca6702', '#bb3e03', '#ae2012', '#9b2226'],
];
let currentPaletteIndex = -1;
let noiseTexture;
let floorBlocks = [];
let housePlantModel;
let plants = [];
let buildingModels = [];
let buildings = [];

const PLANT_COUNT = 6;
const PLANT_MODEL_PATH = 'assets/eb_house_plant_01.obj';

const BUILDING_COUNT = 6;
const BUILDING_MODEL_PATHS = Array.from({ length: 10 }, (_, i) =>
    `assets/Residential Buildings ${String(i + 1).padStart(3, '0')}.obj`
);

const ORBIT_ZOOM_SENSITIVITY = 0.25;

// Shape probability constants
const SHAPE_PROBABILITIES = {
    box: 0.85,    
    sphere: 0.10,
    cone: 0.05 
};

let isRegenerating = false;
// The first draw() uploads every model to the GPU, so the overlay stays up
// until a frame has actually rendered.
let hideLoadingAfterDraw = false;

function setCanvasLoading(isLoading) {
    const overlay = document.getElementById('canvas-loading');
    if (!overlay) {
        return;
    }

    overlay.classList.toggle('is-hidden', !isLoading);
    overlay.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

// Helper function to select shape type based on probabilities
function selectShapeType() {
    const rand = random();
    let cumulative = 0;

    for (const [shapeType, probability] of Object.entries(SHAPE_PROBABILITIES)) {
        cumulative += probability;
        if (rand <= cumulative) {
            return shapeType;
        }
    }

    // Fallback to box if something goes wrong
    return 'box';
}

function pickPaletteColor() {
    if (currentPaletteIndex === -1) {
        currentPaletteIndex = floor(random(colorPalettes.length));
    }   
    const palette = colorPalettes[currentPaletteIndex];
    return palette[floor(random(palette.length))];
}

function prepareObjModel(model) {
    if (!model) {
        return;
    }

    // OBJ files with usemtl groups (e.g. ground + hotel_glas) bake default
    // vertex colors when their .mtl files are missing, which overrides fill/material.
    model.vertexColors = [];
    if (typeof model.computeNormals === 'function') {
        model.computeNormals();
    }
}

function preload() {
    housePlantModel = loadModel(PLANT_MODEL_PATH, true);
    buildingModels = BUILDING_MODEL_PATHS.map((path) => loadModel(path, true));
}

function setup() {
    setCanvasLoading(true);
    let canvas = createCanvas(1200, 600, WEBGL);
    canvas.parent('canvas-container');
    // Create a p5.Camera object.
    cam = createCamera();
    loadTextures();
    prepareObjModel(housePlantModel);
    for (const buildingModel of buildingModels) {
        prepareObjModel(buildingModel);
    }
    camera(0, -80, 400);

    regenScene(true).catch((error) => {
        console.log('Scene generation failed:', error);
        setCanvasLoading(false);
    });

    window.addEventListener('keydown', handleSpaceRegen);
}

function handleSpaceRegen(event) {
    if (event.code !== 'Space' && event.key !== ' ') {
        return;
    }

    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
    }

    event.preventDefault();
    regenScene(false);
}

function loadTextures() {
    // Create noise texture
    noiseTexture = createGraphics(256, 256);
    noiseTexture.loadPixels();
    for (let x = 0; x < 256; x++) {
        for (let y = 0; y < 256; y++) {
            let index = (x + y * 256) * 4;
            let noiseVal = noise(x * 0.02, y * 0.02) * 255;
            noiseTexture.pixels[index] = noiseVal;
            noiseTexture.pixels[index + 1] = noiseVal * 0.8;
            noiseTexture.pixels[index + 2] = noiseVal * 0.6;
            noiseTexture.pixels[index + 3] = 255;
        }
    }
    noiseTexture.updatePixels();
}

async function regenScene(showOverlay = false) {
    currentPaletteIndex = -1;
    if (isRegenerating) {
        return;
    }

    isRegenerating = true;
    if (showOverlay) {
        setCanvasLoading(true);
    }

    floorBlocks = [];
    towers = [];

    try {
        await generateTowers();
        await generateFloor();
        generatePlants();
        generateBuildings();
    } finally {
        if (showOverlay) {
            hideLoadingAfterDraw = true;
        }
        isRegenerating = false;
    }
}

function generatePlants() {
    plants = [];
    if (!housePlantModel) {
        return;
    }

    for (let i = 0; i < PLANT_COUNT; i++) {
        plants.push({
            x: random(-260, 260),
            y: random(-55, 0),
            z: random(-260, 260),
            scale: random(0.4, 0.85),
            rotationY: random(0, TWO_PI),
            color: pickPaletteColor(),
        });
    }
}

function generateBuildings() {
    buildings = [];
    if (!buildingModels.length) {
        return;
    }

    for (let i = 0; i < BUILDING_COUNT; i++) {
        buildings.push({
            modelIndex: floor(random(buildingModels.length)),
            x: random(-280, 280),
            y: random(-55, 0),
            z: random(-280, 280),
            scale: random(0.55, 1.1),
            rotationY: random(0, TWO_PI),
            color: pickPaletteColor(),
        });
    }
}

async function generateFloor() {
    const numberOfBlocks = 500;
    for (let i = 0; i < numberOfBlocks; i++) {
        floorBlocks.push({
            x: random(-400, 400),
            height: random(1, 50),
            width: random(1, 100),
            depth: random(1, 100),
            z: random(-400, 400),
            color: pickPaletteColor()
        });
    }
}

async function generateTowers() {

    const tallRatio = 0.1;

    towers = [];
    const numberOfTowers = 4;// random(15, 20);
    for (let i = 0; i < numberOfTowers; i++) {
        let shapes = [];
        let numberOfShapes = random(5, 10);
        if (random(0, 1) < tallRatio) {
            numberOfShapes = random(20, 25);
        }

        for (let j = 0; j < numberOfShapes; j++) {

            shapes.push({
                x: random(-5, 5),
                y: random(-20, -160),
                z: random(-5, 5),
                size: random(20, 80),
                color: pickPaletteColor(),
                type: selectShapeType(),
                hasTexture: random() < 0.5,
                rotationX: random(0, PI/8),
                rotationY: random(0, TWO_PI),
                rotationZ: random(0, PI/8)
            });
        }
        towers.push({
            shapes: shapes, x: random(-200, 200),
            y: random(0, -10),
            z: random(-200, 200)
        })

    }
}

function draw() {
    background(128, 128, 128);

    // Add more ambient lighting to prevent hollow appearance
    ambientLight(120, 120, 120);

    // Add directional lighting
    directionalLight(255, 255, 255, -1, 0.5, -1);

    // Add point light for better illumination
    pointLight(255, 255, 255, 0, -100, 200);

    orbitControl(1, 1, ORBIT_ZOOM_SENSITIVITY);

    // angle += rotationSpeed;
    // rotateY(angle);

    // Floor + Ground
    push();
    translate(0, 0, 0);

    noStroke();

    box(600, 1, 600);
    pop();

    buildPilars();
    buildFloor();

    // Draw all shapes
    for (let tower of towers) {
        for (let shape of tower.shapes) {
            push();
            translate(shape.x + tower.x, shape.y + tower.y, shape.z + tower.z);
            
            // Apply rotation to the shape
            rotateX(shape.rotationX);
            rotateY(shape.rotationY);
            rotateZ(shape.rotationZ);

            if (shape.color) {
                fill(shape.color);
            } else {
                fill('#717070');
            }
            noStroke();
            // Use ambient material for solid appearance
            if (shape.color) {
                ambientMaterial(shape.color);
            } else {
                ambientMaterial('#717070');
            }

            if (shape.hasTexture && noiseTexture) {
                // If the shape is marked to have a texture, apply the noise texture for varied appearance
                // texture(noiseTexture);
            }

            if (shape.type === 'box') {
                box(shape.size, shape.size * 1.5, shape.size);
            } else if (shape.type === 'sphere') {
                ellipsoid(shape.size, shape.size * 1.5, shape.size * 1.5);
            } else if (shape.type === 'cone') {
                cone(shape.size, shape.size);
            }
            pop();
        }
    }

    drawBuildings();
    drawPlants();

    if (hideLoadingAfterDraw) {
        hideLoadingAfterDraw = false;
        setCanvasLoading(false);
    }
}

function drawBuildings() {
    if (!buildingModels.length || buildings.length === 0) {
        return;
    }

    for (const building of buildings) {
        const buildingModel = buildingModels[building.modelIndex];
        if (!buildingModel) {
            continue;
        }

        push();
        translate(building.x, building.y, building.z);
        rotateY(building.rotationY);
        rotateX(PI);
        scale(building.scale);
        noStroke();
        fill(building.color);
        ambientMaterial(building.color);
        model(buildingModel);
        pop();
    }
}

function drawPlants() {
    if (!housePlantModel || plants.length === 0) {
        return;
    }

    for (const plant of plants) {
        push();
        translate(plant.x, plant.y, plant.z);
        rotateY(plant.rotationY);
        rotateX(PI);
        scale(plant.scale);
        noStroke();
        fill(plant.color);
        model(housePlantModel);
        pop();
    }
}

function buildFloor() {
    for (let block of floorBlocks) {
        push();
        translate(block.x, 0, block.z);
        fill(block.color);
        noStroke();
        ambientMaterial(13, 12, 12);
        box(block.width, block.height, block.depth);
        pop();
    }
}

function buildPilars() {
    push();
    translate(50, 0, 50);
    fill(13, 12, 12);
    noStroke();
    ambientMaterial(13, 12, 12);
    box(10, 100, 10);
    pop();

    push();
    translate(-50, 0, 50);
    fill(13, 12, 12);
    noStroke();
    ambientMaterial(13, 12, 12);
    box(10, 100, 10);
    pop();

    push();
    translate(-50, 0, -50);
    fill(13, 12, 12);
    noStroke();
    ambientMaterial(13, 12, 12);
    box(10, 100, 10);
    pop();

    push();
    translate(50, 0, -50);
    fill(13, 12, 12);
    noStroke();
    ambientMaterial(13, 12, 12);
    box(10, 100, 10);
    pop();
}

function mouseMoved() {
    // Interactive rotation based on mouse position
    const centerline = width / 2;
    const distanceFromCenterline = mouseX - centerline;
    //if create deadzone for rotation speed
    if (distanceFromCenterline > 25 || distanceFromCenterline < -25) {
        const exponentialSpeedCoeff = distanceFromCenterline ^ 2;
        rotationSpeed = -0.0001 * exponentialSpeedCoeff;
    } else {
        rotationSpeed = 0;
    }
}

async function regenerateShapes() {
    shapes = [];
    await generateShapes();
}
