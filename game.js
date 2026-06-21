// ============================================================
//  CLT CONTRA AS CARTEIRAS — game.js
//  Jogo de plataforma 2D em pixel art puro (Canvas / JS)
// ============================================================

// ─── CONFIGURAÇÕES GLOBAIS (edite aqui para ajustar o jogo) ─
const CONFIG = {
  // Canvas / escala
  BASE_W: 480,          // largura interna do canvas (pixels lógicos)
  BASE_H: 270,          // altura interna do canvas

  // Jogador
  PLAYER_SPEED:    2.6, // velocidade horizontal
  PLAYER_JUMP:    -6.5, // força do pulo (negativo = para cima)
  PLAYER_LIVES:    3,   // vidas iniciais
  GRAVITY:         0.32,// gravidade por frame

  // Inimigos comuns
  ENEMY_SPEED:     1.0, // velocidade base das carteiras
  ENEMY_FAST_MULT: 1.8, // multiplicador para carteiras rápidas

  // Boss
  BOSS_HP:         8,   // quantos pulos/maletas para derrotar
  BOSS_SPEED:      0.9,
  BOSS_JUMP_FORCE:-5.5,

  // Arremesso de maletas
  BRIEFCASE_START_AMMO: 3,   // munição inicial de maletas
  BRIEFCASE_MAX_AMMO:   6,   // limite de munição que pode carregar
  BRIEFCASE_SPEED:      5,   // velocidade da maleta arremessada
  BRIEFCASE_DAMAGE:     1,   // dano causado ao boss por acerto
  BRIEFCASE_COOLDOWN:   25,  // frames de espera entre arremessos

  // Câmera
  CAM_LOOKAHEAD:   80,  // pixels à frente que a câmera antecipa
};

// ─── DEFINIÇÃO DAS FASES ─────────────────────────────────────
// Cada fase tem um tema visual próprio (estilo "cada fase é um jogo
// diferente", como em jogos de plataforma de referência nacional).
// Edite aqui para adicionar, remover ou reordenar fases.
const LEVELS = [
  {
    name: 'CENTRO DA CIDADE',
    theme: 'cidade',
    width: 2600,
    enemyCount: 16,
    fastEnemyChance: 0.25,
    hasBoss: false,
  },
  {
    name: 'METRÔ LOTADO',
    theme: 'metro',
    width: 2800,
    enemyCount: 20,
    fastEnemyChance: 0.35,
    hasBoss: false,
  },
  {
    name: 'ESCRITÓRIO CORPORATIVO',
    theme: 'escritorio',
    width: 2900,
    enemyCount: 22,
    fastEnemyChance: 0.45,
    hasBoss: false,
  },
  {
    name: 'RH INFERNAL',
    theme: 'rh_infernal',
    width: 900,
    enemyCount: 6,
    fastEnemyChance: 0.5,
    hasBoss: true,
  },
];

// ─── ESTADO GLOBAL DO JOGO ───────────────────────────────────
let canvas, ctx;
let textCanvas, tctx; // canvas overlay de texto (alta resolução, nítido)
let gameState = 'title'; // 'title' | 'playing' | 'gameover' | 'win' | 'levelcomplete'
let camera = { x: 0 };
let score = 0;
let currentLevelIndex = 0; // índice da fase atual em LEVELS
let frameCount = 0;

// ─── INPUTS ──────────────────────────────────────────────────
const keys = { left: false, right: false, up: false };
const throwInput = { pressed: false }; // clique do mouse / botão mobile de arremesso

// ─── MOBILE JOYSTICK ─────────────────────────────────────────
const joystick = { active: false, dx: 0, startX: 0, startY: 0, id: null };
const mobileJump = { pressed: false };

// ─── ENTIDADES ───────────────────────────────────────────────
let player, enemies, boss, collectibles, particles;
let platforms, levelWidth;
let playerBriefcases; // maletas arremessadas pelo jogador, voando em direção aos inimigos

// ============================================================
//  UTILITÁRIOS
// ============================================================
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============================================================
//  PIXEL-ART HELPERS  (desenho baseado em blocos de pixels)
// ============================================================
function px(ctx, color, x, y, w = 1, h = 1, scale = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x * scale), Math.round(y * scale), w * scale, h * scale);
}

// ─── Desenha texto pixel (simples, via fillText com fonte mono) ─
// Desenha texto nítido no canvas overlay (textCanvas), não no canvas de
// pixel art. Coordenadas continuam no espaço lógico BASE_W×BASE_H — a
// escala para a resolução real da tela é aplicada automaticamente.
function pixelText(txt, x, y, size = 8, color = '#fff', align = 'left') {
  if (!tctx) return;
  tctx.save();
  tctx.font = `bold ${size}px "Courier New", monospace`;
  tctx.fillStyle = color;
  tctx.textAlign = align;
  tctx.textBaseline = 'alphabetic';
  // sombra
  tctx.fillStyle = '#000';
  tctx.fillText(txt, x + 1, y + 1);
  tctx.fillStyle = color;
  tctx.fillText(txt, x, y);
  tctx.restore();
}

function clearTextCanvas() {
  if (!tctx) return;
  // tctx já está com setTransform aplicado para o espaço lógico BASE_W×BASE_H
  tctx.clearRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H);
}

// ============================================================
//  PARTÍCULAS
// ============================================================
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: -(Math.random() * 3 + 1),
      life: 30 + rnd(0, 20),
      maxLife: 50,
      color,
      size: rnd(2, 5),
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camera.x, p.y, p.size, p.size);
    ctx.restore();
  }
}

// ============================================================
//  SPRITES (pixel art via primitivos Canvas)
// ============================================================

// ─── JOGADOR ─────────────────────────────────────────────────
// Cada sprite é desenhado em grade 16×24 (escalado ×2)
function drawPlayer(p) {
  const S = 2; // escala
  const ox = p.x - camera.x;
  const oy = p.y;
  ctx.save();
  if (p.dir === -1) {
    // espelha horizontalmente
    ctx.translate(ox + p.w, oy);
    ctx.scale(-1, 1);
    ctx.translate(0, 0);
    drawPlayerSprite(ctx, 0, 0, S, p.animFrame, p.state);
  } else {
    ctx.translate(ox, oy);
    drawPlayerSprite(ctx, 0, 0, S, p.animFrame, p.state);
  }
  ctx.restore();
}

function drawPlayerSprite(ctx, ox, oy, S, frame, state) {
  // ── Cabelo (volumoso, castanho, repartido) ──
  px(ctx,'#3D2410', ox+3, oy-2, 10,4,S);
  px(ctx,'#4E2E14', ox+4, oy-3, 8,3,S);
  px(ctx,'#5C3518', ox+5, oy-4, 6,2,S);
  px(ctx,'#3D2410', ox+2, oy-1, 2,4,S);
  px(ctx,'#3D2410', ox+12,oy-1, 2,4,S);

  // ── Rosto ──
  px(ctx,'#F4C49C', ox+4, oy+1, 8,7,S);
  px(ctx,'#E8AE7E', ox+4, oy+6, 8,2,S); // sombra queixo
  // Orelhas
  px(ctx,'#E8AE7E', ox+3, oy+3, 1,3,S);
  px(ctx,'#E8AE7E', ox+12,oy+3, 1,3,S);

  // ── Óculos (preto, retangular) ──
  px(ctx,'#1A1A1A', ox+4, oy+3, 4,3,S);
  px(ctx,'#1A1A1A', ox+8, oy+3, 4,3,S);
  px(ctx,'#1A1A1A', ox+7, oy+4, 1,1,S); // ponte
  px(ctx,'#BBDEFB', ox+5, oy+4, 2,1,S); // lente brilho
  px(ctx,'#BBDEFB', ox+9, oy+4, 2,1,S);
  px(ctx,'#2C2C2C', ox+8, oy+2, 4,1,S); // haste

  // Olhos
  px(ctx,'#3D2B1F', ox+5, oy+4, 1,1,S);
  px(ctx,'#3D2B1F', ox+9, oy+4, 1,1,S);

  // Sobrancelhas
  px(ctx,'#3D2410', ox+4, oy+2, 3,1,S);
  px(ctx,'#3D2410', ox+9, oy+2, 3,1,S);

  // Sorriso discreto
  px(ctx,'#B8784F', ox+6, oy+7, 4,1,S);

  // Pescoço
  px(ctx,'#F4C49C', ox+6,oy+8, 4,1,S);

  // ── Terno cinza ──
  px(ctx,'#5C636B', ox+1,oy+9,  14,9,S);  // corpo terno
  px(ctx,'#6E7680', ox+2,oy+9,  12,9,S);  // sombreado central
  // Lapelas (mais escuras)
  px(ctx,'#454C54', ox+3, oy+9, 3,5,S);
  px(ctx,'#454C54', ox+10,oy+9, 3,5,S);
  // Camisa branca
  px(ctx,'#F5F5F5', ox+6,oy+9, 4,5,S);
  // Gravata azul
  px(ctx,'#1565C0', ox+7,oy+9,  2,2,S);
  px(ctx,'#1976D2', ox+7,oy+11, 2,5,S);
  px(ctx,'#0D47A1', ox+7,oy+15, 2,2,S);
  // Botões do terno
  px(ctx,'#33373D', ox+7,oy+14, 1,1,S);
  px(ctx,'#33373D', ox+7,oy+16, 1,1,S);

  // ── Braços (animados) ──
  let armOff = (state === 'walk') ? (frame % 2 === 0 ? -1 : 1) : 0;
  // Braço direito (livre, balança)
  px(ctx,'#5C636B', ox+14,oy+9-armOff, 2,6,S);
  px(ctx,'#454C54', ox+14,oy+9-armOff, 1,6,S);
  px(ctx,'#F4C49C', ox+14,oy+15-armOff,2,2,S); // mão

  // Braço esquerdo segurando a pasta (fixo)
  px(ctx,'#5C636B', ox+0, oy+10, 2,5,S);
  px(ctx,'#F4C49C', ox+0, oy+15, 2,2,S); // mão

  // ── Pasta/maleta marrom ──
  px(ctx,'#6D4C2A', ox-3, oy+11, 6,7,S);
  px(ctx,'#8A6238', ox-3, oy+11, 6,2,S); // topo da pasta
  px(ctx,'#5A3D20', ox-1, oy+13, 2,4,S); // fivela
  px(ctx,'#D7C49E', ox-2, oy+15, 4,1,S); // detalhe claro (folhas saindo)

  // ── Calça ──
  px(ctx,'#3E444B', ox+2, oy+18, 5,6,S);
  px(ctx,'#3E444B', ox+9, oy+18, 5,6,S);
  px(ctx,'#34393F', ox+7, oy+18, 2,4,S); // vinco central

  // ── Pernas (animadas) ──
  let legOff = 0;
  if (state === 'walk') { legOff = frame % 2 === 0 ? 1 : -1; }
  if (state === 'jump') { legOff = 2; }

  // Sapatos marrons
  px(ctx,'#4A2E14', ox+2, oy+23+legOff, 5,2,S);
  px(ctx,'#4A2E14', ox+9, oy+23-legOff, 5,2,S);
  px(ctx,'#6D4426', ox+2, oy+23+legOff, 5,1,S);
  px(ctx,'#6D4426', ox+9, oy+23-legOff, 5,1,S);
}

