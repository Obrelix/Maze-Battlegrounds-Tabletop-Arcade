import { CONFIG, BITMAP_FONT, DIGIT_MAP, TIMING, COLORS, DIFFICULTIES, GAME } from './config.js';
import { STATE, suddenDeathIsActive } from './state.js';
import { gridIndex } from './grid.js';

const canvas = document.getElementById('ledMatrix');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');
let isBgRendered = false;

function drawLED(lx, ly, color) {
    // 1. FORCE GRID ALIGNMENT
    // We round the coordinates to the nearest whole number (Integer).
    // This ensures we never draw in the "void" between LEDs.
    const gridX = Math.round(lx);
    const gridY = Math.round(ly);

    // 2. Calculate Screen Pixel Position
    const cx = (gridX * CONFIG.PITCH) + (CONFIG.PITCH / 2);
    const cy = (gridY * CONFIG.PITCH) + (CONFIG.PITCH / 2);

    // 3. Draw
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, CONFIG.LED_RADIUS, 0, Math.PI * 2);
    ctx.fill();
}

function drawText(str, x, y, color) {
    str = str.toUpperCase();
    let cx = x;
    for (let i = 0; i < str.length; i++) {
        let map = BITMAP_FONT[str[i]];
        if (map) {
            if (str[i] === '←' || str[i] === '→') {
                for (let p = 0; p < 25; p++) {
                    if (map[p]) drawLED(cx + (p % 5), y + Math.floor(p / 5), color);
                }
                cx += 6;
            } else if (str[i] === ' ') {
                cx += 3;
            } else {
                for (let p = 0; p < 15; p++) {
                    if (map[p]) drawLED(cx + (p % 3), y + Math.floor(p / 3), color);
                }
                cx += 4;
            }
        }
    }
}

function drawDigit(x, y, num, color, rotateDeg) {
    const map = DIGIT_MAP[num];
    for (let i = 0; i < 15; i++) {
        if (map[i]) {
            let c = i % 3;
            let r = Math.floor(i / 3);
            let dx, dy;
            if (rotateDeg === -90) {
                dx = r;
                dy = (2 - c);
            } else if (rotateDeg === 90) {
                dx = (4 - r);
                dy = c;
            } else {
                dx = c;
                dy = r;
            }
            drawLED(x + dx, y + dy, color);
        }
    }
}

function drawChar(x, y, char, color, rotateDeg) {
    const map = BITMAP_FONT[char.toUpperCase()];
    for (let i = 0; i < 15; i++) {
        if (map[i]) {
            let c = i % 3;
            let r = Math.floor(i / 3);
            let dx, dy;
            if (rotateDeg === -90) {
                dx = r;
                dy = (2 - c);
            } else if (rotateDeg === 90) {
                dx = (4 - r);
                dy = c;
            } else {
                dx = c;
                dy = r;
            }
            drawLED(x + dx, y + dy, color);
        }
    }
}

function drawPlayerBody(x, y, color) {
    drawLED(Math.floor(x), Math.floor(y), color);
    drawLED(Math.floor(x) + 1, Math.floor(y), color);
    drawLED(Math.floor(x), Math.floor(y) + 1, color);
    drawLED(Math.floor(x) + 1, Math.floor(y) + 1, color);
}

