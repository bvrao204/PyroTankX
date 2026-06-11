// Vercel Speed Insights
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Speed Insights
injectSpeedInsights();

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

// Difficulty Selection
let selectedDifficulty = 'medium';

// Multiplayer / PeerJS State
let isMultiplayer = false;
let isHost = false;
let peer = null;
let conn = null;
let roomCode = '';
let p2Player = null; // Blue tank object for Player 2 on Host
let p2Inputs = { x: 0, y: 0, angle: 0, hp: 5, shooting: false, shieldActive: false };
let remoteState = null; // Broadcasted state received by client
let netSendTimer = 0; // Host broadcasts at 30fps (every 2 frames)

// Mouse state
let mouseX = 0;
let mouseY = 0;
let isMouseDown = false;

// Joystick / Touch inputs
let isTouchDevice = false;
let joystickActive = false;
let joystickX = 0;
let joystickY = 0;
let joystickStartTouch = { x: 0, y: 0 };
const joystickKnobLimit = 35;
let isMobileFireActive = false;
let joystickTouchId = null;

// Player names
let p1Name = "Player 1";
let p2Name = "Player 2";

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
      const color = (this.owner === 'player' || this.owner === 'player2') ? COLORS.YELLOW : COLORS.RED;
      ctx.fillStyle = hexToRgba(color, alpha * 0.7);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core Bullet
    const mainColor = (this.owner === 'player' || this.owner === 'player2') ? COLORS.YELLOW : COLORS.ORANGE;
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

    // Joystick Touch Controls (Direct direction steering)
    if (joystickActive) {
      const joyDist = Math.hypot(joystickX, joystickY);
      if (joyDist > 0.15) {
        // Calculate target angle in degrees (-180 to 180)
        let targetAngle = (Math.atan2(joystickY, joystickX) * 180) / Math.PI;
        
        // Normalize angles to 0-360 for clean interpolation
        let currentAngle = (this.angle % 360 + 360) % 360;
        let targetAngle360 = (targetAngle % 360 + 360) % 360;
        
        // Calculate shortest rotation path
        let diff = targetAngle360 - currentAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // Rotate smoothly towards target
        const rotSpeed = 4.5;
        if (Math.abs(diff) > rotSpeed) {
          this.angle += Math.sign(diff) * rotSpeed;
        } else {
          this.angle = targetAngle360;
        }
        
        // Move forward along tank current angle
        const rad = (this.angle * Math.PI) / 180;
        const speedFactor = Math.min(1.0, joyDist);
        this.x += Math.cos(rad) * this.speed * speedFactor;
        this.y += Math.sin(rad) * this.speed * speedFactor;
      }
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
    if (this.hp <= 0) return;
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) {
      return;
    }
    const color = (isMultiplayer && !isHost) ? COLORS.BLUE : COLORS.TAN;
    const barrelColor = (isMultiplayer && !isHost) ? '#1e4b8c' : '#a08246';
    drawTank(ctx, this.x, this.y, this.angle, color, barrelColor);
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

    // Apply difficulty modifiers
    let speedMult = 1.0;
    let delayMult = 1.0;
    let hpAdd = 0;
    
    if (selectedDifficulty === "easy") {
      speedMult = 0.75;
      delayMult = 1.4;
    } else if (selectedDifficulty === "hard") {
      speedMult = 1.25;
      delayMult = 0.75;
      hpAdd = 1;
    }

    const baseSpeed = 1.0 + level * 0.18;
    this.speed = (baseSpeed + (Math.random() * 0.5 - 0.2)) * speedMult;
    this.maxHp = 1 + Math.floor(level / 3) + hpAdd;
    this.hp = this.maxHp;
    this.shootCooldown = Math.floor((Math.random() * 60 + 40) * delayMult);
    this.shootDelay = Math.max(30, Math.floor((100 - level * 4) * delayMult));
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

// Mouse listeners on Canvas (scaled responsive coordinates)
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH;
  mouseY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isMouseDown = true;
  }
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

// Check for Touch Capability
isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