// ─── INIMIGO (Carteira de Trabalho) ─────────────────────────
function drawEnemy(e) {
  if (e.dead) return;
  const S = 2;
  const ox = e.x - camera.x;
  const oy = e.y;
  ctx.save();
  if (e.dir === 1) { ctx.translate(ox, oy); }
  else { ctx.translate(ox + e.w, oy); ctx.scale(-1, 1); ctx.translate(0, 0); }
  drawWalletSprite(ctx, 0, 0, S, e.animFrame, e.fast);
  ctx.restore();
}

function drawWalletSprite(ctx, ox, oy, S, frame, fast) {
  const col  = fast ? '#1A1F71' : '#1E2A8A';   // capa (mais escura se rápida = mais perigosa)
  const col2 = fast ? '#26318C' : '#283DAE';   // face
  const lineC= '#9FB3E8';
  const eyeC = fast ? '#FF3D00' : '#FFC400';   // olhos: laranja-fogo se rápida

  // ── Garras (atrás do corpo) ──
  let armSwing = frame % 2 === 0 ? 0 : 1;
  // garra esquerda
  px(ctx, col, ox-3, oy+4-armSwing, 4,3,S);
  px(ctx,'#0D1352', ox-4, oy+3-armSwing, 1,2,S);
  px(ctx,'#0D1352', ox-3, oy+2-armSwing, 1,1,S);
  px(ctx,'#0D1352', ox-2, oy+2-armSwing, 1,1,S);
  // garra direita
  px(ctx, col, ox+15, oy+4+armSwing, 4,3,S);
  px(ctx,'#0D1352', ox+18, oy+3+armSwing, 1,2,S);
  px(ctx,'#0D1352', ox+17, oy+2+armSwing, 1,1,S);
  px(ctx,'#0D1352', ox+16, oy+2+armSwing, 1,1,S);

  // ── Corpo (capa do documento) ──
  px(ctx, '#0D1352', ox+0, oy+1, 16,15,S); // contorno escuro
  px(ctx, col,  ox+1,oy+2,  14,12,S);
  px(ctx, col2, ox+2,oy+3,  12,10,S);

  // Lombada (direita)
  px(ctx,'#C9CDD6', ox+13, oy+2, 1,12,S);
  px(ctx,'#9AA0AC', ox+14, oy+2, 1,12,S);

  // Linhas de texto decorativas
  px(ctx, lineC, ox+4,oy+4, 8,1,S);

  // Pequeno emblema central
  px(ctx,'#D4AF37', ox+7, oy+9, 2,2,S);

  // ── Olhos rasgados e malignos ──
  px(ctx,'#000', ox+2, oy+4, 5,3,S);
  px(ctx,'#000', ox+9, oy+4, 5,3,S);
  px(ctx, eyeC,  ox+3, oy+5, 3,2,S);
  px(ctx, eyeC,  ox+10,oy+5, 3,2,S);
  px(ctx,'#fff', ox+3, oy+5, 1,1,S);
  px(ctx,'#fff', ox+10,oy+5, 1,1,S);
  // Sobrancelhas raivosas (diagonais, afiadas)
  px(ctx,'#000', ox+2, oy+3, 4,1,S);
  px(ctx,'#000', ox+10,oy+3, 4,1,S);

  // ── Boca com dentes afiados ──
  px(ctx,'#000', ox+3, oy+11, 10,3,S);
  px(ctx,'#F5F5F5', ox+4, oy+11, 1,2,S);
  px(ctx,'#F5F5F5', ox+6, oy+11, 1,2,S);
  px(ctx,'#F5F5F5', ox+8, oy+11, 1,2,S);
  px(ctx,'#F5F5F5', ox+10,oy+11, 1,2,S);
  px(ctx,'#F5F5F5', ox+5, oy+12, 1,2,S);
  px(ctx,'#F5F5F5', ox+7, oy+12, 1,2,S);
  px(ctx,'#F5F5F5', ox+9, oy+12, 1,2,S);

  // Brilho extra se for rápida (aura de perigo)
  if (fast && frame % 6 < 3) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    px(ctx,'#FF1744', ox-1, oy, 18,16,S);
    ctx.restore();
  }

  // ── Pernas/garras dos pés ──
  let legOff = frame % 2 === 0 ? 1 : -1;
  px(ctx,'#0D1352', ox+3, oy+14, 3,3+legOff,S);
  px(ctx,'#0D1352', ox+10,oy+14, 3,3-legOff,S);
  px(ctx, col,      ox+3, oy+14, 3,2+legOff,S);
  px(ctx, col,      ox+10,oy+14, 3,2-legOff,S);
  // garras dos pés
  px(ctx,'#9AA0AC', ox+2, oy+16+legOff, 1,1,S);
  px(ctx,'#9AA0AC', ox+5, oy+16+legOff, 1,1,S);
  px(ctx,'#9AA0AC', ox+9, oy+16-legOff, 1,1,S);
  px(ctx,'#9AA0AC', ox+12,oy+16-legOff, 1,1,S);
}

// ─── BOSS ────────────────────────────────────────────────────
function drawBoss(b) {
  if (b.dead) return;
  const S = 3;
  const ox = b.x - camera.x;
  const oy = b.y;
  ctx.save();
  ctx.translate(ox, oy);
  drawBossSprite(ctx, 0, 0, S, b.animFrame, b.hp);
  ctx.restore();

  // Barra de vida (deslocada para cima por causa dos chifres/chamas)
  const bx = b.x - camera.x;
  const barW = 90;
  const barX = bx + b.w/2 - barW/2;
  const barY = b.y - 28;
  ctx.fillStyle = '#111';
  ctx.fillRect(barX - 1, barY, barW + 2, 9);
  ctx.fillStyle = '#e53935';
  ctx.fillRect(barX, barY + 1, barW * (b.hp / CONFIG.BOSS_HP), 7);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 1, barY, barW + 2, 9);
  pixelText('BOSS', barX + barW/2, barY - 3, 7, '#FFD700', 'center');
}

function drawBossSprite(ctx, ox, oy, S, frame, hp) {
  const angry  = hp <= CONFIG.BOSS_HP / 2;
  const bodyC  = '#16207A';
  const faceC  = '#1E2A8A';
  const lineC  = '#7B8FE0';
  const flameC = angry ? '#7B1FA2' : '#3949AB';
  const flame2 = angry ? '#AB47BC' : '#5C6BC0';

  // ── Aura/chamas atrás (flutuante, pulsante) ──
  const flamePulse = Math.sin(frame * 0.7) * 2;
  ctx.save();
  ctx.globalAlpha = 0.55;
  px(ctx, flameC, ox-4, oy-6+flamePulse, 6,10,S);
  px(ctx, flameC, ox+26,oy-6-flamePulse, 6,10,S);
  px(ctx, flame2, ox-2, oy-8+flamePulse, 4,6,S);
  px(ctx, flame2, ox+26,oy-8-flamePulse, 4,6,S);
  px(ctx, flameC, ox+6, oy-10, 4,8,S);
  px(ctx, flameC, ox+18,oy-10, 4,8,S);
  ctx.restore();

  // ── Chifres/espinhos no topo ──
  px(ctx,'#D4AF37', ox+3,  oy-6, 3,7,S);
  px(ctx,'#FFD700', ox+3,  oy-6, 1,5,S);
  px(ctx,'#D4AF37', ox+22, oy-6, 3,7,S);
  px(ctx,'#FFD700', ox+22, oy-6, 1,5,S);
  px(ctx,'#D4AF37', ox+12, oy-8, 3,8,S);
  px(ctx,'#FFD700', ox+12, oy-8, 1,6,S);

  // ── Garras enormes laterais ──
  let clawSwing = frame % 4 < 2 ? 0 : 2;
  px(ctx,'#0D1352', ox-6, oy+10-clawSwing, 5,6,S);
  px(ctx,'#16207A', ox-7, oy+9-clawSwing, 2,3,S);
  px(ctx,'#16207A', ox-6, oy+7-clawSwing, 2,3,S);
  px(ctx,'#16207A', ox-4, oy+6-clawSwing, 2,3,S);
  px(ctx,'#0D1352', ox+29, oy+10+clawSwing, 5,6,S);
  px(ctx,'#16207A', ox+33, oy+9+clawSwing, 2,3,S);
  px(ctx,'#16207A', ox+32, oy+7+clawSwing, 2,3,S);
  px(ctx,'#16207A', ox+30, oy+6+clawSwing, 2,3,S);

  // ── Correntes penduradas (detalhe ameaçador) ──
  px(ctx,'#9AA0AC', ox-5, oy+16-clawSwing, 2,2,S);
  px(ctx,'#6E7680', ox-6, oy+19-clawSwing, 2,2,S);
  px(ctx,'#9AA0AC', ox-5, oy+22-clawSwing, 2,2,S);
  px(ctx,'#9AA0AC', ox+31,oy+16+clawSwing, 2,2,S);
  px(ctx,'#6E7680', ox+32,oy+19+clawSwing, 2,2,S);
  px(ctx,'#9AA0AC', ox+31,oy+22+clawSwing, 2,2,S);

  // ── Corpo enorme da carteira ──
  px(ctx,'#06092E', ox+0, oy+1, 28, 25, S); // contorno bem escuro
  px(ctx, bodyC,    ox+1, oy+2,  26, 22, S);
  px(ctx, faceC,    ox+3, oy+4,  22, 18, S);

  // Lombada espinhenta (lado direito)
  for (let i = 0; i < 6; i++) {
    px(ctx,'#C9CDD6', ox+24, oy+3+i*4, 2,2,S);
    px(ctx,'#9AA0AC', ox+26, oy+4+i*4, 2,1,S);
  }

  // Linha decorativa / gema central
  px(ctx, lineC, ox+9, oy+9, 10,1,S);
  ctx.save();
  ctx.globalAlpha = frame % 8 < 4 ? 1 : 0.5;
  px(ctx,'#00E5FF', ox+12, oy+1, 3,3,S);
  ctx.restore();

  // ── Olhos ENORMES, flamejantes ──
  px(ctx,'#000', ox+3,  oy+5,  8,7,S);
  px(ctx,'#000', ox+17, oy+5,  8,7,S);
  const eyeGlow = angry ? '#FF1744' : '#FF6D00';
  px(ctx, eyeGlow, ox+4,oy+6, 6,5,S);
  px(ctx, eyeGlow, ox+18,oy+6,6,5,S);
  px(ctx,'#FFEB3B', ox+5,oy+7, 3,2,S);
  px(ctx,'#FFEB3B', ox+19,oy+7,3,2,S);
  // pupilas finas (verticais, répteis)
  px(ctx,'#000', ox+7, oy+6, 1,5,S);
  px(ctx,'#000', ox+21,oy+6, 1,5,S);

  // Sobrancelhas raivosas enormes, bem inclinadas
  px(ctx,'#000', ox+2,  oy+3,  10,2,S);
  px(ctx,'#000', ox+3,  oy+1,  5,2,S);
  px(ctx,'#000', ox+16, oy+3,  10,2,S);
  px(ctx,'#000', ox+21, oy+1,  5,2,S);

  // ── Boca escancarada com presas longas ──
  px(ctx,'#000', ox+4,  oy+17, 20,7,S);
  px(ctx,'#5C0014', ox+5, oy+18, 18,5,S); // garganta vermelho-escura
  // presas superiores
  for (let t = 0; t < 5; t++) {
    px(ctx,'#F5F5F5', ox+5+t*4, oy+17, 2,3,S);
  }
  // presas inferiores
  for (let t = 0; t < 4; t++) {
    px(ctx,'#F5F5F5', ox+7+t*4, oy+21, 2,3,S);
  }

  // ── Pernas grossas ──
  let legOff = frame % 4 < 2 ? 1 : -1;
  px(ctx,'#06092E', ox+3,  oy+23, 7, 7+legOff, S);
  px(ctx,'#06092E', ox+18, oy+23, 7, 7-legOff, S);
  px(ctx, bodyC,    ox+4,  oy+23, 5, 6+legOff, S);
  px(ctx, bodyC,    ox+19, oy+23, 5, 6-legOff, S);
  // Garras dos pés
  px(ctx,'#000', ox+3,  oy+29+legOff, 7,3,S);
  px(ctx,'#000', ox+18, oy+29-legOff, 7,3,S);
  px(ctx,'#C9CDD6', ox+3, oy+30+legOff, 1,2,S);
  px(ctx,'#C9CDD6', ox+6, oy+30+legOff, 1,2,S);
  px(ctx,'#C9CDD6', ox+9, oy+30+legOff, 1,2,S);
  px(ctx,'#C9CDD6', ox+18,oy+30-legOff, 1,2,S);
  px(ctx,'#C9CDD6', ox+21,oy+30-legOff, 1,2,S);
  px(ctx,'#C9CDD6', ox+24,oy+30-legOff, 1,2,S);

  // Efeito pulsante extra se irritado (fase 2)
  if (angry && frame % 8 < 4) {
    ctx.globalAlpha = 0.2;
    px(ctx,'#FF1744', ox, oy, 28,26,S);
    ctx.globalAlpha = 1;
  }
}