function renderHUD(wallColor) {
    // This ensures the HUD doesn't shake with the world
    ctx.restore();
    let p1 = STATE.players[0],
        p2 = STATE.players[1],
        s = Math.ceil(STATE.gameTime / 60).toString().padStart(3, '0');
    if (p1.name) {
        drawChar(0, 0, p1.name[0], p1.color, 90);
        drawChar(0, 4, p1.name[1], p1.color, 90);
        drawChar(0, 8, p1.name[2], p1.color, 90);
    }
    drawDigit(0, 13, p1.minesLeft, `hsl(${p1.minesLeft / 4 * 120},100%,50%)`, 90);
    for (let h = 0; h < Math.floor(p1.boostEnergy / CONFIG.MAX_ENERGY * 26); h++)
        for (let w = 0; w < 5; w++) drawLED(w, 17 + h, `hsl(${p1.boostEnergy / CONFIG.MAX_ENERGY * 120},100%,50%)`);

    drawDigit(0, 44, parseInt(s[0]), wallColor, 90);
    drawDigit(0, 48, parseInt(s[1]), wallColor, 90);
    drawDigit(0, 52, parseInt(s[2]), wallColor, 90);
    drawDigit(0, 57, parseInt(p1.score.toString().padStart(2, '0')[0]), p1.color, 90);
    drawDigit(0, 61, parseInt(p1.score.toString().padStart(2, '0')[1]), p1.color, 90);

    let rx = 123;
    if (p2.name) {
        drawChar(rx, 61, p2.name[0], p2.color, -90);
        drawChar(rx, 57, p2.name[1], p2.color, -90);
        drawChar(rx, 53, p2.name[2], p2.color, -90);
    }
    drawDigit(rx, 48, p2.minesLeft, `hsl(${p2.minesLeft / 4 * 120},100%,50%)`, -90);
    for (let h = 0; h < Math.floor(p2.boostEnergy / CONFIG.MAX_ENERGY * 26); h++)
        for (let w = 0; w < 5; w++) drawLED(rx + w, 46 - h, `hsl(${p2.boostEnergy / CONFIG.MAX_ENERGY * 120},100%,50%)`);

    drawDigit(rx, 17, parseInt(s[0]), wallColor, -90);
    drawDigit(rx, 13, parseInt(s[1]), wallColor, -90);
    drawDigit(rx, 9, parseInt(s[2]), wallColor, -90);
    drawDigit(rx, 4, parseInt(p2.score.toString().padStart(2, '0')[0]), p2.color, -90);
    drawDigit(rx, 0, parseInt(p2.score.toString().padStart(2, '0')[1]), p2.color, -90);
}

export function preRenderBackground() {
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;

    // Fill black background
    bgCtx.fillStyle = '#000';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    // Draw the faint #222 LEDs once
    for (let y = 0; y < CONFIG.LOGICAL_H; y++) {
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) {
            // We inline the drawLED logic here for the offscreen context
            const cx = (x * CONFIG.PITCH) + (CONFIG.PITCH / 2);
            const cy = (y * CONFIG.PITCH) + (CONFIG.PITCH / 2);
            bgCtx.fillStyle = '#222';
            bgCtx.beginPath();
            bgCtx.arc(cx, cy, CONFIG.LED_RADIUS, 0, Math.PI * 2);
            bgCtx.fill();
        }
    }
    isBgRendered = true;
}

function drawMazeWalls(wallColor) {
    STATE.maze.forEach(c => {
        let x = c.c * CONFIG.CELL_SIZE + CONFIG.MAZE_OFFSET_X;
        let y = c.r * CONFIG.CELL_SIZE;

        let drawCorner = false;
        if (c.walls[0] || c.walls[3]) drawCorner = true;

        if (!drawCorner) {
            let left = gridIndex(c.c - 1, c.r);
            let top = gridIndex(c.c, c.r - 1);
            if (left && left.walls[0]) drawCorner = true;
            if (top && top.walls[3]) drawCorner = true;
        }

        if (drawCorner) drawLED(x, y, wallColor);

        if (c.walls[0]) {
            drawLED(x + 1, y, wallColor);
            drawLED(x + 2, y, wallColor);
        }
        if (c.walls[3]) {
            drawLED(x, y + 1, wallColor);
            drawLED(x, y + 2, wallColor);
        }

        if (c.c === CONFIG.COLS - 1) {
            if (c.walls[1] || c.walls[0]) drawLED(x + 3, y, wallColor);
            if (c.walls[1]) {
                drawLED(x + 3, y + 1, wallColor);
                drawLED(x + 3, y + 2, wallColor);
            }
        }
        if (c.r === CONFIG.ROWS - 1) {
            if (c.walls[2] || c.walls[3]) drawLED(x, y + 3, wallColor);
            if (c.walls[2]) {
                drawLED(x + 1, y + 3, wallColor);
                drawLED(x + 2, y + 3, wallColor);
            }
        }
        if (c.c === CONFIG.COLS - 1 && c.r === CONFIG.ROWS - 1) {
            drawLED(x + 3, y + 3, wallColor);
        }
    });
}

