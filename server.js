// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const { Console } = require('console');

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
  job: String,
  speed: { type: Number, default: 10 },
  happiness: { type: Number, default: 10 },
  location: {
    x: { type: Number, default: () => getRandomInt(0, VILLAGE_WIDTH) },
    y: { type: Number, default: () => getRandomInt(0, VILLAGE_HEIGHT) },
  },
});

const animalSchema = new mongoose.Schema({
  type: String,
  speed: { type: Number, default: 10 },
  location: {
    x: { type: Number, default: () => getRandomInt(0, VILLAGE_WIDTH) },
    y: { type: Number, default: () => getRandomInt(0, VILLAGE_HEIGHT) },
  },
  respawn: { type: Boolean, default: false },
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

// Day-Night cycle state
let isDay = true;
let previousIsDay = isDay;

// Simulated game time
const timeStep = 1000; // Time step in milliseconds

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
});

const Resource = mongoose.model('Resource', resourceSchema, 'resources_cl');

// Load initial village state from MongoDB, including resources
async function loadInitialData() {
  try {
    // Load villagers
    villagers = await Villager.find({});

    // Assign a random job to each villager on server start
    villagers.forEach((villager) => {
      if (villager.skills && villager.skills.length > 0) {
        villager.job = villager.skills[getRandomInt(0, villager.skills.length - 1)];
      }
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
}

// Utility function to move entity to a target and execute a callback when reached
function moveToTarget(entity, targetX, targetY, callback) {
  if (!entity) return;
  entity.target = { x: targetX, y: targetY };
  entity.callback = callback;
}

// Generalized function to move an entity to a building and execute a callback when reached
function goToBuilding(entity, building, callback) {
  if (!building || !entity || !building.location) return;
  moveToTarget(entity, building.location.x, building.location.y, callback);
}

// Update positions of villagers and animals
function updatePositions() {
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

    // Mark villager's location as modified
    villager.markModified('location');
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

    // Mark animal's location as modified
    animal.markModified('location');
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
}

// Function to consume resources and adjust villager happiness
function consumeResources(villager) {
  if (!villager) return;
  if (resources.wood > 0) {
    resources.wood = Math.max(0, resources.wood - 1);
    villager.happiness += 1;
    console.log(villager.name + ' has burned wood.');
  } else if (villager.happiness >= 6) {
    villager.happiness -= 5;
  }

  if (resources.meat > 0) {
    resources.meat = Math.max(0, resources.meat - 1);
    villager.happiness += 1;
    console.log(villager.name + ' has eaten meat.');
  } else if (villager.happiness >= 10) {
    villager.happiness -= 1;
  }

  if (resources.cheese > 0) {
    resources.cheese = Math.max(0, resources.cheese - 1);
    villager.happiness += 1;
    console.log(villager.name + ' has eaten cheese.');
  } else if (villager.happiness >= 20) {
    villager.happiness -= 1;
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

    console.log(
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
  // Spawn animals
  if (bunnies.length < 2) {
    const bunX = getRandomInt(0, VILLAGE_WIDTH);
    const bunY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('animals', 'Bunny', bunX, bunY);
    spawnEntity('animals', 'Bunny', bunX, bunY);
  }
  if (foxes.length < 1) {
    const foxX = getRandomInt(0, VILLAGE_WIDTH);
    const foxY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('animals', 'Fox', foxX, foxY);
  }

  // Spawn Trees
  if (trees.length < 10) {
    let treeX = getRandomInt(0, VILLAGE_WIDTH);
    let treeY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('trees', 'Oak', treeX, treeY);
    treeX = getRandomInt(0, VILLAGE_WIDTH);
    treeY = getRandomInt(0, VILLAGE_HEIGHT);
    spawnEntity('trees', 'Pine', treeX, treeY);
  }
}

// Function to make foxes hunt bunnies
function foxesHuntBunnies() {
  const foxes = animals.filter((animal) => animal.type === 'Fox');
  const bunnies = animals.filter((animal) => animal.type === 'Bunny');
  const targetedBunnies = new Set();

  foxes.forEach((fox) => {
    if (bunnies.length === 0) return;

    // Find the closest bunny to the fox that hasn't been targeted yet
    const closestBunny = bunnies.reduce(
      (closest, bunny) => {
        if (targetedBunnies.has(bunny)) return closest;
        const distance = Math.hypot(fox.location.x - bunny.location.x, fox.location.y - bunny.location.y);
        return distance < closest.distance ? { bunny, distance } : closest;
      },
      { bunny: null, distance: Infinity }
    );

    if (closestBunny.bunny) {
      targetedBunnies.add(closestBunny.bunny);
      moveToTarget(fox, closestBunny.bunny.location.x, closestBunny.bunny.location.y, async () => {
        console.log(`Fox hunted a Bunny at (${closestBunny.bunny.location.x}, ${closestBunny.bunny.location.y})`);
        // Remove the bunny from animals array and database
        const bunnyIndex = animals.indexOf(closestBunny.bunny);
        if (bunnyIndex !== -1) {
          animals.splice(bunnyIndex, 1);
          await Animal.deleteOne({ _id: closestBunny.bunny._id });
        }

        // Spawn new fox 1/3 times when the fox hunts a bunny
        if (getRandomInt(0, foxes.length) === 0) {
          spawnEntity('animals', 'Fox', fox.location.x, fox.location.y);
        }
      });
    }
  });
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
    console.log('No cows available to milk.');
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
      console.log(
        `${villager.name} milked a cow at (${closestCow.cow.location.x}, ${closestCow.cow.location.y})`
      );
      resources.milk += 2;
    });
  }
}

// Function to make cheese at the barn
function makeCheese(villager) {
  const barn = houses.find((building) => building.type === 'Barn');
  if (barn) {
    goToBuilding(villager, barn, () => {
      if (resources.milk >= 5) {
        console.log(`${villager.name} made cheese at the barn.`);
        resources.milk -= 5;
        resources.cheese += 3;
      } else {
        console.log(`${villager.name} couldn't make cheese. Not enough milk.`);
        milkCow(villager);
      }
    });
  } else {
    console.log('No barn found for cheese making.');
  }
}

// Function to perform daily activities by villagers
function performDailyActivities() {
  villagers.forEach((villager) => {
    if (!villager) return;
    // Choose a random skill for the villager
    const skill = villager.job;

    switch (skill) {
      case 'woodcutting':
        performWoodcutting(villager);
        break;
      case 'hunting':
        performHunting(villager);
        break;
      case 'farming':
        performFarming(villager);
        break;
      default:
        console.log(`${villager.name} has no valid skill to perform.`);
    }
  });
  foxesHuntBunnies();
}

// Function to perform nightly activities
async function performNightActivities() {
  for (const villager of [...villagers]) {
    consumeResources(villager);

    if (villager.happiness <= 0) {
      console.log(`${villager.name} has died due to low happiness.`);
      // Remove from in-memory array
      villagers = villagers.filter((v) => v._id.toString() !== villager._id.toString());
      // Remove from database
      await Villager.deleteOne({ _id: villager._id });
      continue; // Skip the rest of the loop for this villager
    }

    // Go to closest house with villager on residents list
    const closestHouse = houses.find((house) => house.residents && house.residents.includes(villager.name));
    if (closestHouse) {
      goToBuilding(villager, closestHouse);
    }
  }
  dailySpawn();
}

// Function to perform hunting
function performHunting(villager) {
  if (!villager) return;

  // Find the closest huntable animal (e.g., Fox, Bunny)
  const huntableAnimals = animals.filter((animal) => animal.type === 'Fox' || animal.type === 'Bunny');
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
      console.log(
        `${villager.name} hunted a ${closestAnimal.animal.type} at (${closestAnimal.animal.location.x}, ${closestAnimal.animal.location.y})`
      );

      // Remove the hunted animal from the list and database
      const animalIndex = animals.findIndex(
        (a) => a._id.toString() === closestAnimal.animal._id.toString()
      );
      if (animalIndex !== -1) {
        animals.splice(animalIndex, 1);
        await Animal.deleteOne({ _id: closestAnimal.animal._id });
      }

      // Increase meat resources
      resources.meat += 5; // Adjust amount as needed
    });
  }
}