// ─── PROJÉTIL DO BOSS ─────────────────────────────────────────
function drawProjectile(proj) {
  const ox = proj.x - camera.x;
  ctx.save();
  ctx.translate(ox + proj.w/2, proj.y + proj.h/2);
  ctx.rotate(frameCount * 0.15);
  // papel voando
  ctx.fillStyle = '#ECEFF1';
  ctx.fillRect(-proj.w/2, -proj.h/2, proj.w, proj.h);
  ctx.fillStyle = '#90A4AE';
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(-proj.w/2 + 2, -proj.h/2 + 2 + i*3, proj.w - 4, 1);
  }
  ctx.restore();
}

// ─── Maleta arremessada pelo jogador ──────────────────────────
function drawPlayerBriefcase(b) {
  const ox = b.x - camera.x;
  ctx.save();
  ctx.translate(ox + b.w/2, b.y + b.h/2);
  if (!b.spent) ctx.rotate(b.rot);
  // corpo da maleta
  ctx.fillStyle = '#6D4C2A';
  ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
  ctx.fillStyle = '#8A6238';
  ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h * 0.35);
  ctx.fillStyle = '#5A3D20';
  ctx.fillRect(-2, -b.h/2, 4, b.h); // fivela central
  ctx.fillStyle = '#3D2A15';
  ctx.fillRect(-1, -b.h/2 - 2, 2, 3); // alça
  ctx.restore();
}

