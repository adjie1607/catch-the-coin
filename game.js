const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;


const FONT = "'Fredoka', sans-serif";
const COLORS = {
  primary: "#4A90E2",
  dark: "#2C3E50",
  light: "#FFFFFF",
  danger: "#FF5252",
  yellow: "#FFD54F",
  green: "#4CAF50",
  grass: "#A8E6CF",
  grassDark: "#95D5BC",
  player: "#2196F3"
};

const WIN_SCORE = 100;
const COIN_VALUE = 10;
const START_TIME = 30;
const DANGER_COUNT = 6; 
const COIN_COUNT = 4;
const COIN_SIZE = 24;
const DANGER_SIZE = 32;
const DANGER_PENALTY = 5;
const HUD_HEIGHT = 80;
const SPAWN_GAP = 40;        // jarak minimal antar objek saat spawn
const MAX_FRAME_TIME = 0.05; // detik, supaya lag/tab tidak aktif tidak bikin objek "lompat"

// Semua durasi dalam detik, semua kecepatan dalam piksel per detik,
// supaya game sama cepatnya di monitor 60Hz maupun 144Hz.
const MESSAGE_TIME = 1;
const HIT_FLASH_TIME = 0.17;
const LOSE_FLASH_TIME = 0.67;
const POPUP_TIME = 0.67;
const POPUP_RISE_SPEED = 90;

const player = 
{
  x: W / 2, y: H / 2,
  width: 40, height: 40,
  speed: 330,
  color: COLORS.player
};

const BGM_NOTES = [262, 330, 392, 330, 294, 349, 440, 349];
const NOTE_LENGTH = 0.4;

let muted = false;
let highScore = loadHighScore();

const card = { x: W / 2 - 260, y: H / 2 - 165, width: 520, height: 330 };
const startButton = { x: W / 2 - 100, y: card.y + 220, width: 200, height: 60 };
const restartButton = { x: W / 2 - 100, y: card.y + 230, width: 200, height: 60 };
const muteButton = { x: W - 160, y: 20, width: 140, height: 40 };

function fontOf(size, weight) {
  return (weight || "normal") + " " + size + "px " + FONT;
}

function loadHighScore() {
  try {
    return Number(localStorage.getItem("highScore")) || 0;
  } catch (e) {
    return 0; // localStorage bisa diblokir (mis. mode private)
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem("highScore", value);
  } catch (e) {
    // abaikan, high score hanya tidak tersimpan
  }
}

// Posisi acak yang tidak menimpa objek di daftar `avoid`
function randomPosition(size, avoid) {
  let pos;
  for (let tries = 0; tries < 50; tries++) {
    pos = {
      x: Math.random() * (canvas.width - size * 2) + size,
      y: Math.random() * (canvas.height - size * 2 - HUD_HEIGHT) + size + HUD_HEIGHT // Jangan spawn di area HUD
    };
    const area = {
      x: pos.x - SPAWN_GAP, y: pos.y - SPAWN_GAP,
      width: size + SPAWN_GAP * 2, height: size + SPAWN_GAP * 2
    };
    const overlaps = (avoid || []).some(function (other) {
      return isColliding(area, other);
    });
    if (!overlaps) break;
  }
  return pos;
}

function createDangers() {
  const list = [];
  for (let i = 0; i < DANGER_COUNT; i++) {
    const pos = randomPosition(DANGER_SIZE, [player].concat(list));
    list.push({ x: pos.x, y: pos.y, width: DANGER_SIZE, height: DANGER_SIZE, color: COLORS.danger });
  }
  return list;
}

function createCoins(avoid) {
  const list = [];
  for (let i = 0; i < COIN_COUNT; i++) {
    const coin = { width: COIN_SIZE, height: COIN_SIZE, color: COLORS.yellow };
    const pos = randomPosition(coin.width, avoid.concat(list));
    coin.x = pos.x; coin.y = pos.y;
    list.push(coin);
  }
  return list;
}