if (isTouchDevice) {
  const joystickZone = document.getElementById('joystickZone');
  const joystickKnob = document.getElementById('joystickKnob');
  const mobileFireBtn = document.getElementById('mobileFireBtn');

  // Touch handlers for joystick movement
  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickStartTouch = { x: touch.clientX, y: touch.clientY };
    joystickActive = true;
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!joystickActive) return;

    // Find the correct touch that started the joystick
    let touch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchId) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;

    let dx = touch.clientX - joystickStartTouch.x;
    let dy = touch.clientY - joystickStartTouch.y;
    const dist = Math.hypot(dx, dy);

    if (dist > joystickKnobLimit) {
      dx = (dx / dist) * joystickKnobLimit;
      dy = (dy / dist) * joystickKnobLimit;
    }

    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickX = dx / joystickKnobLimit;
    joystickY = dy / joystickKnobLimit;
  }, { passive: false });

  const resetJoystick = (e) => {
    if (e) {
      let ended = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          ended = true;
          break;
        }
      }
      if (!ended) return;
    }

    joystickActive = false;
    joystickTouchId = null;
    joystickX = 0;
    joystickY = 0;
    joystickKnob.style.transform = 'translate(0px, 0px)';
  };

  joystickZone.addEventListener('touchend', resetJoystick, { passive: false });
  joystickZone.addEventListener('touchcancel', resetJoystick, { passive: false });

  // Touch handlers for fire button
  mobileFireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent double tap zoom
    isMobileFireActive = true;
  }, { passive: false });

  const stopFire = () => {
    isMobileFireActive = false;
  };

  mobileFireBtn.addEventListener('touchend', stopFire, { passive: false });
  mobileFireBtn.addEventListener('touchcancel', stopFire, { passive: false });
}

// Difficulty Buttons Event Listeners
const diffEasy = document.getElementById('diffEasy');
const diffMedium = document.getElementById('diffMedium');
const diffHard = document.getElementById('diffHard');

function setDifficulty(diff) {
  selectedDifficulty = diff;
  [diffEasy, diffMedium, diffHard].forEach(btn => btn.classList.remove('active'));
  if (diff === 'easy') diffEasy.classList.add('active');
  else if (diff === 'medium') diffMedium.classList.add('active');
  else if (diff === 'hard') diffHard.classList.add('active');
}

diffEasy.addEventListener('click', () => setDifficulty('easy'));
diffMedium.addEventListener('click', () => setDifficulty('medium'));
diffHard.addEventListener('click', () => setDifficulty('hard'));

// Multiplayer Buttons Event Listeners
const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const lobbyOverlay = document.getElementById('lobbyOverlay');
const hostLobbySection = document.getElementById('hostLobbySection');
const joinLobbySection = document.getElementById('joinLobbySection');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const joinCodeInput = document.getElementById('joinCodeInput');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const cancelLobbyBtn = document.getElementById('cancelLobbyBtn');

cancelLobbyBtn.addEventListener('click', disconnectMultiplayer);

function disconnectMultiplayer() {
  if (conn) {
    conn.close();
    conn = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  isMultiplayer = false;
  isHost = false;
  lobbyOverlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
}

hostBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  lobbyOverlay.classList.remove('hidden');
  hostLobbySection.classList.remove('hidden');
  joinLobbySection.classList.add('hidden');
  
  hostOnlineGame();
});

joinBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  lobbyOverlay.classList.remove('hidden');
  hostLobbySection.classList.add('hidden');
  joinLobbySection.classList.remove('hidden');
  joinCodeInput.value = '';
  connectionStatus.textContent = '';
});

connectBtn.addEventListener('click', () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    connectionStatus.textContent = 'Room Code must be 4 characters.';
    return;
  }
  connectionStatus.textContent = 'Connecting to Host...';
  joinOnlineGame(code);
});

// PeerJS Connection Handlers
function hostOnlineGame() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  roomCode = code;
  roomCodeDisplay.textContent = roomCode;

  peer = new Peer('pyrotankx-' + roomCode);

  peer.on('open', (id) => {
    console.log('Host Peer open with ID:', id);
    document.querySelector('#hostLobbySection p').textContent = 'P2P Host Node Established.';
  });

  peer.on('connection', (connection) => {
    console.log('Peer connected to host!');
    conn = connection;
    isMultiplayer = true;
    isHost = true;
    bindHostConnection();
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    if (err.type === 'unavailable-id') {
      hostOnlineGame();
    } else {
      document.querySelector('#hostLobbySection p').textContent = 'Connection Error: ' + err.type;
    }
  });
}