// ─── COLETÁVEIS ──────────────────────────────────────────────
function drawCollectible(c) {
  if (c.collected) return;
  const ox = c.x - camera.x;
  const bob = Math.sin((frameCount + c.offset) * 0.08) * 2;
  ctx.save();
  ctx.translate(ox, c.y + bob);

  switch (c.type) {
    case 'moeda':
      // Moeda amarela
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(c.w/2, c.h/2, c.w/2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#FFC107';
      ctx.beginPath();
      ctx.arc(c.w/2, c.h/2, c.w/2 - 2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('$', c.w/2, c.h/2 + 3);
      break;
    case 'cafe':
      // Xícara de café
      ctx.fillStyle = '#795548';
      ctx.fillRect(1,4, 12,9);
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(2,5, 10,2);
      ctx.fillStyle = '#795548';
      ctx.fillRect(13,6, 2,4);
      // vapor
      if (frameCount % 20 < 10) {
        ctx.fillStyle = '#B0BEC5';
        ctx.fillRect(3,1,1,3);
        ctx.fillRect(7,0,1,3);
        ctx.fillRect(11,1,1,3);
      }
      break;
    case 'holerite':
      // Papel holerite
      ctx.fillStyle = '#E3F2FD';
      ctx.fillRect(0,0,c.w,c.h);
      ctx.fillStyle = '#1565C0';
      ctx.fillRect(0,0,c.w,4);
      ctx.fillStyle = '#fff';
      ctx.font = '4px Courier New';
      ctx.fillText('HOLERITE',1,3);
      ctx.fillStyle = '#78909C';
      for(let i=0;i<3;i++) ctx.fillRect(2,6+i*3,c.w-4,1);
      break;
    case 'maleta':
      // Munição de maleta coletável — pequena, com brilho pulsante
      ctx.fillStyle = '#6D4C2A';
      ctx.fillRect(0, 3, 14, 9);
      ctx.fillStyle = '#8A6238';
      ctx.fillRect(0, 3, 14, 3);
      ctx.fillStyle = '#5A3D20';
      ctx.fillRect(6, 3, 2, 9); // fivela
      ctx.fillStyle = '#3D2A15';
      ctx.fillRect(5, 0, 4, 4); // alça
      // brilho indicando "pegue-me"
      if (frameCount % 30 < 15) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(-2, 1, 18, 13);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

// ============================================================
//  CENÁRIO (pixel art de cidade)
// ============================================================

// Paleta de cores do cenário
const SKY_TOP    = '#1A237E';
const SKY_BOT    = '#283593';
const BUILD_COLS = ['#37474F','#455A64','#546E7A','#263238','#4A148C','#1B5E20'];
const WINDOW_ON  = '#FFE082';
const WINDOW_OFF = '#37474F';

// Paletas e elementos visuais por tema de fase
const THEMES = {
  cidade: {
    skyTop: '#0D1B4B', skyMid: '#1A237E', skyBot: '#283593',
    buildCols: ['#37474F','#455A64','#546E7A','#263238','#4A148C','#1B5E20'],
    windowOn: '#FFE082', windowOff: '#37474F',
    groundCol: '#546E7A', groundDetail: '#607D8B',
    asphaltCol: '#37474F',
    platCol: '#455A64', platTop: '#546E7A', platBot: '#37474F',
  },
  metro: {
    skyTop: '#1A1A2E', skyMid: '#222244', skyBot: '#2D2D55',
    buildCols: ['#33334D','#3D3D5C','#2A2A40'],
    windowOn: '#80DEEA', windowOff: '#33334D',
    groundCol: '#37474F', groundDetail: '#455A64',
    asphaltCol: '#212129',
    platCol: '#3D3D5C', platTop: '#4F4F75', platBot: '#26263A',
  },
  escritorio: {
    skyTop: '#5D4037', skyMid: '#6D4C41', skyBot: '#8D6E63',
    buildCols: ['#A1887F','#8D6E63','#795548','#BCAAA4'],
    windowOn: '#FFF9C4', windowOff: '#6D4C41',
    groundCol: '#BCAAA4', groundDetail: '#A1887F',
    asphaltCol: '#8D6E63',
    platCol: '#A1887F', platTop: '#D7CCC8', platBot: '#6D4C41',
  },
  rh_infernal: {
    skyTop: '#2A0A0A', skyMid: '#4A0E0E', skyBot: '#6B1414',
    buildCols: ['#3D1010','#5A1818','#2A0808'],
    windowOn: '#FF6E40', windowOff: '#3D1010',
    groundCol: '#3D1010', groundDetail: '#5A1818',
    asphaltCol: '#1A0505',
    platCol: '#5A1818', platTop: '#7A2020', platBot: '#2A0808',
  },
};

function currentTheme() {
  return THEMES[LEVELS[currentLevelIndex].theme];
}

// Gera prédios e decorações com semente determinística
let buildings = [];
let bgDecos = [];   // postes, ônibus, etc.

function generateLevel() {
  const levelDef = LEVELS[currentLevelIndex];
  levelWidth = levelDef.width;

  // ─── Plataformas (geradas proceduralmente, com variação por seed) ──
  platforms = [
    { x: 0, y: CONFIG.BASE_H - 32, w: levelWidth, h: 32, type: 'ground' },
  ];

  let s = 1000 + currentLevelIndex * 777; // seed diferente por fase
  function plRnd(min, max) { s = (s * 9301 + 49297) % 233280; return min + Math.floor((s / 233280) * (max - min + 1)); }

  // Plataformas elevadas espalhadas ao longo de toda a fase
  const platStartX = 200;
  const platEndX = levelWidth - 150; // deixa espaço livre antes do fim (ou do boss)
  let px2 = platStartX;
  while (px2 < platEndX) {
    const w = plRnd(60, 100);
    const y = plRnd(130, 195);
    platforms.push({ x: px2, y, w, h: 10, type: 'plat' });
    px2 += w + plRnd(70, 150);
  }

  // Se a fase tem boss, cria uma arena de chão sólido extra no final
  if (levelDef.hasBoss) {
    platforms.push({ x: levelWidth, y: CONFIG.BASE_H - 32, w: 400, h: 32, type: 'ground' });
  }

  // ─── Inimigos ────────────────────────────────────────────
  enemies = [];
  const enemyZoneEnd = levelDef.hasBoss ? levelWidth - 80 : levelWidth - 60;
  const spacing = (enemyZoneEnd - 250) / levelDef.enemyCount;
  for (let i = 0; i < levelDef.enemyCount; i++) {
    const ex = 250 + i * spacing + plRnd(-20, 20);
    // Decide se fica no chão ou em cima de alguma plataforma próxima
    let ey = CONFIG.BASE_H - 56;
    const nearbyPlat = platforms.find(pl => pl.type === 'plat' && Math.abs(pl.x - ex) < 40);
    if (nearbyPlat && plRnd(0, 1) === 1) ey = nearbyPlat.y - 28;
    const fast = (plRnd(0, 100) / 100) < levelDef.fastEnemyChance;
    enemies.push({
      x: ex, y: ey, w: 32, h: 28,
      vx: (fast ? CONFIG.ENEMY_SPEED * CONFIG.ENEMY_FAST_MULT : CONFIG.ENEMY_SPEED),
      vy: 0,
      dir: 1,
      fast,
      dead: false,
      deadTimer: 0,
      animFrame: 0,
      animTimer: 0,
      onGround: false,
    });
  }

  // ─── Boss (só na fase final) ──────────────────────────────
  if (levelDef.hasBoss) {
    boss = {
      x: levelWidth + 90, y: CONFIG.BASE_H - 32 - 80,
      w: 84, h: 80,
      vx: CONFIG.BOSS_SPEED, vy: 0,
      dir: -1,
      hp: CONFIG.BOSS_HP,
      dead: false,
      deadTimer: 0,
      animFrame: 0, animTimer: 0,
      jumpTimer: 0,
      shootTimer: 0,
      onGround: false,
      invincible: 0,
      projectiles: [],
      arenaStart: levelWidth,
      arenaEnd: levelWidth + 400,
    };
  } else {
    boss = { x: -99999, y: 0, w: 0, h: 0, dead: true, deadTimer: 0, hp: 0, invincible: 999999, projectiles: [], arenaStart: 0, arenaEnd: 0 };
  }

  // ─── Coletáveis ──────────────────────────────────────────
  collectibles = [];
  const colTypes = ['moeda', 'moeda', 'cafe', 'holerite', 'moeda'];
  for (let cx = 150; cx < levelWidth - 60; cx += plRnd(110, 180)) {
    const type = colTypes[plRnd(0, colTypes.length - 1)];
    const onPlat = platforms.find(pl => pl.type === 'plat' && Math.abs(pl.x - cx) < 45);
    const cy = onPlat ? onPlat.y - 22 : plRnd(0,1) === 1 ? CONFIG.BASE_H - 50 : plRnd(110, 180);
    collectibles.push({ x: cx, y: cy, w: 14, h: 14, type, collected: false, offset: rnd(0,60) });
  }
  // Munição de maleta — espalhada pela fase, mais concentrada perto do fim
  const briefcaseCount = levelDef.hasBoss ? 5 : 4;
  for (let i = 0; i < briefcaseCount; i++) {
    const cx = (levelWidth / (briefcaseCount + 1)) * (i + 1);
    const onPlat = platforms.find(pl => pl.type === 'plat' && Math.abs(pl.x - cx) < 60);
    const cy = onPlat ? onPlat.y - 22 : CONFIG.BASE_H - 50;
    collectibles.push({ x: cx, y: cy, w: 14, h: 14, type: 'maleta', collected: false, offset: rnd(0,60) });
  }

  // ─── Prédios de fundo ─────────────────────────────────────
  const theme = currentTheme();
  buildings = [];
  let bx = -50;
  while (bx < levelWidth + 100) {
    const bw = plRnd(35, 90);
    const bh = plRnd(60, 180);
    buildings.push({
      x: bx, y: CONFIG.BASE_H - 32 - bh, w: bw, h: bh,
      col: theme.buildCols[plRnd(0, theme.buildCols.length - 1)],
      winCols: plRnd(1, 4),
      winRows: plRnd(2, 6),
    });
    bx += bw + plRnd(2, 20);
  }

  // ─── Decorações do cenário ────────────────────────────────
  bgDecos = [];
  for (let dx = 80; dx < levelWidth; dx += plRnd(100, 200)) {
    bgDecos.push({ x: dx, type: plRnd(0, 3) });
  }
}

// ─── Desenha céu gradiente (varia por tema) ──────────────────
function drawSky() {
  const theme = currentTheme();
  const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.BASE_H - 32);
  grad.addColorStop(0,   theme.skyTop);
  grad.addColorStop(0.5, theme.skyMid);
  grad.addColorStop(1,   theme.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H - 32);

  const themeName = LEVELS[currentLevelIndex].theme;

  if (themeName === 'cidade') {
    // Estrelas e lua
    ctx.fillStyle = '#fff';
    const stars = [[12,8],[50,20],[80,5],[140,15],[200,10],[300,6],[400,18],[430,4],[380,25]];
    for (const [sx,sy] of stars) ctx.fillRect(sx, sy, 1, 1);
    ctx.fillStyle = '#ECEFF1';
    ctx.beginPath();
    ctx.arc(CONFIG.BASE_W - 40, 25, 12, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#C5CAE9';
    ctx.beginPath();
    ctx.arc(CONFIG.BASE_W - 35, 22, 9, 0, Math.PI*2);
    ctx.fill();
  } else if (themeName === 'metro') {
    // Trilhos de luz fluorescente no teto do túnel
    ctx.fillStyle = '#80DEEA';
    for (let lx = 30; lx < CONFIG.BASE_W; lx += 90) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin((frameCount + lx) * 0.05) * 0.15;
      ctx.fillRect(lx, 4, 50, 3);
      ctx.restore();
    }
  } else if (themeName === 'escritorio') {
    // Sol quente entrando pelas janelas (tons quentes)
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FFE0B2';
    ctx.beginPath();
    ctx.arc(CONFIG.BASE_W - 60, 30, 22, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFE0B2';
    ctx.beginPath();
    ctx.arc(CONFIG.BASE_W - 60, 30, 14, 0, Math.PI*2);
    ctx.fill();
  } else if (themeName === 'rh_infernal') {
    // Fumaça vermelha/brasas subindo
    if (frameCount % 4 === 0) {
      spawnParticles(rnd(0, CONFIG.BASE_W) + camera.x, CONFIG.BASE_H - 32, '#FF6E40', 1);
    }
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(frameCount * 0.05) * 0.1;
    ctx.fillStyle = '#FF1744';
    ctx.beginPath();
    ctx.arc(CONFIG.BASE_W/2, 20, 30, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Desenha prédios de fundo (parallax) ─────────────────────
function drawBuildings() {
  const theme = currentTheme();
  for (const b of buildings) {
    const parallax = 0.4;
    const bx = b.x - camera.x * parallax;
    if (bx + b.w < 0 || bx > CONFIG.BASE_W) continue;

    ctx.fillStyle = b.col;
    ctx.fillRect(bx, b.y, b.w, b.h);

    // Janelas
    const winW = Math.max(4, Math.floor((b.w - 8) / b.winCols) - 2);
    const winH = 4;
    for (let r = 0; r < b.winRows; r++) {
      for (let c = 0; c < b.winCols; c++) {
        const wx = bx + 4 + c * ((b.w - 8) / b.winCols);
        const wy = b.y + 6 + r * 12;
        if (wy + winH > b.y + b.h - 4) continue;
        const on = ((b.x + r * 7 + c * 13) % 3 !== 0);
        ctx.fillStyle = on ? theme.windowOn : theme.windowOff;
        ctx.fillRect(wx, wy, winW, winH);
        if (on) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = theme.windowOn;
          ctx.fillRect(wx - 2, wy - 2, winW + 4, winH + 4);
          ctx.restore();
        }
      }
    }

    // Caixa d'água em alguns prédios (só faz sentido em cidade/escritório)
    if (b.w > 60 && (LEVELS[currentLevelIndex].theme === 'cidade' || LEVELS[currentLevelIndex].theme === 'escritorio')) {
      ctx.fillStyle = theme.buildCols[0];
      ctx.fillRect(bx + b.w/2 - 5, b.y - 8, 10, 8);
      ctx.fillStyle = theme.buildCols[1] || theme.buildCols[0];
      ctx.fillRect(bx + b.w/2 - 7, b.y - 5, 14, 3);
    }
  }
}

// ─── Decorações da rua/cenário (parallax médio, varia por tema) ──
function drawStreetDecos() {
  const themeName = LEVELS[currentLevelIndex].theme;
  for (const d of bgDecos) {
    const parallax = 0.7;
    const dx = d.x - camera.x * parallax;
    if (dx < -30 || dx > CONFIG.BASE_W + 30) continue;
    const gy = CONFIG.BASE_H - 32;

    if (themeName === 'cidade') {
      drawDecoCidade(d, dx, gy);
    } else if (themeName === 'metro') {
      drawDecoMetro(d, dx, gy);
    } else if (themeName === 'escritorio') {
      drawDecoEscritorio(d, dx, gy);
    } else if (themeName === 'rh_infernal') {
      drawDecoRhInfernal(d, dx, gy);
    }
  }
}

function drawDecoCidade(d, dx, gy) {
  switch (d.type % 4) {
    case 0: // Poste
      ctx.fillStyle = '#546E7A';
      ctx.fillRect(dx, gy - 50, 3, 50);
      ctx.fillStyle = '#78909C';
      ctx.fillRect(dx - 5, gy - 50, 14, 3);
      ctx.fillStyle = '#FFECB3';
      ctx.beginPath();
      ctx.arc(dx + 1, gy - 50, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,179,0.15)';
      ctx.beginPath();
      ctx.arc(dx + 1, gy - 46, 14, 0, Math.PI*2);
      ctx.fill();
      break;
    case 1: // Ponto de ônibus
      ctx.fillStyle = '#FFD600';
      ctx.fillRect(dx, gy - 35, 25, 3);
      ctx.fillRect(dx, gy - 35, 3, 35);
      ctx.fillStyle = '#B0BEC5';
      ctx.fillRect(dx + 3, gy - 32, 22, 28);
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(dx + 5, gy - 30, 18, 2);
      ctx.fillStyle = '#546E7A';
      ctx.font = '4px Courier New';
      ctx.fillText('ÔNIBUS', dx + 4, gy - 14);
      break;
    case 2: // Lixeira
      ctx.fillStyle = '#37474F';
      ctx.fillRect(dx, gy - 14, 12, 14);
      ctx.fillStyle = '#455A64';
      ctx.fillRect(dx - 1, gy - 15, 14, 3);
      break;
    case 3: // Árvore sem folhas (urbana)
      ctx.fillStyle = '#3E2723';
      ctx.fillRect(dx + 3, gy - 30, 4, 30);
      ctx.fillRect(dx, gy - 28, 10, 3);
      ctx.fillRect(dx + 1, gy - 22, 8, 2);
      break;
  }
}

function drawDecoMetro(d, dx, gy) {
  switch (d.type % 3) {
    case 0: // Coluna estrutural
      ctx.fillStyle = '#2A2A40';
      ctx.fillRect(dx, gy - 60, 10, 60);
      ctx.fillStyle = '#3D3D5C';
      ctx.fillRect(dx, gy - 60, 10, 4);
      break;
    case 1: // Placa de sinalização do metrô
      ctx.fillStyle = '#1565C0';
      ctx.fillRect(dx, gy - 40, 26, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '5px Courier New';
      ctx.fillText('METRÔ', dx + 2, gy - 30);
      ctx.fillStyle = '#455A64';
      ctx.fillRect(dx + 11, gy - 26, 3, 26);
      break;
    case 2: // Catraca/torniquete decorativo
      ctx.fillStyle = '#616161';
      ctx.fillRect(dx, gy - 18, 14, 18);
      ctx.fillStyle = '#9E9E9E';
      ctx.fillRect(dx + 2, gy - 14, 10, 3);
      break;
  }
}

function drawDecoEscritorio(d, dx, gy) {
  switch (d.type % 3) {
    case 0: // Planta de escritório
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(dx + 3, gy - 10, 8, 10);
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(dx, gy - 24, 5, 16);
      ctx.fillRect(dx + 6, gy - 22, 5, 14);
      ctx.fillRect(dx + 3, gy - 28, 5, 18);
      break;
    case 1: // Cooler de água
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(dx, gy - 24, 12, 24);
      ctx.fillStyle = '#4FC3F7';
      ctx.fillRect(dx + 2, gy - 34, 8, 12);
      break;
    case 2: // Pilha de caixas/processos
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(dx, gy - 16, 16, 16);
      ctx.fillStyle = '#D7CCC8';
      ctx.fillRect(dx, gy - 16, 16, 3);
      ctx.fillStyle = '#6D4C41';
      ctx.font = '4px Courier New';
      ctx.fillText('PROC.', dx + 1, gy - 6);
      break;
  }
}

function drawDecoRhInfernal(d, dx, gy) {
  switch (d.type % 3) {
    case 0: // Estaca/espinho do chão
      ctx.fillStyle = '#5A1818';
      ctx.fillRect(dx + 4, gy - 22, 3, 22);
      ctx.fillStyle = '#7A2020';
      ctx.beginPath();
      ctx.moveTo(dx, gy - 22);
      ctx.lineTo(dx + 5, gy - 34);
      ctx.lineTo(dx + 10, gy - 22);
      ctx.closePath();
      ctx.fill();
      break;
    case 1: // Caveira de papelada (humor sombrio leve)
      ctx.fillStyle = '#D7CCC8';
      ctx.fillRect(dx, gy - 12, 10, 8);
      ctx.fillStyle = '#3D1010';
      ctx.fillRect(dx + 2, gy - 10, 2, 2);
      ctx.fillRect(dx + 6, gy - 10, 2, 2);
      break;
    case 2: // Corrente pendurada
      ctx.fillStyle = '#5A1818';
      for (let i = 0; i < 4; i++) ctx.fillRect(dx, gy - 40 + i*9, 3, 5);
      break;
  }
}

// ─── Pessoas de fundo decorativas ────────────────────────────
let bgPeople = [];
function generateBgPeople() {
  bgPeople = [];
  const themeName = LEVELS[currentLevelIndex].theme;
  // Na fase de boss (curta, tensa) não populamos com NPCs decorativos
  if (themeName === 'rh_infernal') return;
  for (let i = 0; i < 8; i++) {
    bgPeople.push({
      x: rnd(100, levelWidth - 200),
      type: rnd(0, 1),
      animTimer: rnd(0, 30),
      animFrame: 0,
    });
  }
}

function drawBgPeople() {
  for (const p of bgPeople) {
    const dx2 = p.x - camera.x * 0.85;
    if (dx2 < -20 || dx2 > CONFIG.BASE_W + 20) continue;
    const gy = CONFIG.BASE_H - 32;
    ctx.save();
    ctx.globalAlpha = 0.5;
    if (p.type === 0) {
      // Passante
      ctx.fillStyle = ['#5D4037','#1565C0','#2E7D32'][p.x % 3];
      ctx.fillRect(dx2, gy - 18, 6, 12);
      ctx.fillStyle = '#F5CBA7';
      ctx.fillRect(dx2 + 1, gy - 24, 4, 6);
    } else {
      // Morador de rua — sentado, com saco
      ctx.fillStyle = '#795548';
      ctx.fillRect(dx2, gy - 10, 10, 10);
      ctx.fillStyle = '#F5CBA7';
      ctx.fillRect(dx2 + 3, gy - 16, 4, 6);
      ctx.fillStyle = '#546E7A';
      ctx.fillRect(dx2 - 4, gy - 6, 5, 6);
    }
    ctx.restore();
  }
}

// ─── Chão e calçada (cores por tema) ──────────────────────────
function drawGround() {
  const theme = currentTheme();
  ctx.fillStyle = theme.groundCol;
  ctx.fillRect(0, CONFIG.BASE_H - 32, CONFIG.BASE_W, 32);
  ctx.fillStyle = theme.groundDetail;
  for (let tx = (-(camera.x % 32)); tx < CONFIG.BASE_W; tx += 32) {
    ctx.fillRect(tx, CONFIG.BASE_H - 32, 31, 2);
  }
  ctx.fillStyle = theme.asphaltCol;
  ctx.fillRect(0, CONFIG.BASE_H - 14, CONFIG.BASE_W, 14);

  // Faixas de pedestre só fazem sentido no tema cidade
  if (LEVELS[currentLevelIndex].theme === 'cidade') {
    ctx.fillStyle = '#eceff1';
    const faixaX = 120 - (camera.x % 200);
    for (let fx = faixaX; fx < CONFIG.BASE_W; fx += 200) {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(fx + i * 8, CONFIG.BASE_H - 12, 5, 12);
      }
    }
  }
  // Trilhos no metrô
  if (LEVELS[currentLevelIndex].theme === 'metro') {
    ctx.fillStyle = '#616161';
    ctx.fillRect(0, CONFIG.BASE_H - 16, CONFIG.BASE_W, 2);
    ctx.fillRect(0, CONFIG.BASE_H - 6, CONFIG.BASE_W, 2);
  }
}

// ─── Plataformas (cor por tema) ───────────────────────────────
function drawPlatforms() {
  const theme = currentTheme();
  for (const pl of platforms) {
    const px3 = pl.x - camera.x;
    if (px3 + pl.w < 0 || px3 > CONFIG.BASE_W) continue;
    if (pl.type === 'ground') continue; // já desenhado
    ctx.fillStyle = theme.platCol;
    ctx.fillRect(px3, pl.y, pl.w, pl.h);
    ctx.fillStyle = theme.platTop;
    ctx.fillRect(px3, pl.y, pl.w, 2);
    ctx.fillStyle = theme.platBot;
    ctx.fillRect(px3, pl.y + pl.h - 2, pl.w, 2);
  }
}


// ─── HUD ─────────────────────────────────────────────────────
function drawHUD() {
  // Pontuação
  pixelText(`PONTOS: ${score}`, 8, 14, 9, '#FFD700');
  // Vidas
  for (let i = 0; i < player.lives; i++) {
    ctx.fillStyle = '#E53935';
    const hx = CONFIG.BASE_W - 20 - i * 16;
    ctx.fillRect(hx, 6, 10, 8);
    ctx.fillRect(hx - 3, 4, 5, 5);
    ctx.fillRect(hx + 8, 4, 5, 5);
  }
  pixelText('VIDA', CONFIG.BASE_W - 20, 16, 6, '#fff', 'right');

  // Munição de maletas
  pixelText('MALETAS:', 8, 28, 7, '#D7B98E');
  for (let i = 0; i < player.briefcaseAmmo; i++) {
    const mx = 62 + i * 13;
    ctx.fillStyle = '#6D4C2A';
    ctx.fillRect(mx, 21, 10, 7);
    ctx.fillStyle = '#8A6238';
    ctx.fillRect(mx, 21, 10, 2);
    ctx.fillStyle = '#5A3D20';
    ctx.fillRect(mx + 4, 21, 2, 7);
  }
  if (player.briefcaseAmmo === 0) {
    pixelText('(vazio)', 62, 27, 6, '#78909C');
  }

  // Indicador de fase atual (centralizado no topo)
  const levelDef = LEVELS[currentLevelIndex];
  pixelText(`FASE ${currentLevelIndex + 1}/${LEVELS.length} — ${levelDef.name}`, CONFIG.BASE_W/2, 14, 7, '#ECEFF1', 'center');
}

// ============================================================
//  TELAS
// ============================================================
function drawTitle() {
  // BG
  ctx.fillStyle = '#0D1B4B';
  ctx.fillRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H);
  // Lua
  ctx.fillStyle = '#C5CAE9';
  ctx.beginPath();
  ctx.arc(CONFIG.BASE_W - 50, 35, 18, 0, Math.PI*2);
  ctx.fill();

  // Prédios simples no fundo
  const titles_b = [[0,80,60,120],[70,100,50,90],[130,60,70,130],[210,90,45,100],[265,70,80,120],[355,85,55,105],[420,65,60,125]];
  for (const [bx,by,bw,bh] of titles_b) {
    ctx.fillStyle = '#1A237E';
    ctx.fillRect(bx,CONFIG.BASE_H-bh,bw,bh);
  }

  // Título
  pixelText('CLT CONTRA', CONFIG.BASE_W/2, 60, 20, '#FFD700', 'center');
  pixelText('AS CARTEIRAS', CONFIG.BASE_W/2, 84, 20, '#FF8A80', 'center');

  // Subtítulo
  pixelText('Um jogo de plataforma satírico', CONFIG.BASE_W/2, 110, 7, '#90CAF9', 'center');
  pixelText(`${LEVELS.length} fases até a batalha final`, CONFIG.BASE_W/2, 124, 7, '#D7B98E', 'center');

  // Piscando
  if (frameCount % 60 < 40) {
    pixelText('Pressione ENTER para começar', CONFIG.BASE_W/2, 145, 8, '#ECEFF1', 'center');
  }

  // Controles
  pixelText('WASD / Setas = mover  |  Espaço/W = pular', CONFIG.BASE_W/2, 165, 6, '#78909C', 'center');
  pixelText('Clique do mouse = arremessar maleta no boss', CONFIG.BASE_W/2, 180, 6, '#D7B98E', 'center');

  // Mini jogador no título
  ctx.save();
  ctx.translate(CONFIG.BASE_W/2 - 16, 200);
  drawPlayerSprite(ctx, 0, 0, 2, Math.floor(frameCount/8)%2, 'walk');
  ctx.restore();
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H);
  pixelText('GAME OVER', CONFIG.BASE_W/2, 100, 22, '#E53935', 'center');
  pixelText(`Pontuação final: ${score}`, CONFIG.BASE_W/2, 130, 9, '#FFD700', 'center');
  if (frameCount % 60 < 40) {
    pixelText('Pressione R para recomeçar', CONFIG.BASE_W/2, 160, 8, '#fff', 'center');
  }
}

function drawLevelComplete() {
  ctx.fillStyle = 'rgba(10,10,30,0.85)';
  ctx.fillRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H);

  const completedLevel = LEVELS[currentLevelIndex];
  const nextLevel = LEVELS[currentLevelIndex + 1];

  pixelText('FASE CONCLUÍDA!', CONFIG.BASE_W/2, 75, 18, '#FFD700', 'center');
  pixelText(completedLevel.name, CONFIG.BASE_W/2, 98, 9, '#90CAF9', 'center');
  pixelText(`Pontuação: ${score}`, CONFIG.BASE_W/2, 122, 10, '#FFCC02', 'center');

  if (nextLevel) {
    pixelText(`Próxima fase: ${nextLevel.name}`, CONFIG.BASE_W/2, 148, 8, '#D7B98E', 'center');
  }

  if (frameCount % 60 < 40) {
    pixelText('Pressione ENTER para continuar', CONFIG.BASE_W/2, 175, 8, '#ECEFF1', 'center');
  }

  // Estrelas decorativas
  for (let i = 0; i < 3; i++) {
    const starX = CONFIG.BASE_W/2 - 40 + i * 40;
    ctx.fillStyle = '#FFD700';
    drawStar(starX, 50, 8);
  }
}

function drawWin() {
  ctx.fillStyle = 'rgba(0,20,60,0.85)';
  ctx.fillRect(0, 0, CONFIG.BASE_W, CONFIG.BASE_H);
  pixelText('VOCÊ VENCEU!', CONFIG.BASE_W/2, 85, 20, '#FFD700', 'center');
  pixelText('As carteiras foram derrotadas!', CONFIG.BASE_W/2, 110, 8, '#81D4FA', 'center');
  pixelText(`Pontuação: ${score}`, CONFIG.BASE_W/2, 130, 10, '#FFCC02', 'center');
  if (frameCount % 60 < 40) {
    pixelText('Pressione R para jogar novamente', CONFIG.BASE_W/2, 158, 7, '#fff', 'center');
  }
  // Estrelas
  for (let i = 0; i < 3; i++) {
    const starX = CONFIG.BASE_W/2 - 40 + i * 40;
    ctx.fillStyle = '#FFD700';
    drawStar(starX, 64, 10);
  }
}

function drawStar(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const angle2 = ((i * 4 + 2) * Math.PI / 5) - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    ctx.lineTo(x + (r*0.4) * Math.cos(angle2), y + (r*0.4) * Math.sin(angle2));
  }
  ctx.closePath();
  ctx.fill();
}

// ============================================================
//  FÍSICA E COLISÃO
// ============================================================
function resolveEntityPlatform(entity) {
  entity.vy += CONFIG.GRAVITY;
  entity.x += entity.vx || 0;
  entity.y += entity.vy;
  entity.onGround = false;

  for (const pl of platforms) {
    if (!rectOverlap(entity, pl)) continue;
    const overlapLeft   = (entity.x + entity.w) - pl.x;
    const overlapRight  = (pl.x + pl.w) - entity.x;
    const overlapTop    = (entity.y + entity.h) - pl.y;
    const overlapBottom = (pl.y + pl.h) - entity.y;
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapTop && entity.vy >= 0) {
      entity.y = pl.y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    } else if (minOverlap === overlapBottom && entity.vy < 0) {
      entity.y = pl.y + pl.h;
      entity.vy = 0;
    } else if (minOverlap === overlapLeft) {
      entity.x = pl.x - entity.w;
    } else if (minOverlap === overlapRight) {
      entity.x = pl.x + pl.w;
    }
  }
}

// ============================================================
//  JOGADOR
// ============================================================
function initPlayer() {
  player = {
    x: 50, y: CONFIG.BASE_H - 32 - 50,
    w: 32, h: 48,
    vx: 0, vy: 0,
    dir: 1,
    lives: CONFIG.PLAYER_LIVES,
    onGround: false,
    state: 'idle',
    animFrame: 0,
    animTimer: 0,
    invincible: 0,
    dead: false,
    briefcaseAmmo: CONFIG.BRIEFCASE_START_AMMO,
    throwCooldown: 0,
  };
  playerBriefcases = [];
}

function updatePlayer() {
  if (player.dead) return;

  // Input horizontal
  const moveLeft  = keys.left;
  const moveRight = keys.right;
  const jump      = keys.up;

  if (moveLeft)  { player.vx = -CONFIG.PLAYER_SPEED; player.dir = -1; }
  else if (moveRight) { player.vx =  CONFIG.PLAYER_SPEED; player.dir =  1; }
  else { player.vx = 0; }

  if (jump && player.onGround) {
    player.vy = CONFIG.PLAYER_JUMP;
    player.onGround = false;
  }

  // Estado de animação
  if (!player.onGround) player.state = 'jump';
  else if (player.vx !== 0) player.state = 'walk';
  else player.state = 'idle';

  // Animar
  player.animTimer++;
  if (player.animTimer >= 8) { player.animTimer = 0; player.animFrame = (player.animFrame + 1) % 4; }

  // Invencibilidade
  if (player.invincible > 0) player.invincible--;

  // Arremesso de maleta
  if (player.throwCooldown > 0) player.throwCooldown--;
  if (throwInput.pressed && player.throwCooldown === 0 && player.briefcaseAmmo > 0) {
    throwBriefcase();
    player.throwCooldown = CONFIG.BRIEFCASE_COOLDOWN;
  }

  // Física
  resolveEntityPlatform(player);

  // Limitar aos limites da fase (em fases com boss, a arena continua além
  // de levelWidth, então o limite direito é o fim da arena do boss)
  const hasBoss = LEVELS[currentLevelIndex].hasBoss;
  if (player.x < 0) player.x = 0;
  const rightLimit = hasBoss ? boss.arenaEnd : levelWidth;
  if (player.x + player.w > rightLimit) player.x = rightLimit - player.w;

  // Fim de fase sem boss: chegar ao limite direito completa a fase
  if (!hasBoss && player.x + player.w >= levelWidth - 2 && player.onGround) {
    completeLevel();
  }

  // Caiu no buraco
  if (player.y > CONFIG.BASE_H + 50) {
    playerHit();
  }
}

// ─── Avança para a próxima fase (ou finaliza, se não houver mais) ──
function completeLevel() {
  if (gameState !== 'playing') return;
  gameState = 'levelcomplete';
  score += 300; // bônus por completar a fase
}

// ─── Arremesso de maleta ──────────────────────────────────────
function throwBriefcase() {
  player.briefcaseAmmo--;
  playerBriefcases.push({
    x: player.x + (player.dir === 1 ? player.w : -8),
    y: player.y + player.h * 0.35,
    w: 14, h: 12,
    vx: CONFIG.BRIEFCASE_SPEED * player.dir,
    vy: -2,        // pequeno impulso pra cima, depois a gravidade age
    rot: 0,
    dir: player.dir,
    spent: false,  // true assim que acerta algo, vira coletável no chão de novo
  });
  spawnParticles(player.x + player.w/2, player.y + player.h*0.4, '#8A6238', 4);
}

function updatePlayerBriefcases() {
  for (let i = playerBriefcases.length - 1; i >= 0; i--) {
    const b = playerBriefcases[i];

    if (b.spent) {
      // Já acertou algo — descansa no chão um instante antes de sumir
      b.life = (b.life ?? 40) - 1;
      if (b.life <= 0) playerBriefcases.splice(i, 1);
      continue;
    }

    b.vy += CONFIG.GRAVITY * 0.6;
    b.x += b.vx;
    b.y += b.vy;
    b.rot += 0.3 * b.dir;

    // Colide com plataformas/chão — quica uma vez, depois fica inerte
    let landed = false;
    for (const pl of platforms) {
      if (rectOverlap(b, pl) && b.vy >= 0 && b.y + b.h - pl.y < 10) {
        b.y = pl.y - b.h;
        landed = true;
        break;
      }
    }
    if (landed) {
      b.spent = true;
      b.life = 40;
      continue;
    }

    // Saiu da fase ou caiu no buraco
    const worldEnd = LEVELS[currentLevelIndex].hasBoss ? boss.arenaEnd : levelWidth;
    if (b.x < -20 || b.x > worldEnd + 20 || b.y > CONFIG.BASE_H + 50) {
      playerBriefcases.splice(i, 1);
      continue;
    }

    // Colisão com o boss
    if (!boss.dead && boss.invincible === 0 && rectOverlap(b, boss)) {
      boss.hp -= CONFIG.BRIEFCASE_DAMAGE;
      boss.invincible = 40;
      score += 150;
      spawnParticles(b.x + b.w/2, b.y + b.h/2, '#FFD700', 10);
      spawnParticles(b.x + b.w/2, b.y + b.h/2, '#8A6238', 6);
      playerBriefcases.splice(i, 1);
      if (boss.hp <= 0) {
        boss.dead = true;
        boss.deadTimer = 120;
        spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#FF1744', 20);
      }
      continue;
    }

    // Colisão com inimigos comuns (bônus: maleta também derrota carteiras)
    for (const e of enemies) {
      if (e.dead) continue;
      if (rectOverlap(b, e)) {
        killEnemy(e);
        score += 100;
        playerBriefcases.splice(i, 1);
        break;
      }
    }
  }
}

function playerHit() {
  if (player.invincible > 0) return;
  player.lives--;
  player.invincible = 90;
  spawnParticles(player.x + player.w/2, player.y + player.h/2, '#E53935', 10);
  if (player.lives <= 0) {
    gameState = 'gameover';
  } else {
    player.x = Math.max(50, camera.x);
    player.y = CONFIG.BASE_H - 32 - 50;
    player.vy = 0;
  }
}

// ============================================================
//  CÂMERA
// ============================================================
function updateCamera() {
  const targetX = player.x - CONFIG.BASE_W / 2 + player.w/2 + (player.dir * CONFIG.CAM_LOOKAHEAD);
  camera.x += (targetX - camera.x) * 0.1;
  const hasBoss = LEVELS[currentLevelIndex].hasBoss;
  const worldEnd = hasBoss ? boss.arenaEnd : levelWidth;
  camera.x = Math.max(0, Math.min(camera.x, worldEnd - CONFIG.BASE_W));
}

// ============================================================
//  INIMIGOS
// ============================================================
function updateEnemies() {
  for (const e of enemies) {
    if (e.dead) {
      e.deadTimer--;
      if (e.deadTimer <= 0) e.dead = 'remove';
      continue;
    }

    // Patrolling
    e.vx = e.dir * (e.fast ? CONFIG.ENEMY_SPEED * CONFIG.ENEMY_FAST_MULT : CONFIG.ENEMY_SPEED);
    resolveEntityPlatform(e);

    // Inverter direção nas bordas
    if (e.onGround) {
      // Verifica borda à frente
      const frontX = e.dir === 1 ? e.x + e.w + 1 : e.x - 1;
      let hasGround = false;
      for (const pl of platforms) {
        if (frontX >= pl.x && frontX <= pl.x + pl.w &&
            e.y + e.h >= pl.y && e.y + e.h <= pl.y + 4) {
          hasGround = true; break;
        }
      }
      if (!hasGround) e.dir *= -1;
    }

    // Limitar aos limites
    if (e.x < 0) { e.x = 0; e.dir = 1; }
    if (e.x + e.w > levelWidth) { e.x = levelWidth - e.w; e.dir = -1; }

    // Animar
    e.animTimer++;
    if (e.animTimer >= 10) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 4; }

    // Colisão com jogador
    if (player.invincible === 0 && rectOverlap(player, e)) {
      // Pulo em cima
      if (player.vy > 0 && player.y + player.h < e.y + e.h * 0.5) {
        killEnemy(e);
        player.vy = CONFIG.PLAYER_JUMP * 0.7;
        score += 100;
      } else {
        playerHit();
      }
    }
  }

  // Remover mortos
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead === 'remove') enemies.splice(i, 1);
  }
}