let dangers = createDangers();
let coins = createCoins(dangers.concat(player));

let score = 0;
let timeLeft = START_TIME;
let messageTimer = 0;
let flashTimer = 0;
let flashDuration = 1;
let popups = [];
let gameState = "START";
let touchingDanger = false;
let touchTarget = null;
let lastFrameTime = 0;
const keysPressed = {};

// Audio Setup
let audioCtx = null;
let masterGain = null;
let bgmGain = null;
let bgmTimer = null;
let bgmNextTime = 0;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, start, duration, type, volume, destination) {
  const audio = getAudio();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + duration);
}

function playCoinSound() {
  const t = getAudio().currentTime;
  playTone(880, t, 0.1, "sine", 0.2, masterGain);
  playTone(1320, t + 0.1, 0.2, "sine", 0.2, masterGain);
}

// Challenge 2: Suara menang bahagia (Melodi naik)
function playWinSound() {
  const t = getAudio().currentTime;
  [523, 659, 784, 1047].forEach(function (freq, i) {
    playTone(freq, t + i * 0.15, 0.3, "triangle", 0.2, masterGain);
  });
}

// Challenge 2: Suara kalah sedih (Melodi turun)
function playLoseSound() {
  const t = getAudio().currentTime;
  [440, 392, 349, 330, 294, 261].forEach(function (freq, i) {
    playTone(freq, t + i * 0.2, 0.4, "sawtooth", 0.15, masterGain);
  });
}

function playDangerSound() {
  const t = getAudio().currentTime;
  playTone(150, t, 0.2, "square", 0.2, masterGain);
  playTone(100, t + 0.1, 0.3, "sawtooth", 0.3, masterGain);
}

function scheduleBgm() {
  if (!bgmGain) return;
  const now = audioCtx.currentTime;
  while (bgmNextTime < now + 0.5) {
    BGM_NOTES.forEach(function (freq, i) {
      playTone(freq, bgmNextTime + i * NOTE_LENGTH, NOTE_LENGTH * 0.8, "sine", 0.05, bgmGain);
    });
    bgmNextTime += BGM_NOTES.length * NOTE_LENGTH;
  }
}

function startBgm() {
  stopBgm();
  const audio = getAudio();
  bgmGain = audio.createGain();
  bgmGain.connect(masterGain);
  bgmNextTime = audio.currentTime + 0.1;
  scheduleBgm();
  bgmTimer = setInterval(scheduleBgm, 100);
}

function stopBgm() {
  clearInterval(bgmTimer);
  if (bgmGain) bgmGain.disconnect();
  bgmGain = null;
}

function toggleMute() {
  muted = !muted;
  getAudio();
  masterGain.gain.value = muted ? 0 : 1;
}

function isInside(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function addPopup(x, y, text) {
  popups.push({ x: x, y: y, text: text, life: POPUP_TIME });
}

function triggerFlash(seconds) {
  flashTimer = seconds;
  flashDuration = seconds;
}

function startGame() {
  player.x = W / 2;
  player.y = H / 2;
  dangers = createDangers();
  coins = createCoins(dangers.concat(player));
  score = 0;
  timeLeft = START_TIME;
  messageTimer = 0;
  flashTimer = 0;
  touchingDanger = false;
  popups = [];
  gameState = "PLAYING";
  startBgm();
}

function endGame(state) {
  gameState = state;
  stopBgm();

  if (score > highScore) {
    highScore = score;
    saveHighScore(highScore);
  }

  if (state === "WIN") {
    playWinSound();
  } else {
    playLoseSound();
    triggerFlash(LOSE_FLASH_TIME); // Flash merah sedikit lebih lama
  }
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
  );
}

