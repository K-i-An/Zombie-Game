(() => {
  "use strict";

  // Canvas + DPI
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const mctx = minimap.getContext("2d");
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resize() {
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // UI elements
  const hudXP = document.getElementById("score");
  const hudLevel = document.getElementById("level");
  const hudTiles = document.getElementById("tiles");
  const hudHP = document.getElementById("health");
  const hudFood = document.getElementById("food");
  const hudRes = document.getElementById("res");
  const overlay = document.getElementById("overlay");
  const gameover = document.getElementById("gameover");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const finalScore = document.getElementById("finalScore");
  const claimPrompt = document.getElementById("claimPrompt");
  const claimCostEl = document.getElementById("claimCost");
  const zfreeSelect = document.getElementById("zfree");
  const goToggle = document.getElementById("goToggle");

  // Helpers
  const TILE_SIZE = 640; // px in world space
  const HALF_TILE = TILE_SIZE / 2;
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function len(x, y) { return Math.hypot(x, y); }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function keyFor(ix, iy) { return ix + "," + iy; }
  function worldToTile(x, y) { return { ix: Math.floor(x / TILE_SIZE), iy: Math.floor(y / TILE_SIZE) }; }
  function tileOrigin(ix, iy) { return { x: ix * TILE_SIZE, y: iy * TILE_SIZE }; }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max)); }

  // Calculate max HP based on level
  function calculateMaxHP(level) {
    return 100 + (level - 1) * 10;
  }

  // Input
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  window.addEventListener("keydown", e => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove", e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  window.addEventListener("mousedown", () => mouse.down = true);
  window.addEventListener("mouseup", () => mouse.down = false);

  // Entities and state
  const state = {
    running: false,
    timePrev: 0,
    elapsed: 0,
    camera: { x: 0, y: 0 },
    player: { x: 0, y: 0, r: 14, hp: 100, maxHP: 100, speed: 220, fireCd: 0 },
    bullets: [],
    zombies: [],
    animals: [],
    tiles: new Map(), // key -> { owned, revealed, resources, animalsSpawned, pen }
    ownedSet: new Set(),
    revealedSet: new Set(),
    base: { ix: 0, iy: 0, food: 100, foodRate: 0.5 },
    resources: { stone: 0, clay: 0, wood: 0, straw: 0 },
    xp: 0,
    level: 1,
    spawnTimer: 0,
    grace: 3, // seconds of protection
    zombieFreeUntil: 600, // seconds (10 minutes)
    gameOverEnabled: false,
    domesticated: {
      list: [], // [{ type, x, y, r, wander }]
      byType: { hase: 0, kaninchen: 0, huhn: 0 },
      breedTimers: { hase: 0, kaninchen: 0, huhn: 0 }
    },
    assignCooldown: 0
  };

  function createPen(){ return { exists:false, assignedByType:{hase:0,kaninchen:0,huhn:0}, list:[], breedTimers:{hase:0,kaninchen:0,huhn:0}, strawTimer: 0 }; }
  function createBuildings(){
    // 0-2 small buildings per tile, each may contain 0-3 canned food pickups
    const count = randInt(0, 2);
    const arr = [];
    for (let i=0;i<count;i++){
      const w = rand(60, 110), h = rand(60, 110);
      const x = rand(40, TILE_SIZE - w - 40);
      const y = rand(40, TILE_SIZE - h - 40);
      const cans = [];
      const canCount = randInt(0, 4);
      for (let c=0;c<canCount;c++){
        cans.push({ x: x + rand(10, w-10), y: y + rand(10, h-10), picked:false, amount: randInt(6, 16) });
      }
      arr.push({ x, y, w, h, cans, type: 'ruin', animals: [], foodGen: 0 });
    }
    return arr;
  }

  // Tile management
  function ensureTile(ix, iy) {
    const k = keyFor(ix, iy);
    if (!state.tiles.has(k)) {
      const resources = {
        stone: randInt(1, 4),
        clay: randInt(1, 4),
        wood: randInt(2, 6),
      };
      const resourcePoints = [];
      for (let i = 0; i < resources.stone; i++) {
        resourcePoints.push({ type: 'stone', x: rand(20, TILE_SIZE-20), y: rand(20, TILE_SIZE-20), respawnTimer: 0 });
      }
      for (let i = 0; i < resources.clay; i++) {
        resourcePoints.push({ type: 'clay', x: rand(20, TILE_SIZE-20), y: rand(20, TILE_SIZE-20), respawnTimer: 0 });
      }
      for (let i = 0; i < resources.wood; i++) {
        resourcePoints.push({ type: 'wood', x: rand(20, TILE_SIZE-20), y: rand(20, TILE_SIZE-20), respawnTimer: 0 });
      }
      state.tiles.set(k, { owned: false, revealed: false, resources, resourcePoints, animalsSpawned: false, pen:createPen(), buildings:createBuildings() });
    }
    return state.tiles.get(k);
  }

  function revealTile(ix, iy) {
    const t = ensureTile(ix, iy);
    if (!t.revealed) {
      t.revealed = true;
      state.revealedSet.add(keyFor(ix, iy));
    }
  }

  function ownTile(ix, iy) {
    const t = ensureTile(ix, iy);
    if (!t.owned) {
      t.owned = true;
      state.ownedSet.add(keyFor(ix, iy));
      // Add straw fields as 2x2 rectangles
      const strawSize = 40; // Size of each straw field
      const numFields = 2; // Number of 2x2 fields
      for (let i = 0; i < numFields; i++) {
        const baseX = rand(50, TILE_SIZE - 50 - strawSize);
        const baseY = rand(50, TILE_SIZE - 50 - strawSize);
        // Create 2x2 grid of straw points
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) {
            t.resourcePoints.push({
              type: 'straw',
              x: baseX + dx * strawSize,
              y: baseY + dy * strawSize,
              respawnTimer: 0
            });
          }
        }
      }
    }
  }

  function neighbors(ix, iy) {
    return [
      { ix: ix + 1, iy }, { ix: ix - 1, iy }, { ix, iy: iy + 1 }, { ix, iy: iy - 1 }
    ];
  }

  // Start state
  function reset() {
    state.player.x = HALF_TILE;
    state.player.y = HALF_TILE;
    state.player.hp = 100;
    state.player.maxHP = 100;
    state.player.fireCd = 0;
    state.bullets.length = 0;
    state.zombies.length = 0;
    state.animals.length = 0;
    state.tiles.clear();
    state.ownedSet.clear();
    state.revealedSet.clear();
    state.base = { ix: 0, iy: 0, food: 100, foodRate: 0.5 };
    state.resources = { stone: 0, clay: 0, wood: 0, straw: 0 };
    state.xp = 0;
    state.level = 1;
    state.spawnTimer = 0;
    state.elapsed = 0;
    state.grace = 3; // seconds of protection
    // take value from select (seconds)
    state.zombieFreeUntil = Number(zfreeSelect?.value || 600);
    state.gameOverEnabled = !!goToggle?.checked;
    state.domesticated = {
      list: [],
      byType: { hase: 0, kaninchen: 0, huhn: 0 },
      breedTimers: { hase: 0, kaninchen: 0, huhn: 0 }
    };
    state.assignCooldown = 0;

    revealTile(0, 0);
    ownTile(0, 0);
    spawnAnimalsInTile(0, 0);
    updateHUD();
  }

  // Claiming tiles
  function getClaimCost() {
    const owned = state.ownedSet.size;
    // simple scaling costs
    return {
      stone: 2 + Math.floor(owned * 0.5),
      clay: 2 + Math.floor(owned * 0.5),
      wood: 3 + Math.floor(owned * 0.75),
    };
  }
  function canAfford(cost) {
    return state.resources.stone >= cost.stone && state.resources.clay >= cost.clay && state.resources.wood >= cost.wood;
  }
  function payCost(cost) {
    state.resources.stone -= cost.stone;
    state.resources.clay -= cost.clay;
    state.resources.wood -= cost.wood;
  }
  function getPenCost(){ return { stone:3, clay:3, wood:6 }; }

  // Animals
  function spawnAnimalsInTile(ix, iy) {
    // Spawn only in non-owned tiles (wild outside base)
    const key = keyFor(ix, iy);
    if (state.ownedSet.has(key)) return;
    const t = ensureTile(ix, iy);
    if (t.animalsSpawned) return;
    t.animalsSpawned = true;
    const origin = tileOrigin(ix, iy);
    const count = randInt(0, 2);
    for (let i = 0; i < count; i++) {
      const type = ["hase", "kaninchen", "huhn"][randInt(0, 3)];
      state.animals.push({
        type,
        x: origin.x + rand(60, TILE_SIZE - 60),
        y: origin.y + rand(60, TILE_SIZE - 60),
        r: 10,
        alive: true,
        wild: true,
        wander: 0, // Added wander field
        vx: 0, // Added velocity fields
        vy: 0
      });
    }
  }

  // Zombies
  function spawnZombieOutsideOwned() {
    const margin = 40;
    const pTile = worldToTile(state.player.x, state.player.y);
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
    ];
    const dir = dirs[randInt(0, dirs.length)];
    let ix = pTile.ix + dir.x * 2;
    let iy = pTile.iy + dir.y * 2;
  
    // Stelle sicher, dass das Tile nicht owned und nicht direkt benachbart zu owned ist
    if (state.ownedSet.has(keyFor(ix, iy))) return;
    const neighbors = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
    ];
    for (let n of neighbors) {
      if (state.ownedSet.has(keyFor(ix + n.x, iy + n.y))) {
        return; // zu nah an einem owned Tile → keinen Spawn
      }
    }
  
    const basePos = tileOrigin(ix, iy);
    const x = basePos.x + rand(margin, TILE_SIZE - margin);
    const y = basePos.y + rand(margin, TILE_SIZE - margin);
  
    const speed = rand(60, 100) + (state.level - 1) * 10;
    const hp = 1 + Math.floor((state.level - 1) / 2);
    state.zombies.push({ x, y, r: 14, speed, hp });
  }

  // Combat
  function shoot(x, y, angle) {
    const speed = 520;
    state.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 4, ttl: 1.1 });
  }

  // HUD
  function updateHUD() {
    hudXP.textContent = `XP: ${state.xp}`;
    hudLevel.textContent = `Level: ${state.level}`;
    hudTiles.textContent = `Gebiete: ${state.ownedSet.size}`;
    hudHP.textContent = `HP: ${Math.max(1, Math.ceil(state.player.hp))}`;
    hudFood.textContent = `Lebensmittel: ${Math.max(0, Math.floor(state.base.food))}`;
    hudRes.textContent = `Stein: ${Math.floor(state.resources.stone)} · Lehm: ${Math.floor(state.resources.clay)} · Holz: ${Math.floor(state.resources.wood)} · Stroh: ${Math.floor(state.resources.straw)}`;
  }

  // Loop helpers
  function updatePlayer(dt) {
    const p = state.player;
    let dx = 0, dy = 0;
    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;
    if (dx || dy) {
      const n = norm(dx, dy);
      p.x += n.x * p.speed * dt;
      p.y += n.y * p.speed * dt;
    }

    // Shoot towards mouse when pressed
    p.fireCd -= dt;
    if (mouse.down && p.fireCd <= 0) {
      const ang = Math.atan2(screenToWorldY(mouse.y) - p.y, screenToWorldX(mouse.x) - p.x);
      shoot(p.x, p.y, ang);
      p.fireCd = 0.18;
    }

    // Camera follows player
    state.camera.x = p.x - canvas.clientWidth / 2;
    state.camera.y = p.y - canvas.clientHeight / 2;

    // Tile reveal/generation when crossing edge
    const pt = worldToTile(p.x, p.y);
    revealTile(pt.ix, pt.iy);
    spawnAnimalsInTile(pt.ix, pt.iy);
    for (const n of neighbors(pt.ix, pt.iy)) {
      revealTile(n.ix, n.iy);
      spawnAnimalsInTile(n.ix, n.iy);
    }
    
    // Collect resources when walking over them
    const currentTile = ensureTile(pt.ix, pt.iy);
    if (currentTile.resourcePoints) {
      for (let i = currentTile.resourcePoints.length - 1; i >= 0; i--) {
        const resource = currentTile.resourcePoints[i];
        if (resource.respawnTimer <= 0) {
          const resourceWorldX = tileOrigin(pt.ix, pt.iy).x + resource.x;
          const resourceWorldY = tileOrigin(pt.ix, pt.iy).y + resource.y;
          if (len(p.x - resourceWorldX, p.y - resourceWorldY) <= 20) {
            // Collect resource
            if (resource.type === 'stone') state.resources.stone += 1;
            else if (resource.type === 'clay') state.resources.clay += 1;
            else if (resource.type === 'wood') state.resources.wood += 1;
            else if (resource.type === 'straw') state.resources.straw += 1;

            // Set respawn timer (30 seconds for stone/clay/wood, 180 for straw)
            resource.respawnTimer = resource.type === 'straw' ? 180 : 30;
            updateHUD();
          }
        }
      }
    }

    // Claiming adjacent tile prompt
    const claim = findClaimableAdjacent(pt.ix, pt.iy);
    if (claim) {
      const cost = getClaimCost();
      claimCostEl.textContent = `Stein ${cost.stone}, Lehm ${cost.clay}, Holz ${cost.wood}`;
      claimPrompt.classList.remove("hidden");
      if (keys.has("e") && canAfford(cost)) {
        payCost(cost);
        ownTile(claim.ix, claim.iy);
        updateHUD();
      }
    } else {
      claimPrompt.classList.add("hidden");
    }

    // Build Pen on current owned tile
    const tile = ensureTile(pt.ix, pt.iy);
    if (tile.owned && !tile.pen.exists) {
      const cost = getPenCost();
      // show build hint in HUD bar
      hudTiles.textContent = `Gebiete: ${state.ownedSet.size} · B: Stall bauen (S${cost.stone}/L${cost.clay}/H${cost.wood})`;
      if (keys.has("b") && canAfford(cost)) { payCost(cost); tile.pen.exists = true; updateHUD(); }
    }
    
    // Build animal building with V key
    if (tile.owned && keys.has("v")) {
      const buildingCost = {stone: 2, clay: 2, wood: 4};
      if (canAfford(buildingCost)) {
        payCost(buildingCost);
        const w = 80, h = 80;
        const x = rand(40, TILE_SIZE-w-40), y = rand(40, TILE_SIZE-h-40);
        tile.buildings.push({x, y, w, h, cans: [], type: 'animal_house', animals: [], foodGen: 0});
        updateHUD();
      }
    }

    // Assign domesticated animal to pen with G
    state.assignCooldown = Math.max(0, state.assignCooldown - dt);
    if (tile.owned && tile.pen.exists && keys.has("g") && state.assignCooldown<=0) {
      assignOneDomesticatedToPen(tile.pen);
      state.assignCooldown = 0.3;
    }

    // Capture wild animals to domesticate
    if(keys.has("f")){
      for(const a of state.animals){ if(!a.alive || !a.wild) continue; if(len(a.x-p.x,a.y-p.y) <= a.r+24){ a.alive=false; a.wild=false; domesticate(a.type); state.base.foodRate += 0.05; updateHUD(); break; } }
    }

    // Pickup canned food in current tile buildings
    if (tile.buildings && tile.buildings.length) {
      for (const b of tile.buildings) {
        for (const c of b.cans) {
          if (!c.picked) {
            const cx = b.x + c.x - b.x; // c.x is absolute inside tile space already
            const cy = b.y + c.y - b.y;
            if (len((tileOrigin(pt.ix,pt.iy).x + c.x) - p.x, (tileOrigin(pt.ix,pt.iy).y + c.y) - p.y) <= 24) {
              c.picked = true;
              state.base.food += c.amount;
              updateHUD();
            }
          }
        }
        
        // Assign animals to building with H key
        if ((b.type === 'animal_house' || b.type === 'ruin') && keys.has('h') && b.animals.length < 2) {
          // Find a domesticated animal to assign
          for (let i = state.domesticated.list.length - 1; i >= 0; i--) {
            const animal = state.domesticated.list[i];
            if (len(animal.x - p.x, animal.y - p.y) <= 30) {
              state.domesticated.list.splice(i, 1);
              state.domesticated.byType[animal.type] = Math.max(0, (state.domesticated.byType[animal.type] || 1) - 1);
              b.animals.push({type: animal.type, x: rand(0.2, 0.8), y: rand(0.2, 0.8), wander: 0, vx: 0, vy: 0});
              break;
            }
          }
        }
      }
    }
  }

  function findClaimableAdjacent(ix, iy) {
    // if current tile is owned, allow claiming any adjacent revealed-but-unowned tile near player position edge
    if (!state.ownedSet.has(keyFor(ix, iy))) return null;
    const near = neighbors(ix, iy);
    for (const n of near) {
      const k = keyFor(n.ix, n.iy);
      const t = ensureTile(n.ix, n.iy);
      if (!t.owned && t.revealed) {
        // also require player near the shared edge (approximate by distance to tile center)
        const center = tileOrigin(n.ix, n.iy);
        const cx = center.x + HALF_TILE;
        const cy = center.y + HALF_TILE;
        if (len(state.player.x - cx, state.player.y - cy) < HALF_TILE + 40) {
          // Check for zombies in the tile and neighbors
          const checkTiles = [n, ...neighbors(n.ix, n.iy)];
          for (const check of checkTiles) {
            for (const z of state.zombies) {
              const zt = worldToTile(z.x, z.y);
              if (zt.ix === check.ix && zt.iy === check.iy) {
                return null;
              }
            }
          }
          return n;
        }
      }
    }
    return null;
  }

  function domesticate(type) {
    // domesticated roam across all owned tiles, not only base tile
    // place initially near base
    const baseTileOrigin = tileOrigin(state.base.ix, state.base.iy);
    const x = baseTileOrigin.x + HALF_TILE + rand(-HALF_TILE+40, HALF_TILE-40);
    const y = baseTileOrigin.y + HALF_TILE + rand(-HALF_TILE+40, HALF_TILE-40);
    state.domesticated.list.push({ type, x, y, r:10, wander:0, vx:0, vy:0 });
    state.domesticated.byType[type] = (state.domesticated.byType[type]||0) + 1;
  }

  function assignOneDomesticatedToPen(pen){
    if (state.domesticated.list.length === 0) return;
    // pick first in list; prefer types with 0 or 1 in pen to reach pair
    const prefOrder = ["hase","kaninchen","huhn"]; let pickIdx = -1;
    for (const type of prefOrder){ if (pen.assignedByType[type] < 2) { pickIdx = state.domesticated.list.findIndex(d=>d.type===type); if (pickIdx!==-1) break; } }
    if (pickIdx === -1) pickIdx = 0;
    const d = state.domesticated.list.splice(pickIdx, 1)[0];
    state.domesticated.byType[d.type] = Math.max(0, (state.domesticated.byType[d.type]||1) - 1);
    // place in pen visually
    pen.assignedByType[d.type] = (pen.assignedByType[d.type]||0) + 1;
    const px = rand(0.3, 0.7), py = rand(0.3, 0.7);
    pen.list.push({ type:d.type, r:10, xRatio:px, yRatio:py, wander:0, vx:0, vy:0 });
  }

  function getOwnedBounds(){
    if (state.ownedSet.size === 0) return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const k of state.ownedSet){ const [ix,iy]=k.split(",").map(Number); minX=Math.min(minX,ix); minY=Math.min(minY,iy); maxX=Math.max(maxX,ix); maxY=Math.max(maxY,iy); }
    return { minX, minY, maxX, maxY };
  }

  function isWithinOwnedTiles(x,y){
    const t = worldToTile(x,y); return state.ownedSet.has(keyFor(t.ix,t.iy));
  }

  function updateDomesticated(dt) {
    // roam across all owned tiles - keep them inside the owned perimeter
    for(const d of state.domesticated.list){ 
      d.wander -= dt; 
      if(d.wander<=0){ 
        d.wander = rand(1.0, 2.5); 
        d.vx = rand(-30,30); 
        d.vy = rand(-30,30); 
      } 
      const oldX = d.x, oldY = d.y;
      d.x += (d.vx||0) * dt; 
      d.y += (d.vy||0) * dt; 
      
      // Better boundary check - if outside owned area, push back and change direction
      if (!isWithinOwnedTiles(d.x,d.y)) { 
        // Find the nearest owned tile and push animal back
        const animalTile = worldToTile(d.x, d.y);
        let nearestOwnedTile = null;
        let minDistance = Infinity;
        
        for (const ownedKey of state.ownedSet) {
          const [ix, iy] = ownedKey.split(",").map(Number);
          const distance = Math.abs(ix - animalTile.ix) + Math.abs(iy - animalTile.iy);
          if (distance < minDistance) {
            minDistance = distance;
            nearestOwnedTile = {ix, iy};
          }
        }
        
        if (nearestOwnedTile) {
          const org = tileOrigin(nearestOwnedTile.ix, nearestOwnedTile.iy);
          d.x = clamp(d.x, org.x + 20, org.x + TILE_SIZE - 20);
          d.y = clamp(d.y, org.y + 20, org.y + TILE_SIZE - 20);
        } else {
          d.x = oldX;
          d.y = oldY;
        }
        
        d.wander = 0.2;
        // Change direction to move away from boundary
        d.vx = -d.vx;
        d.vy = -d.vy;
      }
    }
  }

  function updateBreeding(dt) {
    // if at least two of a type, increment timer and spawn new domesticated every 20s per type
    const interval = 20;
    for (const type of ["hase", "kaninchen", "huhn"]) {
      if ((state.domesticated.byType[type] || 0) >= 2) {
        state.domesticated.breedTimers[type] += dt;
        if (state.domesticated.breedTimers[type] >= interval) {
          state.domesticated.breedTimers[type] = 0;
          domesticate(type);
          // small passive bonus for new birth
          state.base.foodRate += 0.02;
        }
      } else {
        state.domesticated.breedTimers[type] = 0;
      }
    }
  }

  function updatePens(dt){
    // breeding and simple wander of assigned sprites
    for (const [k, tile] of state.tiles) {
      const pen = tile.pen; if (!pen || !pen.exists) continue;
      // wander render offsets
      for (const a of pen.list) { a.wander -= dt; if(a.wander<=0){ a.wander = rand(1.0, 2.0); a.vx = rand(-10,10); a.vy = rand(-10,10); } const org = tileOrigin(...k.split(",").map(Number)); const cx = org.x + a.xRatio * TILE_SIZE; const cy = org.y + a.yRatio * TILE_SIZE; // keep ratios roughly centered by small velocity tweaks
        a.xRatio = clamp(a.xRatio + (a.vx||0)/TILE_SIZE*dt, 0.15, 0.85);
        a.yRatio = clamp(a.yRatio + (a.vy||0)/TILE_SIZE*dt, 0.15, 0.85);
      }
      // breeding when >=2 of a type assigned
      const types = ["hase","kaninchen","huhn"]; const interval = 20;
      for (const ty of types) {
        if ((pen.assignedByType[ty]||0) >= 2) {
          pen.breedTimers[ty] = (pen.breedTimers[ty]||0) + dt;
          if (pen.breedTimers[ty] >= interval) {
            pen.breedTimers[ty] = 0;
            pen.assignedByType[ty] += 1;
            pen.list.push({ type:ty, r:10, xRatio:rand(0.35,0.65), yRatio:rand(0.35,0.65), wander:0, vx:0, vy:0 });
            state.base.foodRate += 0.02;
          }
        } else { pen.breedTimers[ty] = 0; }
      }

      // Straw consumption every 10 min
      pen.strawTimer = (pen.strawTimer || 0) + dt;
      if (pen.strawTimer >= 600) {
        pen.strawTimer = 0;
        const total = pen.list.length;
        if (state.resources.straw >= total) {
          state.resources.straw -= total;
        } else {
          // no food, reduce foodRate
          state.base.foodRate = Math.max(0.1, state.base.foodRate - 0.1);
        }
      }
    }
    
    // Update animal buildings movement and food
    for (const [k, tile] of state.tiles) {
      for (const building of tile.buildings) {
        if (building.type === 'animal_house' || building.type === 'ruin') {
          // Movement
          for (const animal of building.animals) {
            animal.wander = (animal.wander || 0) - dt;
            if (animal.wander <= 0) {
              animal.wander = rand(1.0, 2.0);
              animal.vx = rand(-0.1, 0.1);
              animal.vy = rand(-0.1, 0.1);
            }
            animal.x = clamp(animal.x + (animal.vx || 0) * dt, 0.1, 0.9);
            animal.y = clamp(animal.y + (animal.vy || 0) * dt, 0.1, 0.9);
          }

          // Food generation
          const byType = {hase:0, kaninchen:0, huhn:0};
          for (const animal of building.animals) {
            byType[animal.type] = (byType[animal.type] || 0) + 1;
          }
          for (const type of ['hase', 'kaninchen', 'huhn']) {
            if (byType[type] >= 2) {
              building.foodGen += dt * 0.008; // Adjust for 2 min
              if (building.foodGen >= 1) {
                building.foodGen = 0;
                state.base.food += 1;
                updateHUD();
              }
            }
          }
        }
      }
    }
  }

  function updateResources(dt) {
    for (const [k, tile] of state.tiles) {
      if (tile.owned) continue; // only respawn in unowned tiles
      
      for (const resource of tile.resourcePoints) {
        if (resource.respawnTimer > 0) {
          resource.respawnTimer -= dt;
          if (resource.respawnTimer <= 0) {
            // Respawn resource
            resource.x = rand(20, TILE_SIZE-20);
            resource.y = rand(20, TILE_SIZE-20);
          }
        }
      }
    }
  }

  function updateFoodAndLoss(dt) {
    if (state.grace > 0) return; // pause during grace
    // Base consumes food over time
    state.base.food -= 0.5 * dt; // baseline consumption
    state.base.food -= Math.max(0, 1.2 - state.base.foodRate) * 0.1 * dt; // pressure when rate is low
    state.base.food = Math.max(0, state.base.food);
    if (state.gameOverEnabled && state.base.food <= 0) {
      endGame("Keine Lebensmittel mehr!");
    }
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;
      if (b.ttl <= 0) state.bullets.splice(i, 1);
    }
  }

  function updateZombies(dt) {
    // Disable spawns and damage for the first 10 minutes
    const zombieDisabled = state.elapsed < state.zombieFreeUntil;
    if (!zombieDisabled) {
      // spawn rate scales with level
      state.spawnTimer += dt;
      const interval = Math.max(0.8, 1.6 - state.level * 0.1);
      if (state.spawnTimer >= interval) {
        state.spawnTimer = 0;
        spawnZombieOutsideOwned();
      }

      const p = state.player;
      const playerTile = worldToTile(p.x, p.y);
      for (let i = state.zombies.length - 1; i >= 0; i--) {
        const z = state.zombies[i];
        const zombieTile = worldToTile(z.x, z.y);
        
        // Check if zombie is trying to enter owned territory - push to nearest unowned tile more than 2 tiles from player
        if (isWithinOwnedTiles(z.x, z.y)) {
          const zombieTile = worldToTile(z.x, z.y);
          let nearestUnowned = null;
          let minDist = Infinity;
          for (let dx = -5; dx <= 5; dx++) {
            for (let dy = -5; dy <= 5; dy++) {
              if (dx === 0 && dy === 0) continue;
              const ix = zombieTile.ix + dx;
              const iy = zombieTile.iy + dy;
              const k = keyFor(ix, iy);
              if (!state.ownedSet.has(k)) {
                const distToPlayer = Math.max(Math.abs(ix - playerTile.ix), Math.abs(iy - playerTile.iy));
                if (distToPlayer > 2) {
                  const dist = Math.abs(dx) + Math.abs(dy);
                  if (dist < minDist) {
                    minDist = dist;
                    nearestUnowned = {ix, iy};
                  }
                }
              }
            }
          }
          if (nearestUnowned) {
            const org = tileOrigin(nearestUnowned.ix, nearestUnowned.iy);
            z.x = org.x + rand(50, TILE_SIZE - 50);
            z.y = org.y + rand(50, TILE_SIZE - 50);
          } else {
            // If no unowned nearby, remove zombie
            state.zombies.splice(i, 1);
            i--;
            continue;
          }
        }
        
        // Check if zombie is within 2 tiles of player
        const tileDistance = Math.max(Math.abs(zombieTile.ix - playerTile.ix), Math.abs(zombieTile.iy - playerTile.iy));
        if (tileDistance <= 2) {
          const d = norm(p.x - z.x, p.y - z.y);
          z.x += d.x * z.speed * dt;
          z.y += d.y * z.speed * dt;

          // damage to player on contact
          if (!zombieDisabled && state.grace <= 0 && len(p.x - z.x, p.y - z.y) <= p.r + z.r) {
            state.player.hp -= (6 + state.level) * dt;
            if (state.gameOverEnabled && state.player.hp <= 0) {
              endGame("Vom Zombie getötet!");
              return;
            }
            state.player.hp = Math.max(1, Math.min(state.player.hp, state.player.maxHP));
          }
        }
        
        // Zombies kill wild animals outside owned territory
        for (let j = state.animals.length - 1; j >= 0; j--) {
          const animal = state.animals[j];
          if (animal.alive && animal.wild && !isWithinOwnedTiles(animal.x, animal.y)) {
            if (len(z.x - animal.x, z.y - animal.y) <= z.r + animal.r + 10) {
              animal.alive = false;
              state.animals.splice(j, 1);
            }
          }
        }
      }
    }
  }

  function handleHits() {
    // bullets vs zombies
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      for (let j = state.zombies.length - 1; j >= 0; j--) {
        const z = state.zombies[j];
        if (len(b.x - z.x, b.y - z.y) <= b.r + z.r) {
          state.bullets.splice(i, 1);
          z.hp -= 1;
          if (z.hp <= 0) {
            state.zombies.splice(j, 1);
            state.xp += 5;
            // level up thresholds
            const nextLevel = 1 + Math.floor(state.xp / 30);
            if (nextLevel !== state.level)
            {
              state.level = nextLevel;
              state.player.maxHP = calculateMaxHP(state.level);
              state.player.hp = state.player.maxHP;
            }
            updateHUD();
          }
          break;
        }
      }
    }
  }

  // Camera transforms
  function screenToWorldX(x) { return x + state.camera.x; }
  function screenToWorldY(y) { return y + state.camera.y; }

  // Rendering
  function renderMinimap() {
    // Setup and clear
    mctx.clearRect(0,0,minimap.width,minimap.height);
    // Define scale: show 9x9 tiles around base
    const tilesSpan = 9; // tiles edge
    const tilePx = Math.floor(minimap.width / tilesSpan);
    const half = Math.floor(tilesSpan / 2);
    const bx = state.base.ix, by = state.base.iy;

    for (let ty = by - half; ty <= by + half; ty++) {
      for (let tx = bx - half; tx <= bx + half; tx++) {
        const k = keyFor(tx, ty);
        const t = ensureTile(tx, ty);
        const mx = (tx - (bx - half)) * tilePx;
        const my = (ty - (by - half)) * tilePx;
        if (t.owned) mctx.fillStyle = "#2e7d32";
        else if (t.revealed) mctx.fillStyle = "#394b6a";
        else mctx.fillStyle = "#1a1c2a";
        mctx.fillRect(mx, my, tilePx-1, tilePx-1);
      }
    }

    // Player dot
    const pt = worldToTile(state.player.x, state.player.y);
    const px = (pt.ix - (bx - half)) * tilePx + tilePx/2;
    const py = (pt.iy - (by - half)) * tilePx + tilePx/2;
    mctx.fillStyle = "#8be9fd";
    mctx.beginPath();
    mctx.arc(px, py, Math.max(2, tilePx*0.15), 0, Math.PI*2);
    mctx.fill();

    // Base square
    const bxp = (bx - (bx - half)) * tilePx + tilePx/2;
    const byp = (by - (by - half)) * tilePx + tilePx/2;
    mctx.fillStyle = "#9ad4ff";
    mctx.fillRect(bxp - tilePx*0.2, byp - tilePx*0.2, tilePx*0.4, tilePx*0.4);
  }

  function renderFence(){
    if (state.ownedSet.size === 0) return;
    // draw a fence cell border around each owned tile side that borders an unowned tile
    ctx.strokeStyle = "#b28b5c"; // wooden fence color
    ctx.lineWidth = 3;
    for (const k of state.ownedSet){
      const [ix,iy]=k.split(",").map(Number);
      const org = tileOrigin(ix,iy);
      const sx = org.x - state.camera.x; const sy = org.y - state.camera.y;
      // check neighbors
      const sides = [
        {dx:0,dy:-1, x1:sx, y1:sy, x2:sx+TILE_SIZE, y2:sy},
        {dx:1,dy:0, x1:sx+TILE_SIZE, y1:sy, x2:sx+TILE_SIZE, y2:sy+TILE_SIZE},
        {dx:0,dy:1, x1:sx, y1:sy+TILE_SIZE, x2:sx+TILE_SIZE, y2:sy+TILE_SIZE},
        {dx:-1,dy:0, x1:sx, y1:sy, x2:sx, y2:sy+TILE_SIZE},
      ];
      for (const s of sides){ const nkey=keyFor(ix+s.dx, iy+s.dy); if(!state.ownedSet.has(nkey)){ ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); } }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // draw visible tiles 3x3 around player
    const p = state.player;
    const pt = worldToTile(p.x, p.y);
    for (let ty = pt.iy - 2; ty <= pt.iy + 2; ty++) {
      for (let tx = pt.ix - 2; tx <= pt.ix + 2; tx++) {
        const t = ensureTile(tx, ty);
        const o = tileOrigin(tx, ty);
        const sx = o.x - state.camera.x;
        const sy = o.y - state.camera.y;
        if (t.owned) {
          ctx.fillStyle = "#1e2b1e";
        } else if (t.revealed) {
          ctx.fillStyle = "#20263a";
        } else {
          ctx.fillStyle = "#141626";
        }
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

        // grid line
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

        // resources preview on revealed
        if (t.revealed && t.resourcePoints) {
          for (const resource of t.resourcePoints) {
            if (resource.respawnTimer <= 0) {
              const rx = sx + resource.x, ry = sy + resource.y;
              if (resource.type === 'stone') {
                ctx.fillStyle = "#9aa0a6";
                ctx.beginPath();
                ctx.arc(rx, ry, 8, 0, Math.PI*2);
                ctx.fill();
              } else if (resource.type === 'clay') {
                ctx.fillStyle = "#c8ad7f";
                ctx.beginPath();
                ctx.arc(rx, ry, 8, 0, Math.PI*2);
                ctx.fill();
              } else if (resource.type === 'wood') {
                ctx.fillStyle = "#8b5a2b";
                ctx.beginPath();
                ctx.arc(rx, ry, 8, 0, Math.PI*2);
                ctx.fill();
              } else if (resource.type === 'straw') {
                ctx.fillStyle = resource.respawnTimer > 0 ? "#8b4513" : "#ffff00";
                ctx.beginPath();
                ctx.arc(rx, ry, 8, 0, Math.PI*2);
                ctx.fill();
              }
            }
          }
        }
        // base icon on base tile
        if (tx === state.base.ix && ty === state.base.iy) {
          ctx.fillStyle = "#9ad4ff";
          ctx.fillRect(sx + HALF_TILE - 14, sy + HALF_TILE - 14, 28, 28);
        }
        // pen icon
        if (t.pen?.exists) { ctx.fillStyle="#d4c490"; ctx.fillRect(sx+HALF_TILE-10, sy+HALF_TILE-10, 20, 20); }
        // draw buildings
        if (t.buildings) {
          for (const b of t.buildings) {
            if (b.type === 'ruin') {
              ctx.fillStyle = "#5c5f73";
              ctx.fillRect(sx + b.x, sy + b.y, b.w, b.h);
              // draw cans
              for (const c of b.cans) {
                if (c.picked) continue;
                ctx.fillStyle = "#cde06f";
                const cx = sx + c.x, cy = sy + c.y;
                ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI*2); ctx.fill();
              }
            } else if (b.type === 'animal_house') {
              ctx.fillStyle = "#8b7355";
              ctx.fillRect(sx + b.x, sy + b.y, b.w, b.h);
              // Draw animals in building
              for (const animal of b.animals) {
                const ax = sx + b.x + animal.x * b.w;
                const ay = sy + b.y + animal.y * b.h;
                ctx.fillStyle = "#a5ffb5";
                ctx.beginPath();
                ctx.arc(ax, ay, 6, 0, Math.PI*2);
                ctx.fill();
              }
            }
          }
        }
      }
    }

    // wild animals
    for (const a of state.animals) {
      if (!a.alive || !a.wild) continue;
      const sx = a.x - state.camera.x;
      const sy = a.y - state.camera.y;
      ctx.fillStyle = a.type === "huhn" ? "#f0e68c" : "#bfe6a8";
      ctx.beginPath();
      ctx.arc(sx, sy, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // domesticated animals (draw distinct color)
    for (const d of state.domesticated.list) {
      const sx = d.x - state.camera.x;
      const sy = d.y - state.camera.y;
      ctx.fillStyle = "#a5ffb5";
      ctx.beginPath();
      ctx.arc(sx, sy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // pen-assigned animals drawn per tile
    for (const [k, tile] of state.tiles){ const pen=tile.pen; if(!pen||!pen.exists) continue; const [ix,iy]=k.split(",").map(Number); const org=tileOrigin(ix,iy); for(const a of pen.list){ const sx=org.x + a.xRatio*TILE_SIZE - state.camera.x; const sy=org.y + a.yRatio*TILE_SIZE - state.camera.y; ctx.fillStyle="#b8ffcf"; ctx.beginPath(); ctx.arc(sx,sy,a.r,0,Math.PI*2); ctx.fill(); } }

    // zombies
    ctx.fillStyle = "#ff4b4b";
    for (const z of state.zombies) {
      const sx = z.x - state.camera.x;
      const sy = z.y - state.camera.y;
      ctx.beginPath();
      ctx.arc(sx, sy, z.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // bullets
    ctx.fillStyle = "#ffb86c";
    for (const b of state.bullets) {
      const sx = b.x - state.camera.x;
      const sy = b.y - state.camera.y;
      ctx.beginPath();
      ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const psx = p.x - state.camera.x;
    const psy = p.y - state.camera.y;
    ctx.fillStyle = "#8be9fd";
    ctx.beginPath();
    ctx.arc(psx, psy, p.r, 0, Math.PI * 2);
    ctx.fill();

    // gun barrel towards mouse
    const ang = Math.atan2(screenToWorldY(mouse.y) - p.y, screenToWorldX(mouse.x) - p.x);
    ctx.strokeStyle = "#50fa7b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(psx, psy);
    ctx.lineTo(psx + Math.cos(ang) * (p.r + 10), psy + Math.sin(ang) * (p.r + 10));
    ctx.stroke();

    renderFence();
    renderMinimap();
  }

  // Game over / start
  function start() {
    reset();
    overlay.classList.add("hidden");
    gameover.classList.add("hidden");
    state.running = true;
    state.timePrev = 0;
    state.elapsed = 0;
    requestAnimationFrame(loop);
  }
  function endGame(reason) {
    if (!state.gameOverEnabled) return;
    state.running = false;
    finalScore.textContent = `XP: ${state.xp} — ${reason||""}`;
    gameover.classList.remove("hidden");
  }

  // Resource gathering: simple passive per owned tile
  function passiveResources(dt) {
    // very small trickle per owned tile
    const owned = state.ownedSet.size;
    if (owned > 0) {
      state.resources.stone += 0.02 * dt;
      state.resources.clay += 0.02 * dt;
      state.resources.wood += 0.04 * dt;
      // convert fractional to ints for display rounding
      state.resources.stone = Math.min(9999, state.resources.stone);
      state.resources.clay = Math.min(9999, state.resources.clay);
      state.resources.wood = Math.min(9999, state.resources.wood);
    }
  }

  function updateWildAnimals(dt) {
    for (const a of state.animals) {
      if (!a.alive || !a.wild) continue;
      a.wander = (a.wander || 0) - dt;
      if (a.wander <= 0) {
        a.wander = rand(1.0, 3.0);
        a.vx = rand(-25, 25);
        a.vy = rand(-25, 25);
      }
      const newX = a.x + (a.vx || 0) * dt;
      const newY = a.y + (a.vy || 0) * dt;

      // Prevent entering owned tiles by checking new position first
      if (!isWithinOwnedTiles(newX, newY)) {
        a.x = newX;
        a.y = newY;
      } else {
        // Reverse velocity to bounce away
        a.wander = 0.2;
        a.vx = -a.vx;
        a.vy = -a.vy;
      }
    }
  }

  function loop(t) {
    if (!state.running) return;
    if (!state.timePrev) state.timePrev = t;
    const dt = Math.min(0.033, (t - state.timePrev) / 1000);
    state.timePrev = t;
    state.elapsed += dt;
    if(state.grace>0) state.grace = Math.max(0, state.grace - dt);

    updatePlayer(dt);
    updateWildAnimals(dt);
    updateBullets(dt);
    updateZombies(dt);
    handleHits();
    updateFoodAndLoss(dt);
    updateDomesticated(dt);
    updateBreeding(dt);
    updatePens(dt);
    updateResources(dt);
    passiveResources(dt);
    updateHUD();

    render();

    requestAnimationFrame(loop);
  }

  // Buttons and restart
  startBtn.addEventListener("click", start);
  restartBtn.addEventListener("click", () => { gameover.classList.add("hidden"); start(); });
  // live change during overlay: adjusting will take effect on next start
  zfreeSelect?.addEventListener("change", () => { /* value is read on reset() */ });
  goToggle?.addEventListener("change", () => { /* applied on next start */ });

  // On load: show start overlay, hide gameover
  overlay.classList.remove("hidden");
  gameover.classList.add("hidden");
})();
