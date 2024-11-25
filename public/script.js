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
};
let statuses = {
  happiness: 0,
};

// Initialize socket connection
const socket = io();

const woodElement = document.getElementById("wood");
const meatElement = document.getElementById("meat");
const milkElement = document.getElementById("milk");
const cheeseElement = document.getElementById("cheese");
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

 // Send signal to server when save button is pressed
 saveButtonElement.addEventListener("click", function() {
  // send "save" message to server
  socket.emit("save");
});

function refreshResources() {
  //resources
  woodElement.textContent = resources.wood;
  meatElement.textContent = resources.meat;
  milkElement.textContent = resources.milk;
  cheeseElement.textContent = resources.cheese;
}

function refreshStatus() {
  happinessElement.textContent = statuses.villageHappiness;
}

// Draw the village
function renderVillage() {
  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Set background color (draw a full rectangle)
  ctx.fillStyle = isDay ? "lightgreen" : "darkslategray";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw trees
  trees.forEach((tree) => {
    ctx.fillStyle = "green";
    ctx.fillRect(tree.location.x * TILE_SIZE, tree.location.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "black";
    ctx.strokeRect(tree.location.x * TILE_SIZE, tree.location.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  });

  // Draw houses
  houses.forEach((house) => {
    ctx.fillStyle = "brown";
    ctx.fillRect(house.location.x * TILE_SIZE, house.location.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    // Display house name above
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(house.name, house.location.x * TILE_SIZE + TILE_SIZE / 2, house.location.y * TILE_SIZE - 5);
  });

  // Draw villagers
  villagers.forEach((villager) => {
    ctx.fillStyle = isDay ? "blue" : "gray";
    ctx.beginPath();
    ctx.arc(
      villager.location.x * TILE_SIZE + TILE_SIZE / 2,
      villager.location.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();

    // Display villager name above their head
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      villager.name, // Assuming each villager has a 'name' property
      villager.location.x * TILE_SIZE + TILE_SIZE / 2,
      villager.location.y * TILE_SIZE - 5 // Position text slightly above the villager
    );
  });

  // Draw animals
  animals.forEach((animal) => {
    switch (animal.type) {
      case "Cow":
        ctx.fillStyle = "white";
        break;
      case "Fox":
        ctx.fillStyle = "orange";
        break;
      default:
        ctx.fillStyle = "gray";
        break;
    }

    ctx.beginPath();
    ctx.arc(
      animal.location.x * TILE_SIZE + TILE_SIZE / 2,
      animal.location.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.strokeStyle = "black"; // Outline for better visibility
    ctx.stroke();

    // Display animal type above their head
    ctx.fillStyle = "black";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      animal.type,
      animal.location.x * TILE_SIZE + TILE_SIZE / 2,
      animal.location.y * TILE_SIZE - 5 // Position text slightly above the animal
    );
  });
}

// Resize canvas to match village dimensions
canvas.width = TILE_SIZE * 80;
canvas.height = TILE_SIZE * 60;