function movePlayer(dt) {
  const step = player.speed * dt;
  let dx = 0;
  let dy = 0;
  if (keysPressed["ArrowRight"]) dx += 1;
  if (keysPressed["ArrowLeft"]) dx -= 1;
  if (keysPressed["ArrowUp"]) dy -= 1;
  if (keysPressed["ArrowDown"]) dy += 1;

  if (dx !== 0 || dy !== 0) {
    // dibagi panjang vektor supaya gerak diagonal tidak lebih cepat
    const length = Math.hypot(dx, dy);
    player.x += (dx / length) * step;
    player.y += (dy / length) * step;
  } else if (touchTarget) {
    const toX = touchTarget.x - player.width / 2 - player.x;
    const toY = touchTarget.y - player.height / 2 - player.y;
    const distance = Math.hypot(toX, toY);
    if (distance > step) {
      player.x += (toX / distance) * step;
      player.y += (toY / distance) * step;
    } else {
      player.x += toX;
      player.y += toY;
    }
  }

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > W) player.x = W - player.width;
  if (player.y < 0) player.y = 0;
  if (player.y + player.height > H) player.y = H - player.height;
}

function updatePopups(dt) {
  popups.forEach(function (p) {
    p.y -= POPUP_RISE_SPEED * dt;
    p.life -= dt;
  });
  popups = popups.filter(function (p) { return p.life > 0; });
}

function update(dt) {
  if (messageTimer > 0) messageTimer -= dt;
  if (flashTimer > 0) flashTimer -= dt;
  updatePopups(dt);

  if (gameState !== "PLAYING") return;

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame("GAME_OVER");
    return;
  }

  movePlayer(dt);

  coins.forEach(function (coin) {
    if (isColliding(player, coin)) {
      addPopup(coin.x, coin.y, "+" + COIN_VALUE);
      playCoinSound();
      const others = dangers.concat(coins.filter(function (c) { return c !== coin; }), player);
      const pos = randomPosition(coin.width, others);
      coin.x = pos.x; coin.y = pos.y;
      score += COIN_VALUE;
    }
  });

  if (score >= WIN_SCORE) {
    endGame("WIN");
    return; // berhenti di sini, jangan lanjut cek musuh setelah menang
  }

  const touching = dangers.some(function (danger) {
    return isColliding(player, danger);
  });
  
  if (touching) {
    messageTimer = MESSAGE_TIME;
    if (!touchingDanger) {
      playDangerSound();
      triggerFlash(HIT_FLASH_TIME); // Efek flash saat nabrak (Challenge 4)
      score = Math.max(0, score - DANGER_PENALTY); // Penalti nabrak musuh
      addPopup(player.x, player.y - 20, "-" + DANGER_PENALTY);
    }
  }
  touchingDanger = touching;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(text, x, y, bg, fg, fontStr) {
  ctx.font = fontStr;
  const w = ctx.measureText(text).width + 36;
  ctx.save();
  roundRect(x, y, w, 40, 20);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + 20);
  ctx.restore();
}

function drawCenteredText(text, y, fontStr, color) {
  ctx.save();
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function drawBackground() {
  // Desain taman / lapangan kotak-kotak lucu
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, W, H);
  
  ctx.fillStyle = COLORS.grassDark;
  for (let i = 0; i < W; i += 60) {
    for (let j = 0; j < H; j += 60) {
      if ((i / 60 + j / 60) % 2 === 0) {
        ctx.fillRect(i, j, 60, 60);
      }
    }
  }
}