function killEnemy(e) {
  e.dead = true;
  e.deadTimer = 20;
  spawnParticles(e.x + e.w/2, e.y + e.h/2, '#1565C0', 12);
  spawnParticles(e.x + e.w/2, e.y + e.h/2, '#FFD700', 6);
}

// ─── Desenha inimigo morrendo ────────────────────────────────
function drawDeadEnemy(e) {
  if (!e.dead || e.dead === 'remove') return;
  const t = 1 - e.deadTimer / 20;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.translate(e.x - camera.x + e.w/2, e.y + e.h/2);
  ctx.scale(1 + t * 0.5, 1 + t * 0.5);
  ctx.translate(-e.w/2, -e.h/2);
  drawWalletSprite(ctx, 0, 0, 2, 0, e.fast);
  ctx.restore();
}

// ============================================================
//  BOSS
// ============================================================
function updateBoss() {
  // Fases sem boss não têm lógica de boss nenhuma
  if (!LEVELS[currentLevelIndex].hasBoss) return;

  if (boss.dead) {
    boss.deadTimer--;
    if (boss.deadTimer <= 0) {
      gameState = 'win';
      score += 1000;
    }
    // Partículas de explosão
    if (frameCount % 3 === 0) {
      spawnParticles(
        boss.x + rnd(0, boss.w),
        boss.y + rnd(0, boss.h),
        ['#FF1744','#FFD600','#FF6D00','#E040FB'][rnd(0,3)],
        5
      );
    }
    return;
  }

  // Só ativa quando câmera chega perto
  if (boss.x - camera.x > CONFIG.BASE_W + 50) return;

  if (boss.invincible > 0) boss.invincible--;

  // Movimento
  boss.vx = boss.dir * CONFIG.BOSS_SPEED;
  resolveEntityPlatform(boss);

  // Inverter nas bordas da arena do boss
  if (boss.x < boss.arenaStart) { boss.dir = 1; }
  if (boss.x + boss.w > boss.arenaEnd) { boss.dir = -1; }

  // Pulo aleatório
  boss.jumpTimer++;
  if (boss.jumpTimer > 120 && boss.onGround) {
    boss.vy = CONFIG.BOSS_JUMP_FORCE;
    boss.jumpTimer = 0;
  }

  // Atirar projéteis
  boss.shootTimer++;
  const shootInterval = boss.hp <= CONFIG.BOSS_HP / 2 ? 80 : 140;
  if (boss.shootTimer > shootInterval) {
    boss.shootTimer = 0;
    boss.projectiles.push({
      x: boss.x + boss.w / 2,
      y: boss.y + boss.h / 2,
      w: 12, h: 10,
      vx: (player.x < boss.x ? -3 : 3),
      vy: -2,
      life: 120,
    });
  }

  // Projéteis
  for (let i = boss.projectiles.length - 1; i >= 0; i--) {
    const pr = boss.projectiles[i];
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.vy += 0.1;
    pr.life--;

    if (pr.life <= 0 || pr.y > CONFIG.BASE_H) {
      boss.projectiles.splice(i, 1);
      continue;
    }

    // Colisão com jogador
    if (player.invincible === 0 && rectOverlap(player, pr)) {
      playerHit();
      boss.projectiles.splice(i, 1);
    }
  }

  // Colisão jogador com boss
  if (player.invincible === 0 && boss.invincible === 0 && rectOverlap(player, boss)) {
    if (player.vy > 0 && player.y + player.h < boss.y + boss.h * 0.4) {
      // Pulo em cima do boss
      boss.hp--;
      boss.invincible = 60;
      player.vy = CONFIG.PLAYER_JUMP * 0.8;
      score += 200;
      spawnParticles(boss.x + boss.w/2, boss.y, '#FFD700', 10);
      if (boss.hp <= 0) {
        boss.dead = true;
        boss.deadTimer = 120;
        spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#FF1744', 20);
      }
    } else {
      playerHit();
    }
  }

  // Animar
  boss.animTimer++;
  if (boss.animTimer >= 6) { boss.animTimer = 0; boss.animFrame = (boss.animFrame + 1) % 8; }
}