function bindHostConnection() {
  p1Name = document.getElementById('playerNameInput').value.trim() || 'Player 1';
  conn.on('open', () => {
    // Send host name to client
    conn.send({
      type: 'init',
      name: p1Name
    });
    lobbyOverlay.classList.add('hidden');
    startGame();
  });

  conn.on('data', (data) => {
    if (data.type === 'init') {
      p2Name = data.name;
      // Update HUD elements
      document.getElementById('p1HealthTitle').textContent = `${p1Name.toUpperCase()} ARMOR`;
      document.getElementById('p2HealthSection').querySelector('.hud-title').textContent = `${p2Name.toUpperCase()} ARMOR`;
    } else if (data.type === 'input') {
      p2Inputs = data;
    }
  });

  conn.on('close', () => {
    console.log('Client disconnected.');
    handleGameOver();
    disconnectMultiplayer();
  });
}

function joinOnlineGame(code) {
  peer = new Peer();

  peer.on('open', (id) => {
    console.log('Client Peer open with ID:', id);
    conn = peer.connect('pyrotankx-' + code);
    
    conn.on('open', () => {
      isMultiplayer = true;
      isHost = false;
      p2Name = document.getElementById('playerNameInput').value.trim() || 'Player 2';
      // Send client name to host
      conn.send({
        type: 'init',
        name: p2Name
      });
      lobbyOverlay.classList.add('hidden');
      startGame();
    });

    conn.on('data', (data) => {
      if (data.type === 'init') {
        p1Name = data.name;
        // Update HUD elements
        document.getElementById('p1HealthTitle').textContent = `${p1Name.toUpperCase()} ARMOR`;
        document.getElementById('p2HealthSection').querySelector('.hud-title').textContent = `${p2Name.toUpperCase()} ARMOR`;
      } else if (data.type === 'state') {
        remoteState = data;
      } else if (data.type === 'powerup') {
        if (data.kind === 'health') {
          player.hp = Math.min(player.maxHp, player.hp + 2);
        } else if (data.kind === 'rapid') {
          rapidFireTimer = 400;
        } else if (data.kind === 'shield') {
          shieldTimer = 400;
        }
      }
    });

    conn.on('close', () => {
      console.log('Host disconnected.');
      handleGameOver();
      disconnectMultiplayer();
    });
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    connectionStatus.textContent = 'Failed to connect. Make sure room code is correct.';
  });
}

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
  const nameInputVal = document.getElementById('playerNameInput').value.trim();
  if (isMultiplayer) {
    if (isHost) {
      p1Name = nameInputVal || "Player 1";
    } else {
      p2Name = nameInputVal || "Player 2";
    }
  } else {
    p1Name = nameInputVal || "Player 1";
  }

  buildEntities();
  
  if (isMultiplayer) {
    if (isHost) {
      p2Player = new Player();
      p2Player.x = WIDTH / 2 + 50;
      p2Player.y = HEIGHT / 2 + 50;
      p2Player.angle = 180;
      p2Player.hp = 5;
      document.getElementById('p2HealthSection').classList.remove('hidden');
      document.getElementById('p1HealthTitle').textContent = `${p1Name.toUpperCase()} ARMOR`;
      document.getElementById('p2HealthSection').querySelector('.hud-title').textContent = `${p2Name.toUpperCase()} ARMOR`;
    } else {
      player.x = WIDTH / 2 + 50;
      player.y = HEIGHT / 2 + 50;
      player.angle = 180;
      document.getElementById('p2HealthSection').classList.remove('hidden');
      document.getElementById('p1HealthTitle').textContent = `${p1Name.toUpperCase()} ARMOR`;
      document.getElementById('p2HealthSection').querySelector('.hud-title').textContent = `${p2Name.toUpperCase()} ARMOR`;
    }
  } else {
    document.getElementById('p2HealthSection').classList.add('hidden');
    document.getElementById('p1HealthTitle').textContent = `${p1Name.toUpperCase()} ARMOR`;
  }

  spawnWave();
  gameState = STATE_PLAY;
  
  // UI Panels Sync
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  // Show mobile controls on touch screens
  if (isTouchDevice) {
    document.getElementById('mobileControls').classList.remove('hidden');
  }
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
  
  // Save Highscore (Single Player only)
  if (!isMultiplayer && score > highScore) {
    highScore = score;
    localStorage.setItem('pyrotankx_highscore', highScore);
  }

  // Render Overlays
  hud.classList.add('hidden');
  gameOverScreen.classList.remove('hidden');
  finalScore.textContent = score;
  endHighScore.textContent = highScore;

  // Hide mobile controls
  document.getElementById('mobileControls').classList.add('hidden');
}

