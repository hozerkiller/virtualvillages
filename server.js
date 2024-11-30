// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const { randomInt } = require('crypto');

// Initialize the app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Village boundaries
const VILLAGE_WIDTH = 80;
const VILLAGE_HEIGHT = 60;

// Utility function for generating random numbers within a range
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Connect to MongoDB
mongoose.connect('mongodb://localhost/virtualVillage_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Handle connection events
mongoose.connection.on('connected', async () => {
  console.log('Connected to MongoDB');
  await loadTemplates();
  await loadInitialData();

  // Start the simulation after data is loaded
  startSimulation();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

// Define Mongoose schemas and models
const villagerSchema = new mongoose.Schema({
  name: String,
  skills: [String],
  speed: { type: Number, default: 10 },
  happiness: { type: Number, default: 10 },
  location: {
    x: { type: Number, default: () => getRandomInt(0, VILLAGE_WIDTH) },
    y: { type: Number, default: () => getRandomInt(0, VILLAGE_HEIGHT) },
  },
  fears: [String],
  hobbies: [String],
  possessions: {String: Number},
});

const animalSchema = new mongoose.Schema({
  type: String,
  speed: { type: Number, default: 10 },
  location: {
    x: { type: Number, default: () => getRandomInt(0, VILLAGE_WIDTH) },
    y: { type: Number, default: () => getRandomInt(0, VILLAGE_HEIGHT) },
  },
  respawn: { type: Boolean, default: false },
  meat: Number,
});

// Template Schema
const templateSchema = new mongoose.Schema(
  {
    category: String,
  },
  { strict: false }
);

const Template = mongoose.model('Template', templateSchema, 'templates_cl');
const Villager = mongoose.model('Villager', villagerSchema, 'villagers_cl');
const Animal = mongoose.model('Animal', animalSchema, 'animals_cl');

// Base schema for village items
const villageItemSchema = new mongoose.Schema(
  {
    category: String,
  },
  { discriminatorKey: 'category', strict: false }
);

const VillageItem = mongoose.model('VillageItem', villageItemSchema, 'village_cl');

// Building Schema
const buildingSchema = new mongoose.Schema({
  name: String,
  owner: String,
  type: String,
  location: {
    x: Number,
    y: Number,
  },
  residents: [String],
  age: Number,
});

// Tree Schema
const treeSchema = new mongoose.Schema({
  type: String,
  age: Number,
  location: {
    x: Number,
    y: Number,
  },
  wood: Number,
});

const Building = VillageItem.discriminator('buildings', buildingSchema);
const Tree = VillageItem.discriminator('trees', treeSchema);

// Initialize variables
let villagers = [];
let houses = [];
let trees = [];
let animals = [];
let templates = {};
let resources = {}; // Will be assigned a Mongoose document
let statuses = {
  villageHappiness: 0,
};
const villagersCount = 3;
const housesCount = 3;
// Day-Night cycle state
let isDay = true;
let previousIsDay = isDay;

// Simulated game time
const timeStep = 1000; // Time step in milliseconds

// Weather
let weather = 'sunny';


let logMessages = [];


// Load templates
async function loadTemplates() {
  try {
    const templatesData = await Template.find({});
    templatesData.forEach((templateDoc) => {
      const category = templateDoc.category;
      if (!templates[category]) {
        templates[category] = [];
      }
      templates[category].push(templateDoc);
    });
    console.log('Templates loaded successfully.');
  } catch (error) {
    console.error('Error loading templates from MongoDB:', error);
    process.exit(1);
  }
}

// Define Mongoose schemas and models for Resources
const resourceSchema = new mongoose.Schema({
  wood: { type: Number, default: 10 },
  meat: { type: Number, default: 10 },
  milk: { type: Number, default: 5 },
  cheese: { type: Number, default: 1 },
  jerky: { type: Number, default: 1 },
});

const Resource = mongoose.model('Resource', resourceSchema, 'resources_cl');

// Load initial village state from MongoDB, including resources
async function loadInitialData() {
  try {
    // Load villagers
    villagers = await Villager.find({});

    // Assign default values to each villager
    villagers.forEach((villager) => {
      villager.speed = villager.speed || 10; // Default speed if not specified
      villager.happiness = villager.happiness || 10; // Default happiness if not specified

      // Initialize villager positions
      villager.location = villager.location || {
        x: getRandomInt(0, VILLAGE_WIDTH),
        y: getRandomInt(0, VILLAGE_HEIGHT),
      };
    });

    // Load buildings (houses and barn)
    houses = await Building.find({});

    // Load trees
    trees = await Tree.find({});

    // Load animals
    animals = await Animal.find({});
    animals.forEach((animal) => {
      animal.speed = animal.speed || 10; // Default speed if not specified
      animal.location = animal.location || {
        x: getRandomInt(0, VILLAGE_WIDTH),
        y: getRandomInt(0, VILLAGE_HEIGHT),
      };
    });

    // Load resources
    let resourceData = await Resource.findOne({});
    if (!resourceData) {
      resourceData = new Resource(); // This will use default values
      await resourceData.save();
    }
    resources = resourceData; // Assign the Mongoose document

    console.log('Initial data loaded from MongoDB.');
  } catch (error) {
    console.error('Error loading initial village state from MongoDB:', error);
    process.exit(1); // Exit the application if initialization fails
  }
  weather = changeWeather();
  weatherBehavior(weather);
  performDailyActivities();
}

// Reset village
async function resetVillage() {
  try {
    // Remove all entities from database
    await Villager.deleteMany({});
    await Building.deleteMany({});
    await Tree.deleteMany({});
    await Animal.deleteMany({});

    //set resources to default values
    resources.wood = 10;
    resources.meat = 10;
    resources.milk = 5;
    resources.cheese = 0;
    resources.jerky = 0;

    // Clear in-memory arrays
    villagers = [];
    houses = [];
    trees = [];
    animals = [];

    // Add new villagers, houses, animals, and trees
    for (let i = 0; i < villagersCount; i++) {
      let villagerX = getRandomInt(0, VILLAGE_WIDTH);
      let villagerY = getRandomInt(0, VILLAGE_HEIGHT);

      let villager = await spawnEntity('villagers', 'villager', villagerX, villagerY);
      let house = await spawnEntity('buildings', 'Residential', villagerX, villagerY);
      
      if (villager && house) {
        house.name = `${villager.name}'s house`;
        house.residents.push(villager.name);
        console.log(`${villager.name} spawned`);
      }
    }
    // Add barn
    spawnEntity('buildings', 'Barn', getRandomInt(0, VILLAGE_WIDTH), getRandomInt(0, VILLAGE_HEIGHT));
    spawnEntity('buildings', 'Market', getRandomInt(0, VILLAGE_WIDTH), getRandomInt(0, VILLAGE_HEIGHT));

    dailySpawn();
    await updateEntities();
  } catch (error) {
    console.error('Error resetting village:', error);
  }
}




// Generalized function to move an entity to a building and execute a callback when reached
function goToBuilding(entity, building, callback) {
  if (!building || !entity || !building.location) return;
  moveToTarget(entity, building.location.x, building.location.y, callback);
}

// Update positions of villagers and animals
function updatePositions(saveLocationUpdates) {
  villagers.forEach((villager) => {
    if (!villager) return;

    if (villager.target) {
      // Move towards target
      if (villager.location.x < villager.target.x) villager.location.x++;
      else if (villager.location.x > villager.target.x) villager.location.x--;

      if (villager.location.y < villager.target.y) villager.location.y++;
      else if (villager.location.y > villager.target.y) villager.location.y--;

      // Restrict movement to village area
      villager.location.x = Math.max(0, Math.min(VILLAGE_WIDTH, villager.location.x));
      villager.location.y = Math.max(0, Math.min(VILLAGE_HEIGHT, villager.location.y));

      // Check if target reached
      if (villager.location.x === villager.target.x && villager.location.y === villager.target.y) {
        // Target reached
        villager.target = null;
        villager.isMoving = false;
        if (villager.callback) {
          villager.callback();
          villager.callback = null; // Reset callback
        }
      }
    } else {
      // If no target and it's day, move randomly
      if (isDay) {
        villager.location.x += getRandomInt(-1, 1);
        villager.location.y += getRandomInt(-1, 1);

        // Restrict movement to village area
        villager.location.x = Math.max(0, Math.min(VILLAGE_WIDTH, villager.location.x));
        villager.location.y = Math.max(0, Math.min(VILLAGE_HEIGHT, villager.location.y));
      }
    }

    // Mark villager's location as modified only if we are saving location updates
    if (saveLocationUpdates) {
      villager.markModified('location');
    }
  });

  animals.forEach((animal) => {
    if (!animal) return;

    if (animal.target) {
      // Move towards target
      if (animal.location.x < animal.target.x) animal.location.x++;
      else if (animal.location.x > animal.target.x) animal.location.x--;

      if (animal.location.y < animal.target.y) animal.location.y++;
      else if (animal.location.y > animal.target.y) animal.location.y--;

      // Restrict movement to village area
      animal.location.x = Math.max(0, Math.min(VILLAGE_WIDTH, animal.location.x));
      animal.location.y = Math.max(0, Math.min(VILLAGE_HEIGHT, animal.location.y));

      // Check if target reached
      if (animal.location.x === animal.target.x && animal.location.y === animal.target.y) {
        // Target reached
        animal.target = null;
        animal.isMoving = false;
        if (animal.callback) {
          animal.callback();
          animal.callback = null; // Reset callback
        }
      }
    } else {
      // If no target and it's day, move randomly
      if (isDay) {
        animal.location.x += getRandomInt(-1, 1);
        animal.location.y += getRandomInt(-1, 1);

        // Restrict movement to village area
        animal.location.x = Math.max(0, Math.min(VILLAGE_WIDTH, animal.location.x));
        animal.location.y = Math.max(0, Math.min(VILLAGE_HEIGHT, animal.location.y));
      }
    }

    // Mark animal's location as modified only if we are saving location updates
    if (saveLocationUpdates) {
      animal.markModified('location');
    }
  });

  // Check if any animals are outside the village boundaries or removed due to hunting and respawn them
  animals.forEach((animal) => {
    if (
      animal &&
      animal.respawn &&
      (animal.location.x <= 0 ||
        animal.location.x >= VILLAGE_WIDTH ||
        animal.location.y <= 0 ||
        animal.location.y >= VILLAGE_HEIGHT)
    ) {
      respawnAnimal(animal);
    }
  });
}

function respawnAnimal(animal) {
  animal.location.x = getRandomInt(0, VILLAGE_WIDTH);
  animal.location.y = getRandomInt(0, VILLAGE_HEIGHT);
  console.log(`Animal ${animal.type} respawned at (${animal.location.x}, ${animal.location.y})`);
  animal.markModified('location'); // Ensure the new location is saved
}

// Function to consume resources and adjust villager happiness
function consumeResources(villager) {
  if (!villager) return;
  let resourcesConsumed = false;

  if (resources.wood > 0) {
    resources.wood = Math.max(0, resources.wood - 1);
    resources.markModified('wood');
    villager.happiness += 1;
    clientLog(`${villager.name} has burned wood.`);
    resourcesConsumed = true;
  } else if (villager.happiness >= 6) {
    villager.happiness -= 5;
  }

  if (resources.meat > 0) {
    resources.meat = Math.max(0, resources.meat - 1);
    resources.markModified('meat');
    villager.happiness += 1;
    clientLog(`${villager.name} has eaten meat.`);
    resourcesConsumed = true;
  } else if (villager.happiness >= 10) {
    villager.happiness -= 1;
  }

  if (resources.cheese > 0) {
    resources.cheese = Math.max(0, resources.cheese - 1);
    resources.markModified('cheese');
    villager.happiness += 1;
    clientLog(`${villager.name} has eaten cheese.`);
    resourcesConsumed = true;
  } else if (villager.happiness >= 20) {
    villager.happiness -= 1;
  }

  if (resources.jerky > 0) {
    resources.jerky = Math.max(0, resources.jerky - 1);
    resources.markModified('jerky');
    villager.happiness += 1;
    clientLog(`${villager.name} has eaten jerky.`)
    resourcesConsumed = true;
  } else if (villager.happiness >= 20) {
    villager.happiness -= 1;
  }

  if (!resourcesConsumed) {
    clientLog(`${villager.name} couldn't find any resources to consume.`);
  }
}

// Spawn from templates
async function spawnEntity(category, type, x, y) {
  try {
    // Check if category exists in templates
    if (!templates[category]) {
      console.error(`Category '${category}' not found in templates.`);
      return;
    }

    // Find the template by type or name in the specified category
    const template = templates[category].find((item) => item.type === type || item.name === type);
    if (!template) {
      console.error(`Type '${type}' not found in category '${category}'.`);
      return;
    }

    // Create a new entity based on the category
    let spawnedEntityData = { ...template.toObject(), location: { x, y } };

    // Remove the _id and category fields from the template data
    delete spawnedEntityData._id;
    delete spawnedEntityData.category;

    // If the category is villagers, fetch a random name from MongoDB
    if (category === 'villagers') {
      const namesDocument = await Template.findOne({ type: 'names' });
      if (namesDocument && Array.isArray(namesDocument.names) && namesDocument.names.length > 0) {
        const randomName =
          namesDocument.names[Math.floor(Math.random() * namesDocument.names.length)];
        spawnedEntityData.name = randomName;
      } else {
        console.warn('No names found in the database.');
        spawnedEntityData.name = 'Unnamed Villager'; // Fallback name
      }
    }

    let spawnedEntity;
    if (category === 'animals') {
      spawnedEntity = new Animal(spawnedEntityData);
      await spawnedEntity.save();
      animals.push(spawnedEntity);
    } else if (category === 'villagers') {
      spawnedEntity = new Villager(spawnedEntityData);
      await spawnedEntity.save();
      villagers.push(spawnedEntity);
    } else if (category === 'buildings') {
      spawnedEntity = new Building(spawnedEntityData);
      await spawnedEntity.save();
      houses.push(spawnedEntity);
    } else if (category === 'trees') {
      spawnedEntity = new Tree(spawnedEntityData);
      await spawnedEntity.save();
      trees.push(spawnedEntity);
    } else {
      console.error(`Unknown category: ${category}`);
      return;
    }

    clientLog(
      `Spawning ${spawnedEntity.type || spawnedEntity.name} at (${spawnedEntity.location.x}, ${spawnedEntity.location.y})`
    );

    return spawnedEntity;
  } catch (error) {
    console.error('Error spawning entity:', error);
  }
}


// Spawn daily entities
function dailySpawn() {
  const bunnies = animals.filter((animal) => animal.type === 'Bunny');
  const foxes = animals.filter((animal) => animal.type === 'Fox');
  const bobcats = animals.filter((animal) => animal.type === 'Bobcat');
  const elks = animals.filter((animal) => animal.type === 'Elk');
  // Spawn animals
  if (bunnies.length < 5) {
    for (let i = 0; i < 5 - bunnies.length; i++) {
      let bunX = getRandomInt(0, VILLAGE_WIDTH);
      let bunY = getRandomInt(0, VILLAGE_HEIGHT);
      spawnEntity('animals', 'Bunny', bunX, bunY);
    }
  }
  if (foxes.length < 1) {
    const foxX = getRandomInt(0, VILLAGE_WIDTH);
    const foxY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('animals', 'Fox', foxX, foxY);
  }
  if (bobcats.length < 1) {
    const bobcatX = getRandomInt(0, VILLAGE_WIDTH);
    const bobcatY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('animals', 'Bobcat', bobcatX, bobcatY);
  }
  if (elks.length < 1) {
    const elkX = getRandomInt(0, VILLAGE_WIDTH);
    const elkY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('animals', 'Elk', elkX, elkY);
  }

  // Spawn Trees
  if (trees.length < 10) {
    for (let i = 0; i < 10 - trees.length; i++) {
      let treeX = getRandomInt(0, VILLAGE_WIDTH);
      let treeY = getRandomInt(0, VILLAGE_HEIGHT);
      const treeType = i % 2 === 0 ? 'Oak' : 'Pine';
      spawnEntity('trees', treeType, treeX, treeY);
    }
  }
}

async function sendVillagersHome() {
  villagers.forEach(villager => {
    sendVillagerHome(villager);    
  });
}
async function sendVillagerHome(villager) {
  // Go to closest house with villager on residents list
  const closestHouse = houses.find((house) => house.residents && house.residents.includes(villager.name));
  if (closestHouse) {
    goToBuilding(villager, closestHouse);
  }
}

async function bobcatCullAnimals() {
  // Kill foxes if there are over 5 foxes
  const foxes = getEntitiesByType('animals', 'Fox');
  if (foxes.length > 5) {
    await predatorHuntsPrey({
      predatorType: 'Bobcat',
      preyType: 'Fox',
      spawnChance: 0, // No spawning after hunting
      proximityThreshold: 1.5,
    });
  }

  // Kill bunnies if there are over 10 bunnies
  const bunnies = getEntitiesByType('animals', 'Bunny');
  if (bunnies.length > 10) {
    await predatorHuntsPrey({
      predatorType: 'Bobcat',
      preyType: 'Bunny',
      spawnChance: 0, // No spawning after hunting
      proximityThreshold: 1.5,
    });
  }
}

// Function to get entities by type
function getEntitiesByType(category, type) {
  let entities = [];

  switch (category) {
    case 'villagers':
      entities = villagers.filter((villager) => villager.skills.includes(type) || villager.name === type);
      break;
    case 'animals':
      entities = animals.filter((animal) => animal.type === type);
      break;
    case 'buildings':
      entities = houses.filter((building) => building.type === type);
      break;
    case 'trees':
      entities = trees.filter((tree) => tree.type === type);
      break;
    default:
      console.error(`Unknown category: ${category}`);
  }

  return entities;
}

// Weather functions
// Select random weather
function changeWeather(currentWeather = 'sunny', severe = false) {
  let weathers = ['sunny', 'sunny', 'sunny', 'rainy', 'thunderstorm'];
  if (severe) {
    weathers.push('tornado', 'blizzard');
  }
  weathers.push(currentWeather);
  const newWeather = weathers[Math.floor(Math.random() * weathers.length)];
  return newWeather;
}

// Weather behavior
function weatherBehavior(currentWeather) {
  switch (currentWeather) {
    case 'sunny':
      clientLog("It's a sunny day. Time to go outside!");
      break;
    case 'rainy':
      clientLog("It's a rainy day. Better stay inside.");
      break;
    case 'thunderstorm':
      clientLog("It's a thunderstorm. Better take cover inside.");
      break;
    case 'tornado':
      clientLog("It's a tornado! Hide for your life!");
      break;
    case 'blizzard':
      clientLog("It's a blizzard. Hope we don't get snowed in.");
      break;
    default:
      clientLog('Weather error:', currentWeather);
      break;
  }
}

// Function to make foxes hunt bunnies
async function foxesHuntBunnies() {
  foxes = animals.filter((animal) => animal.type === 'Fox');
  await predatorHuntsPrey({
    predatorType: 'Fox',
    preyType: 'Bunny',
    spawnChance: 1 / foxes.length,
    proximityThreshold: 1.5,
  });
}

async function predatorHuntsPrey({
  predatorType,
  preyType,
  spawnChance = 0, // Probability of spawning a new predator after a successful hunt (0-1)
  spawnType = null, // Type of predator to spawn (defaults to the same as predatorType)
  proximityThreshold = 1.5, // Distance within which the prey can be hunted
}) {
  const predators = animals.filter((animal) => animal.type === predatorType);
  let prey = animals.filter((animal) => animal.type === preyType);
  const targetedPrey = new Set();

  for (const predator of predators) {
    if (prey.length === 0) return;

    // Find the closest prey to the predator that hasn't been targeted yet
    const closestPrey = prey.reduce(
      (closest, currentPrey) => {
        if (targetedPrey.has(currentPrey._id.toString())) return closest;
        const distance = Math.hypot(
          predator.location.x - currentPrey.location.x,
          predator.location.y - currentPrey.location.y
        );
        return distance < closest.distance ? { prey: currentPrey, distance } : closest;
      },
      { prey: null, distance: Infinity }
    );

    if (closestPrey.prey) {
      targetedPrey.add(closestPrey.prey._id.toString());

      await new Promise((resolve) => {
        moveToTarget(predator, closestPrey.prey.location.x, closestPrey.prey.location.y, async () => {
          // Check if the prey is within the proximity threshold of the predator
          const distance = Math.hypot(
            closestPrey.prey.location.x - predator.location.x,
            closestPrey.prey.location.y - predator.location.y
          );

          if (distance <= proximityThreshold) {
            clientLog(
              `${predator.type} hunted a ${preyType} at (${closestPrey.prey.location.x}, ${closestPrey.prey.location.y})`
            );

            // Remove the prey from animals array and database
            animals = animals.filter((a) => a._id.toString() !== closestPrey.prey._id.toString());
            prey = prey.filter((p) => p._id.toString() !== closestPrey.prey._id.toString());
            await Animal.deleteOne({ _id: closestPrey.prey._id });

            // Spawn a new predator with the specified chance
            if (Math.random() < spawnChance) {
              const newPredatorType = spawnType || predatorType;
              spawnEntity('animals', newPredatorType, predator.location.x, predator.location.y);
              console.log(`A new ${newPredatorType} spawned at (${predator.location.x}, ${predator.location.y})`);
            }
          } else {
            console.log(
              `${predator.type} reached the target but the ${preyType} was not within range (distance: ${distance}).`
            );
          }

          resolve(); // Continue after processing this prey
        });
      });
    }
  }
}

// Function to perform farming
function performFarming(villager) {
  if (!villager) return;

  // Farming activities can include milking cows or making cheese
  const farmingJobs = [milkCow, makeCheese];
  const jobToPerform = farmingJobs[getRandomInt(0, farmingJobs.length - 1)];
  jobToPerform(villager);
}

// Function to milk a cow
function milkCow(villager) {
  const cows = animals.filter((animal) => animal.type === 'Cow');
  if (cows.length === 0) {
    clientLog('No cows available to milk.');
    return;
  }

  // Find the closest cow
  const closestCow = cows.reduce(
    (closest, cow) => {
      const distance = Math.hypot(villager.location.x - cow.location.x, villager.location.y - cow.location.y);
      return distance < closest.distance ? { cow, distance } : closest;
    },
    { cow: null, distance: Infinity }
  );

  if (closestCow.cow) {
    moveToTarget(villager, closestCow.cow.location.x, closestCow.cow.location.y, () => {
      clientLog(
        `${villager.name} milked a cow at (${closestCow.cow.location.x}, ${closestCow.cow.location.y})`
      );
      resources.milk += 2;
      resources.markModified('milk');
    });
  }
}

// Function to make cheese at the barn
function makeCheese(villager) {
  const barn = houses.find((building) => building.type === 'Barn');
  if (barn) {
    goToBuilding(villager, barn, () => {
      if (resources.milk >= 5) {
        clientLog(`${villager.name} made cheese at the barn.`);
        resources.milk -= 5;
        resources.cheese += 3;
        resources.markModified('milk');
        resources.markModified('cheese');
      } else {
        clientLog(`${villager.name} couldn't make cheese. Not enough milk.`);
        milkCow(villager);
      }
    });
  } else {
    clientLog('No barn found for cheese making.');
  }
}

async function villagerActivities() {
  villagers.forEach((villager) => {
    if (!villager) return;
    // Choose a random skill for the villager to perform
    const villagerSkills = villager.skills;
    const skill = villagerSkills[Math.floor(Math.random() * villagerSkills.length)];
    const fears = villager.fears;

    if (isDay) {
      // Perform the skill
      switch (weather) {
        case 'sunny':
          switch (skill) {
            case 'woodcutting':
              clientLog(`${villager.name} is performing woodcutting.`);
              performWoodcutting(villager);
              break;
            case 'hunting':
              clientLog(`${villager.name} is performing hunting.`)
              performHunting(villager);
              break;
            case 'farming':
              clientLog(`${villager.name} is performing farming.`)
              performFarming(villager);
              break;
            case 'make jerky':
              clientLog(`${villager.name} is performing making jerky.`)
              performMakeJerky(villager);
            default:
              clientLog(`${villager.name} has no valid skill to perform.`);
          }
          break;
        case 'rainy':
          sendVillagerHome(villager);
          performIndoorActivities(villager);
          break;
        case 'thunderstorm':
          sendVillagerHome(villager);
          performIndoorActivities(villager);
          if (fears.includes('thunder')) {
            villager.happiness -= 10;
          }
          break;
        default:
          clientLog(`${villager.name} is unsure what to do.`);
          break;
      }
    }
  });
}

// Function to perform indoor activities by villagers
function performIndoorActivities(villager) {
  let activities = ['eat', 'daydream', 'solitaire'];
  villager.hobbies.forEach((hobby) => {
    activities.push(hobby);
  });
  // Select random hobby to perform
  let activity = activities[Math.floor(Math.random() * activities.length)];
  clientLog(`${villager.name} is performing ${activity} activity.`);
  switch (activity) {
    case 'eat':
      consumeResources(villager);
      break;
    case 'daydream':
      clientLog(`${villager.name} is daydreaming.`);
      villager.happiness += 1;
      break;
    case 'solitaire':
      clientLog(`${villager.name} is playing solitaire.`);
      villager.happiness += 1;
      break;
    case 'whittle':
      performWhittling(villager);
      break;
    default:
      clientLog(`${villager.name} is engaging in ${activity}.`);
      villager.happiness += 1;
      break;
  }
}

// Function to perform daily activities by villagers
function performDailyActivities() {
  villagerActivities();
  foxesHuntBunnies();
  bobcatCullAnimals();
}

// Function to perform nightly activities
async function performNightActivities() {
  sendVillagersHome();
  for (const villager of [...villagers]) {
    consumeResources(villager);
  }
  dailySpawn();
  ageTrees();
}

function performHunting(villager) {
  if (!villager) return;

  const huntingType = getRandomInt(0, 10);
  let huntableAnimals;

  if (huntingType == 0) {
      clientLog(villager.name + " is big game hunting.");
      huntableAnimals = animals.filter((animal) => animal.type === 'Elk');
  } else {
      huntableAnimals = animals.filter((animal) => animal.type === 'Fox' || animal.type === 'Bunny' || animal.type === 'Elk');
  }

  if (huntableAnimals.length === 0) return;

  const closestAnimal = huntableAnimals.reduce(
      (closest, animal) => {
          const distance = Math.hypot(villager.location.x - animal.location.x, villager.location.y - animal.location.y);
          return distance < closest.distance ? { animal, distance } : closest;
      },
      { animal: null, distance: Infinity }
  );

  if (closestAnimal.animal) {
      moveToTarget(villager, closestAnimal.animal.location.x, closestAnimal.animal.location.y, async () => {
          clientLog(
              `${villager.name} hunted a ${closestAnimal.animal.type} at (${closestAnimal.animal.location.x}, ${closestAnimal.animal.location.y})`
          );

          // Increase meat resources
          resources.meat += closestAnimal.animal.meat; // Adjust amount as needed
          resources.markModified('meat');

          // Remove the hunted animal from the list and database
          animals = animals.filter((a) => a._id.toString() !== closestAnimal.animal._id.toString());
          try {
              await Animal.deleteOne({ _id: closestAnimal.animal._id });
          } catch (error) {
              clientLog(`Error deleting animal: ${error.message}`);
          }

          if (huntingType == 0) {
              villager.possessions.push({"Animal Trophy": 10});
              villager.markModified('possessions');
          }
      });
  }
}

// Function to perform woodcutting
async function performWoodcutting(villager) {
  if (!villager) return;

  const woodint = randomInt(20);
  let chosenTree;

  if (woodint > 1) {
    // Find the closest tree
    chosenTree = trees.reduce(
      (closest, tree) => {
        const distance = Math.hypot(
          villager.location.x - tree.location.x,
          villager.location.y - tree.location.y
        );
        return distance < closest.distance ? { tree, distance } : closest;
      },
      { tree: null, distance: Infinity }
    ).tree; // Extract the tree from the closest object
  } else if (woodint === 1) {
    // Find the tree with the highest age
    chosenTree = trees.reduce(
      (oldest, tree) => {
        return tree.age > oldest.age ? tree : oldest;
      },
      { age: -Infinity } // Dummy tree with very low age
    );
  }

  if (chosenTree) {
    console.log(
      `${villager.name} found a tree to fell at (${chosenTree.location.x}, ${chosenTree.location.y}).`
    );

    moveToTarget(villager, chosenTree.location.x, chosenTree.location.y, async () => {
      console.log(
        `${villager.name} cut down a tree at (${chosenTree.location.x}, ${chosenTree.location.y}).`
      );

      // Remove the cut-down tree from the list and database
      trees = trees.filter((tree) => tree._id.toString() !== chosenTree._id.toString());
      await Tree.deleteOne({ _id: chosenTree._id });

      // Increase the wood resources
      clientLog(
        `A tree was cut down at (${villager.location.x}, ${villager.location.y}) and got ${chosenTree.wood} wood.`
      );
      resources.wood += chosenTree.wood;
      resources.markModified('wood');
    });
  } else {
    clientLog(`${villager.name} couldn't find any trees to cut down.`);
  }
}



async function moveToTarget(villager, targetX, targetY, callback) {
  console.log(
    `${villager.name} is moving to (${targetX}, ${targetY}).`
  );
  // Simulate movement with a delay
  await new Promise((resolve) => setTimeout(resolve, 1000));
  villager.location.x = targetX;
  villager.location.y = targetY;
  console.log(`${villager.name} has arrived at (${targetX}, ${targetY}).`);
  if (callback) callback();
}


function performWhittling(villager) {
  // Turn wood into item
  if (resources.wood > 10 * villagers.length) {
    resources.wood -= 1;
    resources.markModified('wood');
    villager.possessions.push({'Wooden Trinket': 5});
    villager.markModified('possessions');
    clientLog(`${villager.name} whittled a wooden trinket.`);
  } else {
    clientLog('There is not enough wood to whittle.');
  }
}

function performMakeJerky(villager) {
  // Turn meat into jerky
  if (resources.meat > 10 * villagers.length) {
    resources.meat -= 10;
    resources.markModified('meat');
    resources.jerky += 5
  }
}


//age trees
function ageTrees() {
  trees.forEach(tree => {
    tree.age += 1;
    tree.wood += 1;
  });
}

// add to logs
function addLogMessage(message) {
  logMessages.push(message);
  if (logMessages.length > 20) {
    logMessages.shift(); // Remove the oldest message
  }
}

// Send logs
function sendLogMessagesToClient(socket, message) {
  socket.emit("logMessage", message);
}

function sendAllLogs(socket) {
  for (const message of logMessages) {
    sendLogMessagesToClient(socket, message);
  }
}

// send log message to clint
function clientLog(message) {
  addLogMessage(message);
  console.log(message);
  io.emit("logMessage", message);
}



// Average happiness of villagers and set villageHappiness to the average
function findVillageHappiness() {
  const filteredVillagers = villagers.filter((v) => v.happiness > 0);
  if (filteredVillagers.length > 0) {
    const averageHappiness =
      filteredVillagers.reduce((acc, villager) => acc + villager.happiness, 0) / filteredVillagers.length;
    statuses.villageHappiness = averageHappiness;
  } else {
    statuses.villageHappiness = 10;
  }
}

// Broadcast village state to all connected clients
function broadcastVillageState() {
  io.sockets.emit('villageUpdate', {
    villagers,
    houses,
    trees,
    animals,
    isDay,
    resources: resources.toObject(), // Convert to plain object
    statuses,
  });
}

// Function to save updated entities to the database
async function updateEntities() {
  // Update villagers
  for (const villager of villagers) {
    try {
      if (villager.isModified()) {
        await villager.save();
      }
    } catch (error) {
      console.error(`Error saving villager ${villager.name}:`, error);
    }
  }

  // Update animals
  for (const animal of animals) {
    try {
      if (animal.isModified()) {
        await animal.save();
      }
    } catch (error) {
      console.error(`Error saving animal ${animal.type}:`, error);
    }
  }

  // Update houses (buildings)
  for (const house of houses) {
    try {
      if (house.isModified()) {
        await house.save();
      }
    } catch (error) {
      console.error(`Error saving building ${house.name}:`, error);
    }
  }

  // Update trees
  for (const tree of trees) {
    try {
      if (tree.isModified()) {
        await tree.save();
      }
    } catch (error) {
      console.error(`Error saving tree ${tree.type}:`, error);
    }
  }

  // Update resources
  try {
    if (resources.isModified()) {
      await resources.save(); // Save the Mongoose document
    }
  } catch (error) {
    console.error(`Error saving resources:`, error);
  }
  //console.log('DB updated.')
}

// Function to start the simulation
function startSimulation() {
  let lastLocationUpdateTime = Date.now();

  // Run the simulation even if nobody is connected
  setInterval(async () => {
    try {
      // Get the current time
      const now = Date.now();
      const currentMinute = new Date().getMinutes() % 5; // Modulo 5 to get the minute within the 5-minute cycle

      // Update day-night cycle
      isDay = currentMinute < 3; // Minutes 0-2 are day, minutes 3-4 are night

      if (previousIsDay !== isDay) {
        if (!isDay) {
          clientLog('A new night begins!');
          await performNightActivities();
          // Nighttime weather behavior if any
        } else {
          clientLog('A new day begins!');
          weather = changeWeather(weather);
          weatherBehavior(weather);
          performDailyActivities();
        }
        previousIsDay = isDay;
      }

      // Decide whether to save location updates
      let saveLocationUpdates = false;
      if (now - lastLocationUpdateTime >= 60000) {
        saveLocationUpdates = true;
        lastLocationUpdateTime = now;
      }

      updatePositions(saveLocationUpdates); // Update positions every second

      broadcastVillageState();
      findVillageHappiness();


      // Save updated entities to the database
      await updateEntities();
    } catch (error) {
      console.error('Error in simulation loop:', error);
    }
  }, timeStep);
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Handle client connections
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit('villageUpdate', {
    villagers,
    houses,
    trees,
    animals,
    isDay,
    resources: resources.toObject(), // Convert to plain object
    statuses,
  }); // Send initial state

  // Send logs to client
  sendAllLogs(socket)



  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });

  // run resetVillage() when "reset" message is recieved from client
  socket.on('reset', () => {
    clientLog("reset village")
    resetVillage();
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