// ============================================================
//  COLETÁVEIS
// ============================================================
function updateCollectibles() {
  for (const c of collectibles) {
    if (c.collected) continue;
    if (rectOverlap(player, c)) {
      c.collected = true;
      switch (c.type) {
        case 'moeda':    score += 50;  break;
        case 'cafe':     score += 75;  player.invincible = Math.max(player.invincible, 30); break;
        case 'holerite': score += 150; break;
        case 'maleta':
          player.briefcaseAmmo = Math.min(CONFIG.BRIEFCASE_MAX_AMMO, player.briefcaseAmmo + 1);
          break;
      }
      const particleColor = c.type === 'maleta' ? '#8A6238' : '#FFD700';
      spawnParticles(c.x + c.w/2, c.y + c.h/2, particleColor, 8);
    }
  }
}

// ============================================================
//  LOOP PRINCIPAL
// ============================================================
function update() {
  if (gameState !== 'playing') return;
  frameCount++;

  updatePlayer();
  updateCamera();
  updateEnemies();
  updateBoss();
  updatePlayerBriefcases();
  updateCollectibles();
  updateParticles();
}

function draw() {
  clearTextCanvas();

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  if (gameState === 'title') {
    drawTitle();
    ctx.restore();
    return;
  }

  if (gameState === 'gameover') {
    // Desenha cena pausada atrás
    drawScene();
    drawGameOver();
    ctx.restore();
    return;
  }

  if (gameState === 'win') {
    drawScene();
    drawWin();
    ctx.restore();
    return;
  }

  if (gameState === 'levelcomplete') {
    drawScene();
    drawLevelComplete();
    ctx.restore();
    return;
  }

  drawScene();
  ctx.restore();
}