// --- ENGINE LOOPS ---

function update() {
  if (gameState !== STATE_PLAY) return;

  if (isMultiplayer && !isHost) {
    // --- CLIENT UPDATE LOOP ---
    if (player.hp > 0) {
      player.update();
    }
    
    // Send local input state to Host
    if (conn && conn.open) {
      conn.send({
        type: 'input',
        x: player.x,
        y: player.y,
        angle: player.angle,
        hp: player.hp,
        shooting: keys[' '] || isMouseDown || isMobileFireActive,
        shieldActive: shieldTimer > 0
      });
    }

    // Sync timers locally for power-up indicators
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

    // Update HUD values from Client's local copy (synced from remoteState)
    if (remoteState) {
      healthBar.style.width = `${Math.max(0, (remoteState.player1.hp / player.maxHp) * 100)}%`;
      healthBar.style.backgroundColor = remoteState.player1.hp <= 2 ? COLORS.RED : COLORS.GREEN;
      
      const healthBarP2 = document.getElementById('healthBarP2');
      healthBarP2.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
      
      hudScore.textContent = String(remoteState.score).padStart(6, '0');
      hudWave.textContent = remoteState.wave;

      // Handle transition to game over from Host state sync
      if (remoteState.gameState === STATE_GAME_OVER) {
        handleGameOver();
      }
    }
    return;
  }

  // --- HOST OR SINGLE-PLAYER UPDATE LOOP ---
  
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

  // Update Player 1
  if (player.hp > 0) {
    player.update();
  }

  // Update Player 2 on Host
  if (isMultiplayer) {
    p2Player.x = p2Inputs.x;
    p2Player.y = p2Inputs.y;
    p2Player.angle = p2Inputs.angle;
    p2Player.hp = p2Inputs.hp;
    
    if (p2Player.shootCooldown > 0) p2Player.shootCooldown--;
    if (p2Player.invincible > 0) p2Player.invincible--;
    
    // Shoot for Player 2
    if (p2Inputs.shooting && p2Player.hp > 0 && p2Player.shootCooldown === 0) {
      p2Player.shootCooldown = p2Player.shootDelay;
      const rad = (p2Player.angle * Math.PI) / 180;
      const bx = p2Player.x + Math.cos(rad) * 35;
      const by = p2Player.y + Math.sin(rad) * 35;
      bullets.push(new Bullet(bx, by, p2Player.angle, 'player2', 10));
    }
  }

  // Handle Player 1 shooting
  if (player.hp > 0 && (keys[' '] || isMouseDown || isMobileFireActive)) {
    const b = player.shoot();
    if (b) bullets.push(b);
  }

  // Spawner and Powerup Spawn timer adjusted by difficulty
  let spawnDelayMultiplier = 1.0;
  let powerupSpawnDelay = 900;
  
  if (selectedDifficulty === 'easy') {
    spawnDelayMultiplier = 1.4;
    powerupSpawnDelay = 600;
  } else if (selectedDifficulty === 'hard') {
    spawnDelayMultiplier = 0.7;
    powerupSpawnDelay = 1200;
  }

  // Periodic powerup spawning
  powerupSpawnTimer--;
  if (powerupSpawnTimer <= 0) {
    powerupSpawnTimer = powerupSpawnDelay;
    if (powerups.length < 3) {
      powerups.push(new PowerUp());
    }
  }

  // Update Powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.update();

    // Check collision with Player 1
    if (player.hp > 0) {
      const dist = Math.hypot(player.x - pu.x, player.y - pu.y);
      if (dist < 30) {
        applyPowerup(player, pu.kind);
        powerups.splice(i, 1);
        continue;
      }
    }

    // Check collision with Player 2
    if (isMultiplayer && p2Player.hp > 0) {
      const dist = Math.hypot(p2Player.x - pu.x, p2Player.y - pu.y);
      if (dist < 30) {
        applyPowerup(p2Player, pu.kind);
        if (conn && conn.open) {
          conn.send({
            type: 'powerup',
            kind: pu.kind
          });
        }
        powerups.splice(i, 1);
        continue;
      }
    }
  }

  // Update Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    
    // Chase nearest player
    let target = player;
    if (isMultiplayer && p2Player.hp > 0) {
      if (player.hp <= 0) {
        target = p2Player;
      } else {
        const distP1 = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        const distP2 = Math.hypot(p2Player.x - enemy.x, p2Player.y - enemy.y);
        if (distP2 < distP1) {
          target = p2Player;
        }
      }
    }
    
    enemy.update(target);

    // Enemy shoots
    const eb = enemy.shoot(target);
    if (eb) bullets.push(eb);

    // Collide with Player 1 (Ramming)
    if (player.hp > 0) {
      const distTanks = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (distTanks < 35) {
        if (shieldTimer <= 0) {
          player.takeDamage();
        }
        explosions.push(new Explosion(enemy.x, enemy.y));
        score += 100;
        enemies.splice(i, 1);
        continue;
      }
    }

    // Collide with Player 2 (Ramming)
    if (isMultiplayer && p2Player.hp > 0) {
      const distTanks = Math.hypot(p2Player.x - enemy.x, player.y - enemy.y);
      if (distTanks < 35) {
        if (!p2Inputs.shieldActive && p2Player.invincible === 0) {
          p2Player.hp = Math.max(0, p2Player.hp - 1);
          p2Player.invincible = 60;
        }
        explosions.push(new Explosion(enemy.x, enemy.y));
        score += 100;
        enemies.splice(i, 1);
        continue;
      }
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

    if (b.owner === 'player' || b.owner === 'player2') {
      // Collide with enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy = enemies[j];
        const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
        if (dist < 25) {
          b.alive = false;
          if (enemy.takeHit()) {
            score += 200;
            explosions.push(new Explosion(enemy.x, enemy.y));
            
            // Drop powerup
            let dropChance = 0.15;
            if (selectedDifficulty === 'easy') dropChance = 0.25;
            else if (selectedDifficulty === 'hard') dropChance = 0.08;
            
            if (Math.random() < dropChance) {
              const pu = new PowerUp();
              pu.x = enemy.x;
              pu.y = enemy.y;
              powerups.push(pu);
            }
            enemies.splice(j, 1);
          } else {
            explosions.push(new Explosion(b.x, b.y, 10));
          }
          bullets.splice(i, 1);
          break;
        }
      }
    } else {
      // Enemy bullet: Collide with Player 1
      if (player.hp > 0) {
        const dist = Math.hypot(b.x - player.x, b.y - player.y);
        if (dist < 24) {
          b.alive = false;
          if (shieldTimer <= 0) {
            player.takeDamage();
          }
          explosions.push(new Explosion(b.x, b.y, 12));
          bullets.splice(i, 1);
          continue;
        }
      }

      // Enemy bullet: Collide with Player 2
      if (isMultiplayer && p2Player.hp > 0) {
        const dist = Math.hypot(b.x - p2Player.x, b.y - p2Player.y);
        if (dist < 24) {
          b.alive = false;
          if (!p2Inputs.shieldActive && p2Player.invincible === 0) {
            p2Player.hp = Math.max(0, p2Player.hp - 1);
            p2Player.invincible = 60;
          }
          explosions.push(new Explosion(b.x, b.y, 12));
          bullets.splice(i, 1);
          continue;
        }
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
      waveTransitionTimer = Math.floor(90 * spawnDelayMultiplier); // Delay next wave
    } else {
      waveTransitionTimer--;
      if (waveTransitionTimer <= 1) {
        spawnWave();
        waveTransitionTimer = 0;
      }
    }
  }

  // Check Death
  const p1Dead = player.hp <= 0;
  const p2Dead = isMultiplayer ? p2Player.hp <= 0 : true;
  if (p1Dead && p2Dead) {
    handleGameOver();
  }

  // Update HUD values
  healthBar.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  healthBar.style.backgroundColor = player.hp <= 2 ? COLORS.RED : COLORS.GREEN;
  
  if (isMultiplayer) {
    const healthBarP2 = document.getElementById('healthBarP2');
    healthBarP2.style.width = `${Math.max(0, (p2Player.hp / p2Player.maxHp) * 100)}%`;
  }
  
  hudScore.textContent = String(score).padStart(6, '0');
  hudWave.textContent = wave;

  // Broadcast state
  if (isMultiplayer && conn && conn.open) {
    netSendTimer++;
    if (netSendTimer % 2 === 0) {
      conn.send({
        type: 'state',
        score,
        wave,
        gameState,
        waveTransitionTimer,
        animFrame: Date.now() * 0.1,
        player1: {
          x: player.x,
          y: player.y,
          angle: player.angle,
          hp: player.hp,
          invincible: player.invincible,
          shieldActive: shieldTimer > 0
        },
        player2: {
          x: p2Player.x,
          y: p2Player.y,
          angle: p2Player.angle,
          hp: p2Player.hp
        },
        enemies: enemies.map(e => ({ x: e.x, y: e.y, angle: e.angle })),
        bullets: bullets.map(b => ({ x: b.x, y: b.y, angle: b.angle, owner: b.owner })),
        powerups: powerups.map(p => ({ x: p.x, y: p.y, kind: p.kind })),
        explosions: explosions.map(e => ({ x: e.x, y: e.y, frame: e.frame, maxFrames: e.maxFrames })),
        shieldActive: shieldTimer > 0,
        rapidFireActive: rapidFireTimer > 0
      });
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Render Cached Ground Backdrop
  if (groundCanvas) {
    ctx.drawImage(groundCanvas, 0, 0);
  }

  if (gameState !== STATE_PLAY) return;

  if (isMultiplayer && !isHost) {
    // --- CLIENT DRAW LOOP ---
    if (remoteState) {
      // Draw powerups
      if (remoteState.powerups) {
        remoteState.powerups.forEach(pu => {
          drawPowerupAt(ctx, pu.x, pu.y, pu.kind, remoteState.animFrame || 0);
        });
      }

      // Draw player 1 (Tan)
      if (remoteState.player1 && remoteState.player1.hp > 0) {
        if (!(remoteState.player1.invincible > 0 && Math.floor(remoteState.player1.invincible / 6) % 2 === 0)) {
          drawTank(ctx, remoteState.player1.x, remoteState.player1.y, remoteState.player1.angle, COLORS.TAN, '#a08246');
        }
        if (remoteState.player1.shieldActive) {
          drawShieldCircle(ctx, remoteState.player1.x, remoteState.player1.y);
        }
        drawPlayerName(ctx, remoteState.player1.x, remoteState.player1.y, p1Name);
      }

      // Draw Player 2 (Blue - Local Client)
      if (player.hp > 0) {
        player.draw(ctx);
        if (shieldTimer > 0) {
          drawShieldCircle(ctx, player.x, player.y);
        }
        drawPlayerName(ctx, player.x, player.y, p2Name);
      }

      // Draw enemies
      if (remoteState.enemies) {
        remoteState.enemies.forEach(enemy => {
          drawTank(ctx, enemy.x, enemy.y, enemy.angle, COLORS.DKRED, '#b43232');
        });
      }

      // Draw bullets
      if (remoteState.bullets) {
        remoteState.bullets.forEach(bullet => {
          drawBulletAt(ctx, bullet.x, bullet.y, bullet.angle, bullet.owner);
        });
      }

      // Draw explosions
      if (remoteState.explosions) {
        remoteState.explosions.forEach(exp => {
          drawExplosion(ctx, exp.x, exp.y, exp.frame, exp.maxFrames);
        });
      }
    }
    return;
  }

  // --- SINGLE PLAYER / HOST DRAW LOOP ---
  
  // Draw powerups
  for (const pu of powerups) {
    pu.draw(ctx);
  }

  // Draw player 1
  if (player.hp > 0) {
    player.draw(ctx);
    if (shieldTimer > 0) {
      drawShieldCircle(ctx, player.x, player.y);
    }
    drawPlayerName(ctx, player.x, player.y, p1Name);
  }

  // Draw player 2 (Host side)
  if (isMultiplayer && p2Player && p2Player.hp > 0) {
    if (!(p2Player.invincible > 0 && Math.floor(p2Player.invincible / 6) % 2 === 0)) {
      drawTank(ctx, p2Player.x, p2Player.y, p2Player.angle, COLORS.BLUE, '#1e4b8c');
    }
    if (p2Inputs.shieldActive) {
      drawShieldCircle(ctx, p2Player.x, p2Player.y);
    }
    drawPlayerName(ctx, p2Player.x, p2Player.y, p2Name);
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

// --- NETWORK & DRAW HELPERS ---

function applyPowerup(tank, kind) {
  if (kind === 'health') {
    tank.hp = Math.min(tank.maxHp, tank.hp + 2);
  } else if (kind === 'rapid') {
    if (tank === player) {
      rapidFireTimer = 400;
    } else {
      tank.shootDelay = 7;
      setTimeout(() => {
        tank.shootDelay = 18;
      }, 6600);
    }
  } else if (kind === 'shield') {
    if (tank === player) {
      shieldTimer = 400;
    }
  }
  score += 50;
}

function drawBulletAt(ctx, x, y, angle, owner) {
  ctx.save();
  const rad = (angle * Math.PI) / 180;
  const tx = x - Math.cos(rad) * 12;
  const ty = y - Math.sin(rad) * 12;
  const isPBullet = owner === 'player' || owner === 'player2';
  ctx.strokeStyle = isPBullet ? 'rgba(240, 210, 0, 0.4)' : 'rgba(200, 30, 30, 0.4)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  const color = isPBullet ? COLORS.YELLOW : COLORS.ORANGE;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.WHITE;
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPowerupAt(ctx, x, y, kind, animFrame) {
  const bob = Math.sin((animFrame * Math.PI) / 180) * 4;
  const cy = y + bob;

  ctx.save();
  if (kind === 'health') {
    ctx.fillStyle = 'rgba(20, 180, 20, 1)';
    ctx.beginPath();
    ctx.arc(x, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.WHITE;
    ctx.fillRect(x - 2, cy - 7, 4, 14);
    ctx.fillRect(x - 7, cy - 2, 14, 4);
  } else if (kind === 'rapid') {
    ctx.fillStyle = COLORS.YELLOW;
    ctx.beginPath();
    ctx.arc(x, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.BLACK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 7, cy);
    ctx.lineTo(x + 4, cy);
    ctx.stroke();

    ctx.fillStyle = COLORS.BLACK;
    ctx.beginPath();
    ctx.moveTo(x + 4, cy - 6);
    ctx.lineTo(x + 10, cy);
    ctx.lineTo(x + 4, cy + 6);
    ctx.fill();
  } else {
    ctx.fillStyle = COLORS.CYAN;
    ctx.beginPath();
    ctx.arc(x, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShieldCircle(ctx, x, y) {
  ctx.save();
  const pulseR = 30 + Math.sin(Date.now() * 0.01) * 3;
  const alpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.15;
  ctx.strokeStyle = `rgba(0, 210, 210, ${alpha + 0.3})`;
  ctx.lineWidth = 3;
  ctx.fillStyle = `rgba(0, 210, 210, ${alpha * 0.15})`;
  
  ctx.beginPath();
  ctx.arc(x, y, pulseR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlayerName(ctx, x, y, name) {
  ctx.save();
  ctx.fillStyle = COLORS.WHITE;
  ctx.font = "bold 11px 'Orbitron', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.fillText(name, x, y - 32);
  ctx.restore();
}