function drawGoals() {
    let gc = Math.floor(STATE.frameCount / 12) % 2 === 0 ? '#fff' : '#444';
    STATE.players.forEach(p => {
        let gx = CONFIG.MAZE_OFFSET_X + p.goalC * CONFIG.CELL_SIZE + 1;
        let gy = p.goalR * CONFIG.CELL_SIZE + 1;
        drawLED(gx, gy, gc);
        drawLED(gx + 1, gy, gc);
        drawLED(gx, gy + 1, gc);
        drawLED(gx + 1, gy + 1, gc);
    });
}

function drawPortals() {
    if (STATE.gameTime % 30 === 0) STATE.portalReverseColors = !STATE.portalReverseColors;
    STATE.portals.forEach((p, idx) => {
        let tx = Math.floor(p.x - 1.5);
        let ty = Math.floor(p.y - 1.5);
        let effectColor = '#ffffffaa';
        const inOpacityHex = 0x60;
        let outColor = (idx === 0) ? (STATE.portalReverseColors ? STATE.cyanColor : STATE.blueColor) : (STATE.portalReverseColors ? STATE.blueColor : STATE.cyanColor);

        const perimeter = [
            { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
            { dx: 0, dy: 1 }, { dx: 3, dy: 1 },
            { dx: 0, dy: 2 }, { dx: 3, dy: 2 },
            { dx: 1, dy: 3 }, { dx: 2, dy: 3 },
        ];

        perimeter.forEach(offset => {
            drawLED(tx + offset.dx, ty + offset.dy, outColor);
        });

        const centerSeq = [
            { dx: 1, dy: 1 },
            { dx: 2, dy: 1 },
            { dx: 2, dy: 2 },
            { dx: 1, dy: 2 }
        ];

        let tick = Math.floor(STATE.frameCount / 6);
        let activeIdx = tick % 4;

        const dimHex = inOpacityHex.toString(16).padStart(2, '0');
        const dimmerHex = (inOpacityHex - 0x10).toString(16).padStart(2, '0');

        centerSeq.forEach((pos, idx) => {
            if (idx === activeIdx) {
                drawLED(tx + pos.dx, ty + pos.dy, effectColor);
            } else if (idx === activeIdx - 1) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${dimHex}`);
            } else if (activeIdx === 0 && idx === 3) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${dimHex}`);
            } else if (idx === activeIdx - 2) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${dimmerHex}`);
            } else if (activeIdx === 0 && idx === 2) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${dimmerHex}`);
            } else if (activeIdx === 1 && idx === 3) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${dimmerHex}`);
            } else {
                drawLED(tx + pos.dx, ty + pos.dy, '#000');
            }
        });
    });
}

function drawAmmoCrate() {
    if (!STATE.ammoCrate) return;
    let moveColor = 'rgba(255, 255, 255, 0.9)';
    let effectColor = 'rgba(0, 255, 21, 0.8)';
    let tx = STATE.ammoCrate.x;
    let ty = STATE.ammoCrate.y;
    const cellSeq = [
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 0 },
    ];
    let tick = Math.floor(STATE.frameCount / 6);
    let activeIdx = tick % 4;
    cellSeq.forEach((pos, idx) => {
        if (idx === activeIdx) {
            drawLED(tx + pos.dx, ty + pos.dy, moveColor);
        } else {
            drawLED(tx + pos.dx, ty + pos.dy, effectColor);
        }
    });
}

function drawMines() {
    STATE.mines.forEach(m => drawLED(m.x + m.visX, m.y + m.visY, m.active ? (STATE.frameCount % 12 < 6 ? '#f00' : '#800') : '#444'));
}

function drawProjectiles() {
    STATE.projectiles.forEach(p => {
        let mag = Math.hypot(p.vx, p.vy);
        if (mag === 0) return;

        let nx = p.vx / mag;
        let ny = p.vy / mag;
        let px = -ny;
        let py = nx;

        let halfLen = CONFIG.C_BEAM_LENGTH / 2;
        let halfWidth = CONFIG.C_BEAM_WIDTH / 2;

        let scanRadius = halfLen + 3;
        let minX = Math.floor(p.x - scanRadius);
        let maxX = Math.ceil(p.x + scanRadius);
        let minY = Math.floor(p.y - scanRadius);
        let maxY = Math.ceil(p.y + scanRadius);

        let color = (STATE.frameCount % 4 < 2) ? '#ffffff' : p.color;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                let dx = x - p.x;
                let dy = y - p.y;
                let distLength = Math.abs((dx * nx) + (dy * ny));
                let distWidth = Math.abs((dx * px) + (dy * py));
                if (distLength <= halfLen && distWidth <= halfWidth) {
                    drawLED(x, y, color);
                }
            }
        }
    });
}

function drawPlayers() {
    STATE.players.forEach(p => {
        if (p.isDead) return;

        // Beam trail
        for (let k = 0; k < CONFIG.BEAM_LENGTH; k++) {
            let i = Math.floor(p.beamIdx) - k;
            if (i >= 0 && i < p.beamPixels.length) {
                ctx.globalAlpha = 1 - (k / CONFIG.BEAM_LENGTH);
                drawLED(p.beamPixels[i].x, p.beamPixels[i].y, p.color);
                ctx.globalAlpha = 1;
            }
        }

        // Charging effect
        if (p.isCharging) {
            let r = (STATE.frameCount - p.chargeStartTime) / TIMING.CHARGE_DURATION;
            if (r > 1) r = 1;
            let cc = `hsl(${Math.floor((1 - r) * 120)},100%,50%)`;
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            let n = Math.ceil(8 * r);
            for (let i = 0; i < n; i++) drawLED(sx + perim[i].x, sy + perim[i].y, cc);
        }

        // Shield effect
        if (p.shieldActive) {
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            for (let i = 0; i < 8; i++) drawLED(sx + perim[i].x, sy + perim[i].y, '#88f');
        }

        // Boost trail
        if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED) {
            p.trail.forEach((t, i) => {
                const alpha = (i / p.trail.length) * 0.4;
                ctx.globalAlpha = alpha;
                drawLED(Math.floor(t.x), Math.floor(t.y), p.color);
            });
            ctx.globalAlpha = 1.0;
        }

        // Glitch & stun visuals
        if (p.glitchIsActive(STATE.frameCount) || p.stunIsActive(STATE.frameCount)) {
            const min = -1, max = 1;
            let rX = (Math.floor(Math.random() * (max - min + 1) + min));
            let rY = (Math.floor(Math.random() * (max - min + 1) + min));
            drawPlayerBody(p.x + rX, p.y + rY, '#FF0000');

            let cX = Math.floor(Math.random() * (max - min + 1) + min);
            let cY = Math.floor(Math.random() * (max - min + 1) + min);
            drawPlayerBody(p.x + cX, p.y + cY, '#00FFFF');

            if (Math.random() > 0.8) drawPlayerBody(p.x, p.y, '#FFFFFF');

            if (p.stunIsActive(STATE.frameCount)) {
                let flashColor = (Math.floor(STATE.frameCount / 2) % 2 === 0) ? '#444444' : '#FFFFFF';
                drawPlayerBody(p.x, p.y, flashColor);
            }
        } else {
            let color = p.color;
            if (p && p.boostEnergy < 25 && Math.floor(STATE.frameCount / 6) % 2 === 0) {
                color = '#555';
            }
            drawPlayerBody(p.x, p.y, color);
        }
    });
}

function drawParticles() {
    STATE.particles.forEach(p => drawLED(p.x, p.y, p.color));
}

function drawOverlays() {
    renderHUD(getWallColor());
    if (GAME.isAttractMode) {
        if (Math.floor(Date.now() / 1200) % 2 === 0) {
            drawText("DEMO MODE", 48, 25, "#ff0000aa");
            drawText("PRESS ANY BUTTON", 34, 35, "#ffff00aa");
        }
    }
    if (STATE.isPaused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawText("PAUSED", 52, 25, "#ffffff");
        if (Math.floor(Date.now() / 500) % 2 === 0)
            drawText("PRESS ESC TO RESUME", 28, 40, "#ffff00");
    } else if (STATE.isGameOver || STATE.isRoundOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (STATE.isGameOver) {
            const winColor = STATE.victimIdx == 0 ? STATE.players[1]?.color : STATE.players[0]?.color;
            const tauntColor = STATE.victimIdx == 1 ? STATE.players[1]?.color : STATE.players[0]?.color;
            if (Math.floor(Date.now() / 500) % 2 === 0)
                drawText(STATE.messages.win, 49, 8, winColor);
            let msg = `${STATE.players[STATE.victimIdx].name}: '${STATE.messages.taunt}'`
            drawText(msg, STATE.scrollX, 29, tauntColor);
            if (Math.floor(Date.now() / 500) % 2 === 0) drawText("PRESS ANY TO RESET", 30, 52, "#6f6deb");
        } else {
            drawText("ROUND OVER", 46, 8, "#fff");
            drawText(STATE.messages.round, STATE.scrollX, 29, STATE.messages.roundColor);
            if (Math.floor(Date.now() / 500) % 2 === 0) drawText("PRESS ANY BUTTON", 34, 52, "#ffff00");
        }
    }
}

function getWallColor() {
    let timeRatio = STATE.maxGameTime > 0 ? Math.max(0, Math.min(1, STATE.gameTime / STATE.maxGameTime)) : 0;
    let hue = Math.floor(timeRatio * 180);
    return `hsl(${hue}, 100%, 50%)`;
}

export function renderGame() {
    STATE.camera.update();

    if (!isBgRendered) preRenderBackground();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(STATE.camera.x, STATE.camera.y);
    ctx.drawImage(bgCanvas, 0, 0);

    let wallColor = getWallColor();

    drawMazeWalls(wallColor);
    drawGoals();
    drawPortals();
    drawAmmoCrate();
    drawMines();
    drawProjectiles();
    drawPlayers();
    drawParticles();
    drawOverlays();
}

export function renderHighScores() {
    // Clear screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    for (let y = 0; y < CONFIG.LOGICAL_H; y++) {
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) {
            drawLED(x, y, '#111');
        }
    }

    // Title
    drawText("LEADERBOARD", 43, 3, "#ffff00");

    // High scores list
    if (!STATE.highScores || STATE.highScores.length === 0) {
        drawText("NO SCORES YET", 35, 20, "#888");
        drawText("PLAY A GAME", 42, 30, "#666");
    } else {
        STATE.highScores.forEach((entry, idx) => {
            // Calculate Y position based on rank
            let yPos = 12 + (idx * 6);

            // Color based on rank (gold, silver, bronze)
            let rankColor = idx === 0 ? "#ffff00" : (idx === 1 ? "#ff8800" : "#888");
            let nameColor = entry.winColor;
            let oppColor = entry.oppColor;

            // Rank number3
            drawText(`${idx + 1}.`, 5, yPos, rankColor);
            // Player name (max 3 chars)
            let displayName = entry.name.substring(0, 3).toUpperCase();
            drawText(displayName, 14, yPos, nameColor);
            drawText("VS", 29, yPos, "#666");
            let oppName = entry.opponent;
            drawText(oppName, 40, yPos, oppColor);
            // Score
            let score = Math.round((entry.score- entry.oppScore) * entry.multiplier);
            drawText(`Score:${score}`, 97, yPos, rankColor);

        });
    }

    // Instructions
    if (Math.floor(Date.now() / 500) % 2 === 0) {
        drawText("PRESS ANY TO BACK", 30, 57, "#666");
    }
}

export function renderPlayerSetup() {
    // Clear screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    for (let y = 0; y < CONFIG.LOGICAL_H; y++) {
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) {
            drawLED(x, y, '#111');
        }
    }

    const ps = STATE.playerSetup;
    const pId = ps.activePlayer + 1;
    const playerLabel = `PLAYER ${pId}`;
    const playerColor = COLORS[ps.colorIdx].hex;
    const difficulty = DIFFICULTIES[ps.difficultyIdx];
    let previewX = 70;
    const blink = Math.floor(Date.now() / 200) % 2 === 0;
    const isMulty = GAME.gameMode === 'MULTI';
    let progressText = isMulty ? "MULTI PLAYERS" : "SINGLE PLAYER";
    let previewColorY = 28;
    let previewNameY = 38;
    drawText(progressText, isMulty ? 44 : 40, 3, "#888");
    if (isMulty) {
        drawText(playerLabel, 52, 11, playerColor);
        previewColorY = 24;
        previewNameY = 36;
    } else {
        drawText("DIFFICULTY: ", 23, 20, "#888");
        drawText(difficulty.name, previewX, 20, (blink && ps.phase === 'DIFFICULTY') ? "#555" : difficulty.hex);
    }

    drawText("COLOR: ", 43, previewColorY + 1, "#888");
    for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
            drawLED(previewX + x, previewColorY + y, (blink && ps.phase === 'COLOR') ? "#555" : playerColor);
        }
    }
    drawText(COLORS[ps.colorIdx].name, previewX + 11, previewColorY + 1, (blink && ps.phase === 'COLOR') ? "#555" : playerColor);

    drawText("NAME: ", 47, previewNameY, "#888");
    let charSpacing = 6;
    for (let i = 0; i < 3; i++) {
        let char = String.fromCharCode(ps.nameChars[i]);
        let isActive = (i === ps.nameCharIdx) && ps.phase === 'NAME';
        let displayColor = isActive ? playerColor : "#555";
        drawText(char, previewX + (i * charSpacing), previewNameY, displayColor);
        // Draw underline for active character
        if (isActive) {
            let underlineX = previewX + (i * charSpacing);
            if (blink) {
                drawLED(underlineX, previewNameY + 7, playerColor);
                drawLED(underlineX + 1, previewNameY + 7, playerColor);
                drawLED(underlineX + 2, previewNameY + 7, playerColor);
            }
        }
    }
    drawText("↑ ↓", 12, 50, "#61ca5d");
    drawText("CHANGE ", 5, 56, "#61ca5d");
    drawText("←", 95, 50, "#bb4e4e");
    drawText("→", 114, 50, "#bb4e4e");
    drawText("PREV NEXT", 90, 56, "#bb4e4e");
}

export function renderMenu() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++)
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) drawLED(x, y, '#111');

    const sel = GAME.menuSelection;
    const blink = Math.floor(Date.now() / 150) % 2 === 0;

    drawText("SELECT MODE", 45, 5, "#fff");

    // Draw selection arrow
    if (blink) drawText("→", 35, 17 + sel * 10, "#fff");
    if (blink) drawText("←", 92, 17 + sel * 10, "#fff");

    // Menu options - selected one is bright and colored, others are dim
    drawText("SINGLE PLAYER", 41, 17, sel === 0 ? "#08ffffff" : "#555");
    drawText("LOCAL MULTI", 45, 27, sel === 1 ? "#ff00ffff" : "#555");
    drawText("ONLINE MULTI", 43, 37, sel === 2 ? "#00ff88ff" : "#555");
    drawText("HIGH SCORES", 45, 47, sel === 3 ? "#8888ffff" : "#555");

    // drawText("↑↓ MOVE  BOOM SELECT", 14, 57, "#666");
    
    drawText("↑ ↓", 12, 50, "#61ca5d");
    drawText("CHANGE ", 5, 56, "#61ca5d");
    drawText("START", 102, 50, "#bb4e4e");
    drawText("SELECT", 100, 56, "#bb4e4e");
}