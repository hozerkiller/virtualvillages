const canvas = document.getElementById("villageCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 10;
let villagers = [];
let houses = [];
let trees = [];
let animals = [];
let isDay = true;
let resources = {
  wood: 0,
  meat: 0,
  milk: 0,
  cheese: 0,
  jerky: 0,
};
let statuses = {
  happiness: 0,
};

// Sprite images
const spriteImages = {
  tree: new Image(),
  house: new Image(),
  villager: new Image(),
  cow: new Image(),
  fox: new Image(),
  bunny: new Image(),
  bobcat: new Image(),
};

// Set sprite sources
spriteImages.tree.src = "sprites/tree.png";
spriteImages.house.src = "sprites/house.png";
spriteImages.villager.src = "sprites/villager.png";
spriteImages.cow.src = "sprites/cow.png";
spriteImages.fox.src = "sprites/fox.png";
spriteImages.bunny.src = "sprites/bunny.png";
spriteImages.bobcat.src = "sprites/bobcat.png";

// Initialize socket connection
const socket = io();

const woodElement = document.getElementById("wood");
const meatElement = document.getElementById("meat");
const milkElement = document.getElementById("milk");
const cheeseElement = document.getElementById("cheese");
const jerkyElement  = document.getElementById("jerky");

const happinessElement = document.getElementById("happiness");

const saveButtonElement = document.getElementById("save");

socket.on("villageUpdate", (data) => {
  villagers = data.villagers;
  houses = data.houses;
  trees = data.trees;
  animals = data.animals;
  isDay = data.isDay;

  // Update resources
  if (data.resources) {
    resources = data.resources;
    resources.cheese = resources.cheese || 0; // Add default value to prevent undefined
  }
  
  if (data.statuses) {
    statuses = data.statuses;
  }

  document.getElementById("cycleIndicator").textContent = isDay ? "Daytime" : "Nighttime";

  renderVillage();
  refreshResources();
  refreshStatus();
});

saveButtonElement.addEventListener("click", function() {
  socket.emit("save");
});

function refreshResources() {
  woodElement.textContent = resources.wood;
  meatElement.textContent = resources.meat;
  milkElement.textContent = resources.milk;
  cheeseElement.textContent = resources.cheese;
  jerkyElement.textContent = resources.jerky;
}

function refreshStatus() {
  happinessElement.textContent = statuses.villageHappiness;
}

function renderVillage() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = isDay ? "lightgreen" : "darkslategray";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw trees
  trees.forEach((tree) => {
    drawSpriteOrRect(spriteImages.tree, "green", tree.location);
  });

  // Draw houses
  houses.forEach((house) => {
    drawSpriteOrRect(spriteImages.house, "brown", house.location);
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(house.name, house.location.x * TILE_SIZE + TILE_SIZE / 2, house.location.y * TILE_SIZE - 5);
  });

  // Draw villagers
  villagers.forEach((villager) => {
    drawSpriteOrCircle(spriteImages.villager, "blue", villager.location);
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(villager.name, villager.location.x * TILE_SIZE + TILE_SIZE / 2, villager.location.y * TILE_SIZE - 5);
  });

  // Draw animals
  animals.forEach((animal) => {
    let sprite;
    let animalColour
    switch (animal.type) {
      case "Cow":
        sprite = spriteImages.cow;
        animalColour = "white";
        break;
      case "Fox":
        sprite = spriteImages.fox;
        animalColour = "red";
        break;
      case "Bunny":
        sprite = spriteImages.bunny;
        animalColour = "brown"
        break;
      case "Bobcat":
        sprite = spriteImages.bobcat;
        animalColour = "gray"
        break;
      default:
        sprite = null;
        animalColour = "black";
        break;
    }
    drawSpriteOrCircle(sprite, animalColour, animal.location);
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(animal.type, animal.location.x * TILE_SIZE + TILE_SIZE / 2, animal.location.y * TILE_SIZE - 5);
  });
}

function drawSpriteOrRect(sprite, fallbackColor, location) {
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(
      sprite,
      location.x * TILE_SIZE,
      location.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(location.x * TILE_SIZE, location.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "black";
    ctx.strokeRect(location.x * TILE_SIZE, location.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
}

function drawSpriteOrCircle(sprite, fallbackColor, location) {
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(
      sprite,
      location.x * TILE_SIZE,
      location.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.beginPath();
    ctx.arc(
      location.x * TILE_SIZE + TILE_SIZE / 2,
      location.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.stroke();
  }
}

canvas.width = TILE_SIZE * 80;
canvas.height = TILE_SIZE * 60;
