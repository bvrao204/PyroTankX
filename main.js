// Game Constants
const WIDTH = 900;
const HEIGHT = 650;
const FPS = 60;

// Color Palette
const COLORS = {
  WHITE: 'rgba(255, 255, 255, 1)',
  BLACK: 'rgba(0, 0, 0, 1)',
  GREEN: '#225522',
  DKGREEN: '#143714',
  RED: '#c81e1e',
  ORANGE: '#e67800',
  YELLOW: '#f0d500',
  GRAY: '#787878',
  LTGRAY: '#b4b4b4',
  BLUE: '#3264c8',
  TAN: '#c3a564',
  BROWN: '#64411e',
  DKRED: '#8c0000',
  CYAN: '#00d2d2'
};

// Game States
const STATE_START = 0;
const STATE_PLAY = 1;
const STATE_GAME_OVER = 2;

// DOM Elements
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud = document.getElementById('hud');
const healthBar = document.getElementById('healthBar');
const powerupIndicator = document.getElementById('powerupIndicator');
const hudScore = document.getElementById('hudScore');
const hudWave = document.getElementById('hudWave');
const waveBanner = document.getElementById('waveBanner');
const playBtn = document.getElementById('playBtn');
const restartBtn = document.getElementById('restartBtn');
const startHighScore = document.getElementById('startHighScore');
const finalScore = document.getElementById('finalScore');
const endHighScore = document.getElementById('endHighScore');

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State Variables
let gameState = STATE_START;
let player = null;
let bullets = [];
let enemies = [];
let explosions = [];
let powerups = [];

let score = 0;
let highScore = 0;
let wave = 0;
let waveTransitionTimer = 0;
let powerupSpawnTimer = 600;
let rapidFireTimer = 0;
let shieldTimer = 0;

// Keyboard input tracking
const keys = {};

// Mouse state
let mouseX = 0;
let mouseY = 0;
let isMouseDown = false;

// Caching the ground backdrop (similar to Pygame's _ground_surf)
let groundCanvas = null;

// Initialize High Score
if (localStorage.getItem('pyrotankx_highscore')) {
  highScore = parseInt(localStorage.getItem('pyrotankx_highscore')) || 0;
}
startHighScore.textContent = `HIGH SCORE: ${highScore}`;

// --- SEED-LIKE PSEUDO-RANDOM GENERATOR ---
// Used to make the ground generation deterministic like Python's random.Random(42)
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    let x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  randint(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
}

// --- DRAWING UTILITIES ---