function drawScene() {
  drawSky();
  drawBuildings();
  drawStreetDecos();
  drawBgPeople();
  drawGround();
  drawPlatforms();

  // Coletáveis
  for (const c of collectibles) drawCollectible(c);

  // Inimigos
  for (const e of enemies) {
    if (e.dead === true) drawDeadEnemy(e);
    else drawEnemy(e);
  }

  // Boss
  if (!boss.dead) {
    drawBoss(boss);
    for (const pr of boss.projectiles) drawProjectile(pr);
  } else if (boss.deadTimer > 0) {
    // Explosão
    ctx.save();
    ctx.globalAlpha = boss.deadTimer / 120;
    drawBoss(boss);
    ctx.restore();
  }

  // Maletas arremessadas pelo jogador
  for (const b of playerBriefcases) drawPlayerBriefcase(b);

  // Jogador (pisca quando invencível)
  if (player.invincible === 0 || Math.floor(frameCount / 6) % 2 === 0) {
    drawPlayer(player);
  }

  drawParticles();
  drawHUD();

  // Indicador de Boss próximo (só na fase com boss)
  if (LEVELS[currentLevelIndex].hasBoss && boss.x - camera.x < CONFIG.BASE_W + 200 && boss.x - camera.x > CONFIG.BASE_W - 10 && !boss.dead) {
    if (frameCount % 40 < 25) {
      pixelText('⚠ BOSS À FRENTE!', CONFIG.BASE_W/2, 36, 9, '#FF1744', 'center');
    }
  }
}