function drawPlayer() {
  ctx.save();
  // Badan Player
  roundRect(player.x, player.y, player.width, player.height, 12);
  ctx.fillStyle = player.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0D47A1";
  ctx.stroke();
  
  // Mata Player
  ctx.fillStyle = "white";
  ctx.beginPath(); ctx.arc(player.x + 10, player.y + 12, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(player.x + 30, player.y + 12, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "black";
  ctx.beginPath(); ctx.arc(player.x + 10, player.y + 12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(player.x + 30, player.y + 12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCoin(coin) {
  const r = coin.width / 2;
  const cx = coin.x + r;
  const cy = coin.y + r;
  
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.yellow; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#F57F17"; ctx.stroke();
  
  // Efek kilauan
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.beginPath(); ctx.arc(cx - 4, cy - 4, r / 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawDanger(danger) {
  ctx.save();
  roundRect(danger.x, danger.y, danger.width, danger.height, 8);
  ctx.fillStyle = COLORS.danger; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#B71C1C"; ctx.stroke();
  
  // Wajah marah musuh
  ctx.fillStyle = "white";
  ctx.fillRect(danger.x + 6, danger.y + 8, 8, 4);
  ctx.fillRect(danger.x + 18, danger.y + 8, 8, 4);
  ctx.fillStyle = "black";
  ctx.fillRect(danger.x + 10, danger.y + 20, 12, 4);
  ctx.restore();
}

function drawPopups() {
  ctx.save();
  ctx.font = fontOf(24, "bold");
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFEB3B";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  
  popups.forEach(function (p) {
    ctx.strokeText(p.text, p.x + 10, p.y);
    ctx.fillText(p.text, p.x + 10, p.y);
  });
  ctx.restore();
}

// Challenge 1: HUD Warna dan Font menarik
function drawHUD() {
  const hudFont = fontOf(18, "bold");
  const secondsLeft = Math.ceil(timeLeft);
  const timeText = "⏰ Waktu: " + secondsLeft;
  
  drawPill("💰 Skor: " + score, 20, 20, COLORS.dark, "#fff", hudFont);
  
  ctx.font = hudFont;
  const timeWidth = ctx.measureText(timeText).width + 36;
  const timeBg = secondsLeft <= 10 ? COLORS.danger : COLORS.dark;
  drawPill(timeText, W - 180 - timeWidth, 20, timeBg, "#fff", hudFont);
}

// Challenge 4: Layar berkedip merah transparan
function drawFlash() {
  ctx.fillStyle = "rgba(255, 82, 82, " + (flashTimer / flashDuration) * 0.6 + ")";
  ctx.fillRect(0, 0, W, H);
}

function drawOverlay() {
  ctx.fillStyle = "rgba(44, 62, 80, 0.8)";
  ctx.fillRect(0, 0, W, H);
}

function drawButton(rect, label, color) {
  ctx.save();
  roundRect(rect.x, rect.y, rect.width, rect.height, 30);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  
  ctx.font = fontOf(24, "bold");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.restore();
}

// Challenge 5: Start Screen Tampilkan High Score
function drawStartScreen() {
  drawOverlay();
  
  ctx.save();
  roundRect(card.x, card.y, card.width, card.height, 24);
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = COLORS.primary; ctx.stroke();
  ctx.restore();
  
  drawCenteredText("CATCH THE COIN", card.y + 70, fontOf(48, "bold"), COLORS.primary);
  drawCenteredText("Ambil koin emas, hindari musuh merah!", card.y + 115, fontOf(18, "bold"), COLORS.dark);
  
  // Tampilan High Score
  drawCenteredText("🏆 High Score: " + highScore, card.y + 160, fontOf(24, "bold"), COLORS.green);
  
  drawButton(startButton, "▶ MULAI", COLORS.green);
  drawCenteredText("atau tekan ENTER", card.y + 300, fontOf(14), "#999");
}

function drawEndScreen() {
  const won = gameState === "WIN";
  drawOverlay();
  
  ctx.save();
  roundRect(card.x, card.y, card.width, card.height, 24);
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = won ? COLORS.green : COLORS.danger; ctx.stroke();
  ctx.restore();
  
  drawCenteredText(won ? "🎉 YOU WIN!" : "💀 GAME OVER", card.y + 70, fontOf(48, "bold"), won ? COLORS.green : COLORS.danger);
  drawCenteredText("Skor Akhir Kamu:", card.y + 120, fontOf(20, "bold"), COLORS.dark);
  drawCenteredText(score + " Poin", card.y + 160, fontOf(36, "bold"), COLORS.primary);
  
  drawButton(restartButton, "🔄 MAIN LAGI", won ? COLORS.green : COLORS.danger);
  drawCenteredText("atau tekan ENTER", card.y + 310, fontOf(14), "#999");
}

// Challenge 3: Tombol Mute di HUD bisa diklik mouse
function drawMuteButton() {
  ctx.save();
  roundRect(muteButton.x, muteButton.y, muteButton.width, muteButton.height, 20);
  ctx.fillStyle = muted ? COLORS.danger : COLORS.light;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.dark;
  ctx.stroke();
  
  ctx.font = fontOf(16, "bold");
  ctx.fillStyle = muted ? "#fff" : COLORS.dark;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(muted ? "🔇 Suara OFF" : "🔊 Suara ON", muteButton.x + muteButton.width / 2, muteButton.y + muteButton.height / 2);
  ctx.restore();
}

function updateMessage() {
  const messageEl = document.getElementById("message");
  const text = messageTimer > 0 ? "⚠️ Nabrak!" : "";
  if (messageEl.textContent !== text) messageEl.textContent = text;
}

function draw() {
  drawBackground();
  dangers.forEach(drawDanger);
  coins.forEach(drawCoin);
  drawPlayer();
  drawPopups();
  drawHUD();

  if (flashTimer > 0) drawFlash(); // Challenge 4 Visual
  if (gameState === "START") drawStartScreen();
  if (gameState === "WIN" || gameState === "GAME_OVER") drawEndScreen();
  
  drawMuteButton(); // Challenge 3 Visual
  
  updateMessage();
}

function gameLoop(now) {
  // dt dalam detik, dibatasi supaya tidak meledak setelah tab tidak aktif
  const dt = Math.min((now - lastFrameTime) / 1000, MAX_FRAME_TIME);
  lastFrameTime = now;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", function (event) {
  keysPressed[event.key] = true;
  if (event.key.startsWith("Arrow")) event.preventDefault();
  if (event.repeat) return;
  if (event.key === "Enter" && gameState !== "PLAYING") startGame();
  if (event.key.toLowerCase() === "m") toggleMute();
});

document.addEventListener("keyup", function (event) {
  keysPressed[event.key] = false;
});

// Tanpa ini, tombol yang sedang ditahan saat pindah window akan "nyangkut"
window.addEventListener("blur", function () {
  Object.keys(keysPressed).forEach(function (key) { keysPressed[key] = false; });
  touchTarget = null;
});

// Suara ikut berhenti saat tab disembunyikan (game ikut berhenti karena requestAnimationFrame)
document.addEventListener("visibilitychange", function () {
  if (!audioCtx) return;
  if (document.hidden) audioCtx.suspend();
  else audioCtx.resume();
});

// Challenge 3 & 6: Resolusi Mouse Klik Dinamis (Canvas Responsif)
function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (W / rect.width),
    y: (event.clientY - rect.top) * (H / rect.height)
  };
}

canvas.addEventListener("click", function (event) {
  const point = canvasPoint(event);

  if (isInside(point.x, point.y, muteButton)) {
    toggleMute();
  } else if (gameState === "START" && isInside(point.x, point.y, startButton)) {
    startGame();
  } else if ((gameState === "WIN" || gameState === "GAME_OVER") && isInside(point.x, point.y, restartButton)) {
    startGame();
  }
});

// Kontrol sentuh untuk HP: pemain bergerak menuju jari yang menyentuh layar
canvas.addEventListener("pointerdown", function (event) {
  if (event.pointerType !== "mouse") touchTarget = canvasPoint(event);
});

canvas.addEventListener("pointermove", function (event) {
  if (touchTarget && event.pointerType !== "mouse") touchTarget = canvasPoint(event);
});

["pointerup", "pointercancel"].forEach(function (type) {
  canvas.addEventListener(type, function () { touchTarget = null; });
});

requestAnimationFrame(gameLoop);