function drawTank(ctx, x, y, angle, color, barrelColor, size = 22) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);

  const bodyW = size * 2;
  const bodyH = size * 1.4;

  // Track rendering (left & right sides)
  const trackW = bodyW + 6;
  const trackH = 8;
  ctx.fillStyle = COLORS.GRAY;
  
  // Left track
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2 - 3, -bodyH / 2 - 4, trackW, trackH, 3);
  ctx.fill();

  // Right track
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2 - 3, bodyH / 2 - 4, trackW, trackH, 3);
  ctx.fill();

  // Tank Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 5);
  ctx.fill();

  // Tank Body Outline
  ctx.strokeStyle = color === COLORS.TAN ? COLORS.DKGREEN : COLORS.DKRED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 5);
  ctx.stroke();

  ctx.restore();

  // Tank Barrel & Hatch (drawn globally to avoid rotating the barrel line start coordinates incorrectly)
  ctx.save();
  const rad = (angle * Math.PI) / 180;
  const bLen = size + 12;
  const bx = x + Math.cos(rad) * bLen;
  const by = y + Math.sin(rad) * bLen;

  // Barrel line
  ctx.strokeStyle = barrelColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx, by);
  ctx.stroke();

  // Tank Turret Hatch
  ctx.fillStyle = 'rgba(50, 50, 50, 1)';
  ctx.beginPath();
  ctx.arc(x, y, size / 2 + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = barrelColor;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawExplosion(ctx, x, y, frame, maxFrames) {
  if (frame >= maxFrames) return;
  const progress = frame / maxFrames;
  const r = 40 * Math.sin(progress * Math.PI);
  if (r <= 0) return;

  const alpha = 1 - progress;
  const colors = [COLORS.YELLOW, COLORS.ORANGE, COLORS.RED];

  ctx.save();
  for (let i = 0; i < colors.length; i++) {
    const subR = r - i * 6;
    if (subR > 0) {
      const c = colors[colors.length - 1 - i]; // Reverse order
      ctx.fillStyle = hexToRgba(c, Math.max(0, alpha - i * 0.23));
      ctx.beginPath();
      ctx.arc(x, y, subR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTree(ctx, x, y) {
  ctx.save();
  // Trunk
  ctx.fillStyle = COLORS.BROWN;
  ctx.fillRect(x - 4, y, 8, 16);

  // Leaves
  ctx.fillStyle = 'rgba(20, 90, 20, 1)';
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(30, 110, 30, 1)';
  ctx.beginPath();
  ctx.arc(x - 4, y - 4, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(25, 100, 25, 1)';
  ctx.beginPath();
  ctx.arc(x + 4, y - 4, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRock(ctx, x, y) {
  ctx.save();
  // Inner fill
  ctx.fillStyle = COLORS.LTGRAY;
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = COLORS.GRAY;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Utility to convert hex colors to RGBA easily
function hexToRgba(hex, alpha) {
  if (hex.startsWith('rgba')) return hex;
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pre-render the game ground background to save draw calls
function buildGroundBackdrop() {
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = WIDTH;
  groundCanvas.height = HEIGHT;
  const gCtx = groundCanvas.getContext('2d');

  gCtx.fillStyle = COLORS.GREEN;
  gCtx.fillRect(0, 0, WIDTH, HEIGHT);

  const rng = new SeededRandom(42);

  // Draw patch textures
  for (let i = 0; i < WIDTH; i += 80) {
    for (let j = 0; j < HEIGHT; j += 80) {
      const shade = rng.randint(-10, 10);
      const r = Math.max(0, Math.min(60, 34 + shade));
      const g = Math.max(0, Math.min(120, 85 + shade));
      const b = Math.max(0, Math.min(60, 34 + shade));
      gCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      gCtx.fillRect(i, j, 80, 80);
    }
  }

  // Draw static forest elements
  for (let k = 0; k < 18; k++) {
    const x = rng.randint(30, WIDTH - 30);
    const y = rng.randint(30, HEIGHT - 30);
    drawTree(gCtx, x, y);
  }

  for (let l = 0; l < 12; l++) {
    const x = rng.randint(30, WIDTH - 30);
    const y = rng.randint(30, HEIGHT - 30);
    drawRock(gCtx, x, y);
  }
}

// --- GAME ENTITIES ---

class Bullet {
  constructor(x, y, angle, owner = 'player', speed = 10) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.owner = owner;
    this.alive = true;
    this.trail = [];
  }

  update() {
    this.trail.push({ x: Math.floor(this.x), y: Math.floor(this.y) });
    if (this.trail.length > 6) {
      this.trail.shift();
    }
    const rad = (this.angle * Math.PI) / 180;
    this.x += Math.cos(rad) * this.speed;
    this.y += Math.sin(rad) * this.speed;

    if (this.x < 0 || this.x > WIDTH || this.y < 0 || this.y > HEIGHT) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const pos = this.trail[i];
      const alpha = i / this.trail.length;
      const color = this.owner === 'player' ? COLORS.YELLOW : COLORS.RED;
      ctx.fillStyle = hexToRgba(color, alpha * 0.7);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core Bullet
    const mainColor = this.owner === 'player' ? COLORS.YELLOW : COLORS.ORANGE;
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Bullet core center highlight
    ctx.fillStyle = COLORS.WHITE;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

class Player {
  constructor() {
    this.x = WIDTH / 2;
    this.y = HEIGHT / 2;
    this.angle = 0;
    this.speed = 3.5;
    this.hp = 5;
    this.maxHp = 5;
    this.shootCooldown = 0;
    this.shootDelay = 18;
    this.invincible = 0;
  }

  update() {
    // Rotation inputs
    if (keys['a'] || keys['ArrowLeft']) {
      this.angle -= 3;
    }
    if (keys['d'] || keys['ArrowRight']) {
      this.angle += 3;
    }

    // Forward/Backward movement
    const rad = (this.angle * Math.PI) / 180;
    if (keys['w'] || keys['ArrowUp']) {
      this.x += Math.cos(rad) * this.speed;
      this.y += Math.sin(rad) * this.speed;
    }
    if (keys['s'] || keys['ArrowDown']) {
      this.x -= Math.cos(rad) * this.speed * 0.6;
      this.y -= Math.sin(rad) * this.speed * 0.6;
    }

    // Border constraints
    this.x = Math.max(25, Math.min(WIDTH - 25, this.x));
    this.y = Math.max(25, Math.min(HEIGHT - 25, this.y));

    if (this.shootCooldown > 0) {
      this.shootCooldown--;
    }
    if (this.invincible > 0) {
      this.invincible--;
    }
  }

  shoot() {
    if (this.shootCooldown === 0) {
      this.shootCooldown = this.shootDelay;
      const rad = (this.angle * Math.PI) / 180;
      const bx = this.x + Math.cos(rad) * 35;
      const by = this.y + Math.sin(rad) * 35;
      return new Bullet(bx, by, this.angle, 'player', 10);
    }
    return null;
  }

  takeDamage() {
    if (this.invincible === 0) {
      this.hp -= 1;
      this.invincible = 60;
      return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) {
      return;
    }
    drawTank(ctx, this.x, this.y, this.angle, COLORS.TAN, '#a08246');
  }
}

class Enemy {
  constructor(level = 1) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      this.x = Math.random() * WIDTH;
      this.y = -30;
    } else if (side === 1) {
      this.x = WIDTH + 30;
      this.y = Math.random() * HEIGHT;
    } else if (side === 2) {
      this.x = Math.random() * WIDTH;
      this.y = HEIGHT + 30;
    } else {
      this.x = -30;
      this.y = Math.random() * HEIGHT;
    }

    this.angle = 0;
    const baseSpeed = 1.0 + level * 0.18;
    this.speed = baseSpeed + (Math.random() * 0.5 - 0.2);
    this.maxHp = 1 + Math.floor(level / 3);
    this.hp = this.maxHp;
    this.shootCooldown = Math.floor(Math.random() * 60) + 40;
    this.shootDelay = Math.max(40, 100 - level * 4);
    this.alive = true;
    this.wobble = Math.random() * 360;
  }

  update(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      this.wobble += 1.5;
      const wobbleOffset = Math.sin((this.wobble * Math.PI) / 180) * 1.2;
      const nx = this.x + (dx / dist) * this.speed;
      const ny = this.y + (dy / dist) * this.speed;

      const perpRad = ((this.angle + 90) * Math.PI) / 180;
      this.x = nx + Math.cos(perpRad) * wobbleOffset;
      this.y = ny + Math.sin(perpRad) * wobbleOffset;
    }

    if (this.shootCooldown > 0) {
      this.shootCooldown--;
    }
  }

  shoot(player) {
    if (this.shootCooldown === 0) {
      this.shootCooldown = this.shootDelay;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const baseAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const spread = Math.random() * 16 - 8;
      return new Bullet(this.x, this.y, baseAngle + spread, 'enemy', 6);
    }
    return null;
  }

  takeHit() {
    this.hp -= 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(ctx) {
    drawTank(ctx, this.x, this.y, this.angle, COLORS.DKRED, '#b43232');
  }
}

class Explosion {
  constructor(x, y, maxFrames = 24) {
    this.x = x;
    this.y = y;
    this.frame = 0;
    this.maxFrames = maxFrames;
  }

  update() {
    this.frame++;
  }

  done() {
    return this.frame >= this.maxFrames;
  }

  draw(ctx) {
    drawExplosion(ctx, this.x, this.y, this.frame, this.maxFrames);
  }
}

class PowerUp {
  constructor() {
    this.x = Math.random() * (WIDTH - 120) + 60;
    this.y = Math.random() * (HEIGHT - 120) + 60;
    this.kind = ['health', 'rapid', 'shield'][Math.floor(Math.random() * 3)];
    this.alive = true;
    this.anim = 0;
  }

  update() {
    this.anim += 2;
  }

  draw(ctx) {
    const bob = Math.sin((this.anim * Math.PI) / 180) * 4;
    const cx = this.x;
    const cy = this.y + bob;

    ctx.save();
    if (this.kind === 'health') {
      // Circle back
      ctx.fillStyle = 'rgba(20, 180, 20, 1)';
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();

      // Cross symbol
      ctx.fillStyle = COLORS.WHITE;
      ctx.fillRect(cx - 2, cy - 7, 4, 14);
      ctx.fillRect(cx - 7, cy - 2, 14, 4);
    } else if (this.kind === 'rapid') {
      // Circle back
      ctx.fillStyle = COLORS.YELLOW;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();

      // Lightning/Arrow icon
      ctx.strokeStyle = COLORS.BLACK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy);
      ctx.lineTo(cx + 4, cy);
      ctx.stroke();

      ctx.fillStyle = COLORS.BLACK;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 6);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx + 4, cy + 6);
      ctx.fill();
    } else {
      // Shield
      ctx.fillStyle = COLORS.CYAN;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- SETUP & CONTROLS BINDINGS ---

// Key Listeners
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  // Prevent default scroll behavior
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// Mouse listeners on Canvas
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isMouseDown = true;
  }
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

// Button Click Handlers
playBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// --- MAIN GAME FLOW ---

function buildEntities() {
  player = new Player();
  bullets = [];
  enemies = [];
  explosions = [];
  powerups = [];
  score = 0;
  wave = 0;
  waveTransitionTimer = 0;
  rapidFireTimer = 0;
  shieldTimer = 0;
  powerupSpawnTimer = 600;
}

function startGame() {
  buildEntities();
  spawnWave();
  gameState = STATE_PLAY;
  
  // UI Panels Sync
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');
}

function spawnWave() {
  wave += 1;
  const numEnemies = 3 + wave * 2;
  for (let i = 0; i < numEnemies; i++) {
    enemies.push(new Enemy(wave));
  }

  // Display Wave incoming HUD banner
  waveBanner.textContent = `WAVE ${wave} INCOMING`;
  waveBanner.classList.remove('hidden');
  setTimeout(() => {
    waveBanner.classList.add('hidden');
  }, 1800);
}

function handleGameOver() {
  gameState = STATE_GAME_OVER;
  
  // Save Highscore
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('pyrotankx_highscore', highScore);
  }

  // Render Overlays
  hud.classList.add('hidden');
  gameOverScreen.classList.remove('hidden');
  finalScore.textContent = score;
  endHighScore.textContent = highScore;
}

// --- ENGINE LOOPS ---

function update() {
  if (gameState !== STATE_PLAY) return;

  // Powerup Clock logic
  if (rapidFireTimer > 0) {
    rapidFireTimer--;
    player.shootDelay = 7;
    powerupIndicator.textContent = `RAPID FIRE (${Math.ceil(rapidFireTimer / 60)}s)`;
    powerupIndicator.className = 'powerup-text rapid';
    powerupIndicator.classList.remove('hidden');
  } else {
    player.shootDelay = 18;
  }

  if (shieldTimer > 0) {
    shieldTimer--;
    powerupIndicator.textContent = `SHIELD ACTIVE (${Math.ceil(shieldTimer / 60)}s)`;
    powerupIndicator.className = 'powerup-text shield';
    powerupIndicator.classList.remove('hidden');
  }

  if (rapidFireTimer <= 0 && shieldTimer <= 0) {
    powerupIndicator.classList.add('hidden');
  }

  // Update Player
  player.update();

  // Handle Player shooting
  if (keys[' '] || isMouseDown) {
    const b = player.shoot();
    if (b) bullets.push(b);
  }

  // Periodic powerup spawning
  powerupSpawnTimer--;
  if (powerupSpawnTimer <= 0) {
    powerupSpawnTimer = 900; // 15 seconds
    if (powerups.length < 3) {
      powerups.push(new PowerUp());
    }
  }

  // Update Powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.update();

    // Player collision check
    const dist = Math.hypot(player.x - pu.x, player.y - pu.y);
    if (dist < 30) {
      if (pu.kind === 'health') {
        player.hp = Math.min(player.maxHp, player.hp + 2);
      } else if (pu.kind === 'rapid') {
        rapidFireTimer = 400;
      } else if (pu.kind === 'shield') {
        shieldTimer = 400;
      }
      score += 50;
      powerups.splice(i, 1);
    }
  }

  // Update Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.update(player);

    // Enemy shoots
    const eb = enemy.shoot(player);
    if (eb) bullets.push(eb);

    // Collide with Player (Ramming)
    const distTanks = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distTanks < 35) {
      if (shieldTimer <= 0) {
        player.takeDamage();
      }
      explosions.push(new Explosion(enemy.x, enemy.y));
      score += 100;
      enemies.splice(i, 1);
    }
  }

  // Update Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update();

    if (!b.alive) {
      bullets.splice(i, 1);
      continue;
    }

    if (b.owner === 'player') {
      // Collide with enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy = enemies[j];
        const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
        if (dist < 25) {
          b.alive = false;
          if (enemy.takeHit()) {
            score += 200;
            explosions.push(new Explosion(enemy.x, enemy.y));
            // Powerup drop chance (15%)
            if (Math.random() < 0.15) {
              const pu = new PowerUp();
              pu.x = enemy.x;
              pu.y = enemy.y;
              powerups.push(pu);
            }
            enemies.splice(j, 1);
          } else {
            // Spark effect
            explosions.push(new Explosion(b.x, b.y, 10));
          }
          bullets.splice(i, 1);
          break;
        }
      }
    } else {
      // Collide with Player
      const dist = Math.hypot(b.x - player.x, b.y - player.y);
      if (dist < 24) {
        b.alive = false;
        if (shieldTimer <= 0) {
          player.takeDamage();
        }
        explosions.push(new Explosion(b.x, b.y, 12));
        bullets.splice(i, 1);
      }
    }
  }

  // Update Explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.update();
    if (exp.done()) {
      explosions.splice(i, 1);
    }
  }

  // Wave Manager
  if (enemies.length === 0) {
    if (waveTransitionTimer === 0) {
      waveTransitionTimer = 90; // Delay next wave
    } else {
      waveTransitionTimer--;
      if (waveTransitionTimer <= 1) {
        spawnWave();
        waveTransitionTimer = 0;
      }
    }
  }

  // Check Death
  if (player.hp <= 0) {
    handleGameOver();
  }

  // Update HUD values
  healthBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
  healthBar.style.backgroundColor = player.hp <= 2 ? COLORS.RED : COLORS.GREEN;
  hudScore.textContent = String(score).padStart(6, '0');
  hudWave.textContent = wave;
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Render Cached Ground Backdrop
  if (groundCanvas) {
    ctx.drawImage(groundCanvas, 0, 0);
  }

  if (gameState !== STATE_PLAY) return;

  // Draw powerups
  for (const pu of powerups) {
    pu.draw(ctx);
  }

  // Draw player
  player.draw(ctx);

  // Pulsing cyan shield visual effect around the tank
  if (shieldTimer > 0) {
    ctx.save();
    const pulseR = 30 + Math.sin(Date.now() * 0.01) * 3;
    const alpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.15;
    ctx.strokeStyle = `rgba(0, 210, 210, ${alpha + 0.3})`;
    ctx.lineWidth = 3;
    ctx.fillStyle = `rgba(0, 210, 210, ${alpha * 0.15})`;
    
    ctx.beginPath();
    ctx.arc(player.x, player.y, pulseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw enemies
  for (const enemy of enemies) {
    enemy.draw(ctx);
  }

  // Draw bullets
  for (const bullet of bullets) {
    bullet.draw(ctx);
  }

  // Draw explosions
  for (const exp of explosions) {
    exp.draw(ctx);
  }
}

// Global Core game loop run at 60fps
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// --- BOOT ENGINE ---
buildGroundBackdrop();
requestAnimationFrame(loop);