function gameLoop() {
  // Quando .force-landscape está ativo, o container foi rotacionado 90°
  // via CSS, então o espaço "deitado" disponível para o canvas é
  // innerHeight × innerWidth (largura e altura trocadas em relação à
  // viewport real, que continua em retrato).
  const rotated = document.body.classList.contains('force-landscape');
  const availW = rotated ? window.innerHeight : window.innerWidth;
  const availH = rotated ? window.innerWidth  : window.innerHeight;

  const scale = Math.min(
    availW / CONFIG.BASE_W,
    (availH - (isTouchDevice() ? 160 : 0)) / CONFIG.BASE_H
  );
  const cssW = Math.floor(CONFIG.BASE_W * scale);
  const cssH = Math.floor(CONFIG.BASE_H * scale);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  syncTextCanvas(cssW, cssH);

  update();
  draw();
  frameCount++;
  requestAnimationFrame(gameLoop);
}

// Mantém o textCanvas do mesmo tamanho/posição do gameCanvas, renderizado
// na resolução real do dispositivo (devicePixelRatio) para texto nítido,
// mesmo com o jogo de pixel art rodando numa resolução interna baixa.
let lastTextCanvasCssW = 0, lastTextCanvasCssH = 0;
function syncTextCanvas(cssW, cssH) {
  textCanvas.style.width  = cssW + 'px';
  textCanvas.style.height = cssH + 'px';

  if (cssW === lastTextCanvasCssW && cssH === lastTextCanvasCssH) return;
  lastTextCanvasCssW = cssW;
  lastTextCanvasCssH = cssH;

  const dpr = window.devicePixelRatio || 1;
  textCanvas.width  = Math.round(cssW * dpr);
  textCanvas.height = Math.round(cssH * dpr);

  // Escala o contexto para que coordenadas continuem no espaço lógico
  // BASE_W × BASE_H (o mesmo sistema de coordenadas do canvas de pixel art).
  const sx = (cssW * dpr) / CONFIG.BASE_W;
  const sy = (cssH * dpr) / CONFIG.BASE_H;
  tctx.setTransform(sx, 0, 0, sy, 0, 0);
}

// ============================================================
//  INPUT — TECLADO
// ============================================================
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':  case 'a': case 'A': keys.left  = true;  break;
    case 'ArrowRight': case 'd': case 'D': keys.right = true;  break;
    case 'ArrowUp':    case 'w': case 'W': case ' ':  keys.up = true; break;
    case 'Enter':
      if (gameState === 'title') startGame();
      else if (gameState === 'levelcomplete') startNextLevel();
      break;
    case 'r': case 'R':
      if (gameState === 'gameover' || gameState === 'win') startGame();
      break;
  }
  // Evita scroll da página com espaço/setas
  if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'ArrowLeft':  case 'a': case 'A': keys.left  = false; break;
    case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
    case 'ArrowUp':    case 'w': case 'W': case ' ':  keys.up = false; break;
  }
});

// ============================================================
//  INPUT — ARREMESSO DE MALETA (clique do mouse)
// ============================================================
// Clique simples = um arremesso (respeitando o cooldown). Usamos
// mousedown/mouseup para também dar suporte a "segurar e soltar" sem
// disparar uma rajada contínua a cada frame.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // só botão esquerdo
  throwInput.pressed = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  throwInput.pressed = false;
});
// Evita que o menu de contexto do botão direito atrapalhe.
document.addEventListener('contextmenu', (e) => {
  if (e.target && e.target.id === 'gameCanvas') e.preventDefault();
});

// ============================================================
//  INPUT — MOBILE JOYSTICK
// ============================================================
function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// ============================================================
//  ORIENTAÇÃO — força landscape em mobile via rotação CSS
// ============================================================
// A Screen Orientation API (screen.orientation.lock) só funciona em
// fullscreen e não tem suporte no Safari/iOS, então a forma confiável
// de "deitar" o jogo em qualquer navegador é girar o container via CSS
// quando detectamos um celular em retrato (altura > largura).
function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function updateOrientation() {
  if (!isTouchDevice()) return;
  const shouldRotate = isPortrait();
  document.body.classList.toggle('force-landscape', shouldRotate);

  const gc = document.getElementById('game-container');
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (shouldRotate) {
    // O body é fixado no tamanho real da viewport em px (não vh/vw, que
    // variam com a barra de endereço do navegador mobile). O container
    // do jogo recebe largura/altura TROCADAS (já que vai ficar deitado)
    // e é rotacionado 90°. Como o body continua centralizando via flex
    // e agora tem certeza do próprio tamanho, o container rotacionado
    // fica perfeitamente centralizado e do tamanho certo.
    document.body.style.width  = w + 'px';
    document.body.style.height = h + 'px';
    gc.style.width  = h + 'px';
    gc.style.height = w + 'px';
    gc.style.transform = 'rotate(90deg)';
  } else {
    document.body.style.width  = '';
    document.body.style.height = '';
    gc.style.width  = '';
    gc.style.height = '';
    gc.style.transform = '';
  }

  // Tenta também a API nativa quando disponível (PWA instalado, alguns
  // Android/Chrome em fullscreen) — silenciosamente ignora se falhar,
  // já que a rotação CSS acima já resolve o caso geral.
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

function setupOrientationHandling() {
  if (!isTouchDevice()) return;
  updateOrientation();
  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', () => {
    // Alguns navegadores mobile reportam innerWidth/innerHeight
    // desatualizados no instante exato do evento, antes do reflow
    // terminar — recalcula imediatamente e de novo após um pequeno
    // delay para garantir que pega as dimensões finais corretas.
    updateOrientation();
    setTimeout(updateOrientation, 150);
  });
}

function setupMobileControls() {
  if (!isTouchDevice()) return;
  document.getElementById('mobile-controls').style.display = 'block';

  const joystickBase  = document.getElementById('joystick-base');
  const joystickStick = document.getElementById('joystick-stick');
  const btnJump       = document.getElementById('btn-jump');
  const zone          = document.getElementById('joystick-zone');

  const DEAD_ZONE = 12;
  const MAX_DIST  = 38;

  // ─── Joystick ───────────────────────────────────────────
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = joystickBase.getBoundingClientRect();
    joystick.active = true;
    joystick.id = t.identifier;
    joystick.startX = rect.left + rect.width  / 2;
    joystick.startY = rect.top  + rect.height / 2;
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.id) continue;
      // Vetor de arrasto em coordenadas REAIS da tela (não rotacionadas).
      // O stick visual sempre usa esse vetor cru, pois ele está DENTRO
      // do elemento já rotacionado pelo CSS e acompanha o dedo naturalmente.
      const rawDx = t.clientX - joystick.startX;
      const rawDy = t.clientY - joystick.startY;
      const rawDist = Math.sqrt(rawDx*rawDx + rawDy*rawDy);
      const rawClampedX = (rawDist > MAX_DIST) ? (rawDx / rawDist) * MAX_DIST : rawDx;
      const rawClampedY = (rawDist > MAX_DIST) ? (rawDy / rawDist) * MAX_DIST : rawDy;
      joystickStick.style.transform = `translate(calc(-50% + ${rawClampedX}px), calc(-50% + ${rawClampedY}px))`;

      // Para a LÓGICA do jogo (esquerda/direita), o vetor precisa ser
      // convertido do sistema de coordenadas real da tela para o sistema
      // visual do jogo rotacionado (rotate(90deg) horário no CSS): a
      // transformação inversa de -90° leva (dx,dy) -> (dy,-dx). Ou seja,
      // arrastar o dedo "para baixo" na tela física move o personagem
      // para a direita no jogo, e "para cima" move para a esquerda.
      let dx = rawDx, dy = rawDy;
      if (document.body.classList.contains('force-landscape')) {
        dx =  rawDy;
        dy = -rawDx;
      }

      joystick.dx = dx;
      keys.left  = dx < -DEAD_ZONE;
      keys.right = dx >  DEAD_ZONE;
    }
  }, { passive: false });

  const endJoystick = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.id) continue;
      joystick.active = false;
      joystick.dx = 0;
      keys.left  = false;
      keys.right = false;
      joystickStick.style.transform = 'translate(-50%, -50%)';
    }
  };
  zone.addEventListener('touchend',    endJoystick, { passive: false });
  zone.addEventListener('touchcancel', endJoystick, { passive: false });

  // ─── Botão pulo ────────────────────────────────────────
  btnJump.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.up = true;
  }, { passive: false });

  btnJump.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys.up = false;
  }, { passive: false });

  btnJump.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    keys.up = false;
  }, { passive: false });

  // ─── Botão de arremesso de maleta ───────────────────────
  const btnThrow = document.getElementById('btn-throw');
  btnThrow.addEventListener('touchstart', (e) => {
    e.preventDefault();
    throwInput.pressed = true;
  }, { passive: false });

  btnThrow.addEventListener('touchend', (e) => {
    e.preventDefault();
    throwInput.pressed = false;
  }, { passive: false });

  btnThrow.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    throwInput.pressed = false;
  }, { passive: false });

  // Toque na tela de título para começar
  canvas.addEventListener('touchstart', (e) => {
    if (gameState === 'title') { e.preventDefault(); startGame(); }
    if (gameState === 'gameover' || gameState === 'win') { e.preventDefault(); startGame(); }
    if (gameState === 'levelcomplete') { e.preventDefault(); startNextLevel(); }
  }, { passive: false });
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
function startGame() {
  gameState        = 'playing';
  score            = 0;
  frameCount       = 0;
  particles        = [];
  currentLevelIndex = 0;
  generateLevel();
  generateBgPeople();
  initPlayer();
  camera.x    = 0;
}

// Avança para a próxima fase mantendo pontuação, vidas e munição de maleta.
// Se não houver próxima fase, isso não deveria ser chamado (a última fase
// termina com a derrota do boss, que leva direto a 'win').
function startNextLevel() {
  currentLevelIndex++;
  if (currentLevelIndex >= LEVELS.length) {
    // segurança: não deveria acontecer, mas evita travar o jogo
    gameState = 'win';
    return;
  }
  gameState  = 'playing';
  frameCount = 0;
  particles  = [];
  const keepLives  = player.lives;
  const keepAmmo   = player.briefcaseAmmo;
  generateLevel();
  generateBgPeople();
  initPlayer();
  player.lives        = keepLives;
  player.briefcaseAmmo = keepAmmo;
  camera.x = 0;
}

function init() {
  canvas = document.getElementById('gameCanvas');
  ctx    = canvas.getContext('2d');

  canvas.width  = CONFIG.BASE_W;
  canvas.height = CONFIG.BASE_H;

  textCanvas = document.getElementById('textCanvas');
  tctx       = textCanvas.getContext('2d');

  setupOrientationHandling();
  setupMobileControls();
  gameLoop();
}

window.addEventListener('load', init);