// Function to perform woodcutting
async function performWoodcutting(villager) {
  if (!villager) return;

  // Find the closest tree
  const closestTree = trees.reduce(
    (closest, tree) => {
      const distance = Math.hypot(villager.location.x - tree.location.x, villager.location.y - tree.location.y);
      return distance < closest.distance ? { tree, distance } : closest;
    },
    { tree: null, distance: Infinity }
  );

  if (closestTree.tree) {
    moveToTarget(villager, closestTree.tree.location.x, closestTree.tree.location.y, async () => {
      console.log(
        `${villager.name} cut down a tree at (${closestTree.tree.location.x}, ${closestTree.tree.location.y})`
      );
      // Remove the cut-down tree from the list and database
      trees = trees.filter((tree) => tree._id.toString() !== closestTree.tree._id.toString());
      await Tree.deleteOne({ _id: closestTree.tree._id });
      // Increase the wood resources
      resources.wood += closestTree.tree.wood;
    });
  }
}

// Average happiness of villagers and set villageHappiness to the average
function findVillageHappiness() {
  const filteredVillagers = villagers.filter((v) => v.happiness > 0);
  if (filteredVillagers.length > 0) {
    const averageHappiness =
      filteredVillagers.reduce((acc, villager) => acc + villager.happiness, 0) /
      filteredVillagers.length;
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
async function updateEntities(saveLocationUpdates) {
  // Update villagers
  for (const villager of villagers) {
    try {
      if (!saveLocationUpdates) {
        // Unmark location so it won't be saved
        villager.unmarkModified('location');
      }
      await villager.save();
    } catch (error) {
      console.error(`Error saving villager ${villager.name}:`, error);
    }
  }

  // Update animals
  for (const animal of animals) {
    try {
      if (!saveLocationUpdates) {
        // Unmark location so it won't be saved
        animal.unmarkModified('location');
      }
      await animal.save();
    } catch (error) {
      console.error(`Error saving animal ${animal.type}:`, error);
    }
  }

  // Update houses (buildings)
  for (const house of houses) {
    try {
      await house.save();
    } catch (error) {
      console.error(`Error saving building ${house.name}:`, error);
    }
  }

  // Update trees
  for (const tree of trees) {
    try {
      await tree.save();
    } catch (error) {
      console.error(`Error saving tree ${tree.type}:`, error);
    }
  }

  // Update resources
  try {
    await resources.save(); // Save the Mongoose document
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
    // Get the current time
    const now = Date.now();
    const currentMinute = new Date().getMinutes() % 5; // Modulo 5 to get the minute within the 5-minute cycle

    // Update day-night cycle
    isDay = currentMinute < 3; // Minutes 0-2 are day, minutes 3-4 are night

    if (previousIsDay !== isDay) {
      if (!isDay) {
        console.log('A new night begins!');
        await performNightActivities();
      } else {
        console.log('A new day begins!');
        await performDailyActivities();
      }
      previousIsDay = isDay;
    }

    updatePositions(); // Update positions every second

    // Decide whether to save location updates
    let saveLocationUpdates = false;
    if (now - lastLocationUpdateTime >= 60000) {
      saveLocationUpdates = true;
      lastLocationUpdateTime = now;
    }

    broadcastVillageState();
    findVillageHappiness();

    // Save updated entities to the database
    await updateEntities(saveLocationUpdates);
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

  
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
