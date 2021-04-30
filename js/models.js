const TYPE_HOME_ANT = 1;
const TYPE_FOOD_ANT = 0;
const DEFAULT_POSITION = [0, 0];
const DEFAULT_ANGLE = 0;
const FULL_STAMINA = 1.00;
const DEFAULT_TIME_SCALE = 1;
const DEFAULT_ANTS_NUMBER = 1000;
const DEFAULT_COLONY_RADIUS = 100;
const DEFAULT_FOOD_RADIUS = 20;
const ANT_SIZE = [4, 6];
const ANT_SPEED = 1;
let DEFAULT_CPS = 50;
let DEFAULT_STEP_SIZE = 1;

class Ant {
  constructor(type, x, y, stamina, angle, pheromoneStrength) {
    this.type = type || TYPE_HOME_ANT;
    this.x = x || DEFAULT_POSITION[0];
    this.y = y || DEFAULT_POSITION[1];
    this.stamina = stamina || FULL_STAMINA;
    this.angle = angle || DEFAULT_ANGLE;
    this.pheromoneStrength = pheromoneStrength || 1;
  }
}

class Simulation {
  constructor(config) {
    this.config = config;
    this.state = 0;
    this.cycles = 0;
    this.ants = [];
    this.pheromonesBuffer = new Uint8ClampedArray(config.canvas.width * config.canvas.height * 4);
  }
  generateAnts(toGenerate) {
    for (let i = 0; i < toGenerate; i++) {
      this.ants.push(this.generateRandomAnt());
    }
    this.config.antsNumber = this.ants.length;
  }
  generateRandomAnt() {
    let angle = randomAngle();
    function randomAngle() {
      return Math.random() * 360;
    }
    function randomPosition(config, randAngle) { // generate a random position inside the colony (circle)
      // we take sqrt of the random number to make sure the positions are spread more evenly across the circle
      let r = Math.sqrt(Math.random()) * config.colonyRadius;
      // we orient the ant based on its positions to make sure it's facing the outside
      let theta = randAngle - 90;
      // to cancel the orienting simply make theta = randomAngle()
      let x = config.colonyPosition[0] + Math.cos(theta * Math.PI / 180) * r;
      let y = config.colonyPosition[1] + Math.sin(theta * Math.PI / 180) * r;
      return [x, y];
    }
    let randPos = randomPosition(this.config, angle);
    return new Ant(TYPE_HOME_ANT, randPos[0], randPos[1], 1, angle, 1);
  }
  step(step) {
    let ant;
    let xPos;
    let yPos;
    let correctedAngle;
    let cyclesPerUpdate = 1;

    // decay old pheromone
    if (this.cycles % cyclesPerUpdate === 0) {
      let offScreenIData = new ImageData(this.pheromonesBuffer, this.config.canvas.width, this.config.canvas.height);
      imagedataFilters.brightness(offScreenIData, {amount: 0.98});// (0.98)^x
      this.pheromonesBuffer = offScreenIData.data;
    }

    // calculate ant's next state
    for (let i = 0; i < this.config.antsNumber; i++) {
      ant = this.ants[i];
      xPos = ant.x;
      yPos = ant.y;

      // ants produce weaker pheromones each step
      if (this.cycles % cyclesPerUpdate === 0) {
        ant.pheromoneStrength *= 254 / 255;
      }

      // adding pheromone
      if (this.cycles % cyclesPerUpdate === 0) {
        // adding new pheromone
        // position in buffer based on x and y
        let strength = ant.pheromoneStrength;
        strength *= 255;
        let pos = (Math.floor(yPos) * this.config.canvas.width + Math.floor(xPos)) * 4;
        // this.pheromonesBuffer[pos  ] = 0;      // R value [0, 255]
        if (ant.type === TYPE_FOOD_ANT){
          if (strength>this.pheromonesBuffer[pos+1])
            this.pheromonesBuffer[pos+1] = strength;  // G value
        }
        if (ant.type === TYPE_HOME_ANT){
          if (strength>this.pheromonesBuffer[pos+2])
            this.pheromonesBuffer[pos+2] = strength;  // B value
        }
        this.pheromonesBuffer[pos+3] = 255;    // alpha channel
      }

      // each step the ant will make a little rotate randomly
      if (this.cycles % cyclesPerUpdate === 0) {
        ant.angle += (Math.random()*2-1) * 5;
      }

      // ants rotate based on the concentration of pheromones in front of it
      if (this.cycles % cyclesPerUpdate === 0) {
        let concentrations = concentrationInFront(ant.x, ant.y, ant.angle, this.pheromonesBuffer, this.config);
        let rotationAngle = 60;
        let LC;
        let MC;
        let RC;
        if (ant.type === TYPE_FOOD_ANT){
          LC = concentrations.leftConcentration.homeConcentration;
          MC = concentrations.middleConcentration.homeConcentration;
          RC = concentrations.rightConcentration.homeConcentration;
        }
        if (ant.type === TYPE_HOME_ANT){
          LC = concentrations.leftConcentration.foodConcentration;
          MC = concentrations.middleConcentration.foodConcentration;
          RC = concentrations.rightConcentration.foodConcentration;
        }
        if ((LC > MC)||(RC > MC)) {
          if(LC > RC) {
            ant.angle -= rotationAngle;
          } else if(RC > LC) {
            ant.angle += rotationAngle;
          }
        }
      }

      // we substrate 90 degrees because the canvas 0 angle is correspond to 90 degrees in euclidean space
      correctedAngle = angleModulo(ant.angle - 90);
      // then we calculate the projection of the step on X an Y axes
      xPos += step * Math.cos(correctedAngle * Math.PI / 180);
      yPos += step * Math.sin(correctedAngle * Math.PI / 180);

      // check if the new X position is inside the terrain
      while (!isXInsideTerrain(this.config ,xPos)){
        // if not reflect the angle and calculate the X position again
        ant.angle = -ant.angle;
        correctedAngle = ant.angle - 90;
        xPos = ant.x;
        xPos += step * Math.cos(correctedAngle * Math.PI / 180);
        // when an ant hits the wall it produce weaker pheromones
        ant.pheromoneStrength /= 8;
      }
      // same for the Y position
      while (!isYInsideTerrain(this.config ,yPos)) {
        ant.angle = 180-ant.angle;
        correctedAngle = ant.angle - 90;
        yPos = ant.y;
        yPos += step * Math.sin(correctedAngle * Math.PI / 180);
        // when an ant hits the wall it produce weaker pheromones
        ant.pheromoneStrength /= 8;
      }

      if(isInsideFood(this.config, xPos, yPos)) {
        ant.pheromoneStrength = 1;
        if (ant.type === TYPE_HOME_ANT) {
          ant.type = TYPE_FOOD_ANT;
          ant.angle += 180;
        }
      }
      if(isInsideColony(this.config, xPos, yPos)) {
        ant.pheromoneStrength = 1;
        if (ant.type === TYPE_FOOD_ANT) {
          ant.type = TYPE_HOME_ANT;
          ant.angle += 180;
        }
      }

      // apply the new position
      ant.x = xPos;
      ant.y = yPos;
      // make sure the angle is between 0 and 360 (360 modulo)
      ant.angle = angleModulo(ant.angle);
    }

    function isXInsideTerrain(config, x) {
      return (x > 0 && x < config.canvas.width);
    }
    function isYInsideTerrain(config, y) {
      return (y > 0 && y < config.canvas.height);
    }
    function isInsideFood(config, x, y) {
      let distance = Math.pow(config.foodPosition[0]-x, 2)+Math.pow(config.foodPosition[1]-y, 2);
      return distance < Math.pow(config.foodRadius, 2);
    }
    function isInsideColony(config, x, y) {
      let distance = Math.pow(config.colonyPosition[0]-x, 2)+Math.pow(config.colonyPosition[1]-y, 2);
      return distance < Math.pow(config.colonyRadius, 2);
    }
    function toRadian(angle) {
      return angle * Math.PI / 180;
    }
    function angleModulo(angle) {
      return (angle%360 + 360) % 360;
    }
    function concentrationInFront(x, y, antAngle, buffer, config) {
      // calculate the concentration of pheromones in 3 areas in front of the ant

      // correct the angle
      antAngle -= 90; // TODO : why?

      // width of sampling area
      let amp =18;

      // far the sampling areas are from the given position
      let lookForward = 20;

      // angle between sampling areas
      let fovAngle = 120;

      // angles of left and right areas
      let leftAngle = antAngle - fovAngle/2;
      let rightAngle = antAngle + fovAngle/2;

      // make sure the angles are between 0 and 360
      antAngle = angleModulo(antAngle);
      leftAngle = angleModulo(leftAngle);
      rightAngle = angleModulo(rightAngle);

      // positions of sampling areas
      let leftPos = [x + lookForward*Math.cos(toRadian(leftAngle)), y + lookForward*Math.sin(toRadian(leftAngle))];
      let centerPos = [x + lookForward*Math.cos(toRadian(antAngle)), y + lookForward*Math.sin(toRadian(antAngle))];
      let rightPos = [x + lookForward*Math.cos(toRadian(rightAngle)), y + lookForward*Math.sin(toRadian(rightAngle))];

      // concentration of each area
      let leftConcentration = pheromoneConcentration(leftPos[0], leftPos[1], amp, buffer, config);
      let middleConcentration = pheromoneConcentration(centerPos[0], centerPos[1], amp, buffer, config);
      let rightConcentration = pheromoneConcentration(rightPos[0], rightPos[1], amp, buffer, config);


      function pheromoneConcentration(x, y, amp, buffer, config) {
        // TODO : run on gpu
        x = Math.floor(x);
        y = Math.floor(y);
        amp = Math.floor(amp);
        let homeConcentration = 0;
        let foodConcentration = 0;
        let r,g,b,a;
        let pos;
        let maxPossibleValue = (255*255*amp*8);
        amp = amp/2;

        for (let currentY = y-amp; currentY < y+amp ; currentY++) {
          for (let currentX = x-amp; currentX < x+amp ; currentX++) {
            pos = (currentY * config.canvas.width + currentX) * 4;
            //r = buffer[pos  ] || 0;          // some R value [0, 255]
            g = buffer[pos+1] || 0;          // some G value
            b = buffer[pos+2] || 0;          // some B value
            a = buffer[pos+3] || 0;          // set alpha channel
            homeConcentration += b*a;
            foodConcentration += g*a;
          }
        }


        // scale to a value between 0 and 1
        homeConcentration = homeConcentration/maxPossibleValue;
        foodConcentration = foodConcentration/maxPossibleValue;

        //
        homeConcentration = Math.pow(homeConcentration, 1/4);
        foodConcentration = Math.pow(foodConcentration, 1/4);

        return {
          homeConcentration : homeConcentration,
          foodConcentration : foodConcentration
        }
      }

      return {
        leftConcentration: leftConcentration,
        middleConcentration: middleConcentration,
        rightConcentration: rightConcentration
      };
    }

    this.cycles++;
    return true;
  }
  deleteRandomAnts(toDelete) {
    let ants = this.ants;
    let randomIndex;
    for (let i = 0; i < toDelete; i++) {
      randomIndex = Math.floor(Math.random() * this.config.antsNumber);
      ants.splice(randomIndex, 1);
      this.config.antsNumber--;
    }
  }
}

class Configurations {
  // TODO: add multi foods and colony support
  constructor(timeScale, antsNumber, colonyRadius, colonyPosition, foodRadius,
              foodPosition, antSize, antSpeed, cps, stepSize) {
    this.canvas = document.querySelector("#canvas");
    this.timeScale = timeScale || DEFAULT_TIME_SCALE;
    this.antsNumber = antsNumber || DEFAULT_ANTS_NUMBER;
    this.colonyRadius = colonyRadius || DEFAULT_COLONY_RADIUS;
    this.colonyPosition = colonyPosition || [colonyRadius, colonyRadius]; //top left of screen
    this.foodRadius = foodRadius || DEFAULT_FOOD_RADIUS;
    this.foodPosition = foodPosition || [this.canvas.width - foodRadius, this.canvas.height - foodRadius]; //bottom right of screen
    this.antSize = antSize || ANT_SIZE;
    this.antSpeed = antSpeed || ANT_SPEED;
    this.cps = cps || DEFAULT_CPS;
    this.stepSize = stepSize || DEFAULT_STEP_SIZE;
  }
}
