import { CONFIG, BITMAP_FONT, DIGIT_MAP, TIMING, COLORS, DIFFICULTIES, GAME } from './config.js';
import { STATE, suddenDeathIsActive, getFormattedStats } from './state.js';
import { gridIndex } from './grid.js';
import { generateDecorativeMaze } from './menu-maze.js';

const canvas = document.getElementById('ledMatrix');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');
let isBgRendered = false;

let leftMenuMaze = null;
let rightMenuMaze = null;
let bottomMenuMaze = null;

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
    if (!map) return;
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

/**
 * Render HUD elements for a single player
 * @param {Object} player - Player object
 * @param {string} timerStr - Game timer string (3 digits)
 * @param {string} wallColor - Color for timer display
 * @param {boolean} isPlayer1 - True for P1 (left side), false for P2 (right side)
 */
function renderPlayerHUD(player, timerStr, wallColor, isPlayer1) {
    const rotation = isPlayer1 ? 90 : -90;
    const x = isPlayer1 ? 0 : 123;

    // Player name
    if (player.name) {
        const nameOffsets = isPlayer1 ? [0, 4, 8] : [61, 57, 53];
        for (let i = 0; i < 3; i++) {
            drawChar(x, nameOffsets[i], player.name[i], player.color, rotation);
        }
    }

    // Mine count
    const mineY = isPlayer1 ? 13 : 48;
    const mineColor = `hsl(${player.minesLeft / 4 * 120},100%,50%)`;
    drawDigit(x, mineY, player.minesLeft, mineColor, rotation);

    // Energy bar
    const energyRatio = player.boostEnergy / CONFIG.MAX_ENERGY;
    const energyColor = `hsl(${energyRatio * 120},100%,50%)`;
    const barHeight = Math.floor(energyRatio * 26);
    for (let h = 0; h < barHeight; h++) {
        for (let w = 0; w < 5; w++) {
            const barY = isPlayer1 ? (17 + h) : (46 - h);
            drawLED(x + w, barY, energyColor);
        }
    }

    // Timer digits
    const timerOffsets = isPlayer1 ? [44, 48, 52] : [17, 13, 9];
    for (let i = 0; i < 3; i++) {
        drawDigit(x, timerOffsets[i], parseInt(timerStr[i]), wallColor, rotation);
    }

    // Score
    const scoreStr = player.score.toString().padStart(2, '0');
    const scoreOffsets = isPlayer1 ? [57, 61] : [4, 0];
    for (let i = 0; i < 2; i++) {
        drawDigit(x, scoreOffsets[i], parseInt(scoreStr[i]), player.color, rotation);
    }
}

function renderHUD(wallColor) {
    // This ensures the HUD doesn't shake with the world
    ctx.restore();
    const timerStr = Math.ceil(STATE.gameTime / 60).toString().padStart(3, '0');

    renderPlayerHUD(STATE.players[0], timerStr, wallColor, true);
    renderPlayerHUD(STATE.players[1], timerStr, wallColor, false);
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

function drawDecorativeMaze(maze, offsetX, offsetY, wallColor, cols, rows) {
    function decorativeGridIndex(c, r) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) return undefined;
        return maze[c + r * cols];
    }

    maze.forEach(c => {
        let x = c.c * CONFIG.CELL_SIZE + offsetX;
        let y = c.r * CONFIG.CELL_SIZE + offsetY;

        let drawCorner = false;
        if (c.walls[0] || c.walls[3]) drawCorner = true;

        if (!drawCorner) {
            let left = decorativeGridIndex(c.c - 1, c.r);
            let top = decorativeGridIndex(c.c, c.r - 1);
            if (left && left.walls[0]) drawCorner = true;
            if (top && top.walls[3]) drawCorner = true;
        }

        // Only draw internal corners (not on the absolute top or left edge)
        if (drawCorner && c.r > 0 && c.c > 0) {
            drawLED(x, y, wallColor);
        }

        // Only draw top wall segments if not on the top-most row
        if (c.walls[0] && c.r > 0) {
            drawLED(x + 1, y, wallColor);
            drawLED(x + 2, y, wallColor);
        }

        // Only draw left wall segments if not on the left-most column
        if (c.walls[3] && c.c > 0) {
            drawLED(x, y + 1, wallColor);
            drawLED(x, y + 2, wallColor);
        }
        // No logic for rightmost column, bottommost row, or bottom-right corner as per user's request.
        // These parts would draw the outer perimeter, which we want to avoid.
    });
}

function drawMenuDecoratives(wallColor) {

    const mazeCols = 11;
    const mazeRows = 17;
    const leftMazeOffsetX = 0;
    const rightMazeOffsetX = CONFIG.LOGICAL_W - (mazeCols * CONFIG.CELL_SIZE);

    if (!leftMenuMaze) {
        leftMenuMaze = generateDecorativeMaze(mazeCols, mazeRows, 12345);
    }
    if (!rightMenuMaze) {
        rightMenuMaze = generateDecorativeMaze(mazeCols, mazeRows, 54321);
    }

    drawDecorativeMaze(leftMenuMaze, leftMazeOffsetX, 0, '#222', mazeCols, mazeRows);
    drawDecorativeMaze(rightMenuMaze, rightMazeOffsetX, 0, '#222', mazeCols, mazeRows);

    const mazeBotCols = 24;
    const mazeBotRows = 5;
    if (!bottomMenuMaze) {
        bottomMenuMaze = generateDecorativeMaze(mazeBotCols, mazeBotRows, 36579);
    }

    drawDecorativeMaze(leftMenuMaze, leftMazeOffsetX, 0, wallColor, mazeCols, mazeRows);
    drawDecorativeMaze(rightMenuMaze, rightMazeOffsetX, 0, wallColor, mazeCols, mazeRows);
    drawDecorativeMaze(bottomMenuMaze, 29, 49, wallColor, mazeBotCols, mazeBotRows);
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
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    if (STATE.isPaused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawText("PAUSED", 52, 10, "#ffffff");
        let center = 52 + (("PAUSED".length * 4) - 1) / 2;
        // Pause menu options
        const menuOptions = GAME.gameMode === 'ONLINE' ? ["RESUME", "QUIT"] : ["RESUME", "RESTART", "QUIT"];
        const menuStartY = 24;
        const menuSpacing = 10;

        menuOptions.forEach((option, idx) => {
            const optionLength = option.length * 4;
            const isSelected = STATE.pauseMenuSelection === idx;
            const color = isSelected ? "#ffff00" : "#888888";
            const x = center - optionLength / 2;
            if (blink && isSelected) drawText("→", x - 6, menuStartY + idx * menuSpacing, "#fff");
            if (blink && isSelected) drawText("←", x + optionLength, menuStartY + idx * menuSpacing, "#fff");
            drawText(option, x, menuStartY + idx * menuSpacing, color);

        });

        drawText("↑↓", 13, 50, "#61ca5d");
        drawText("CHANGE ", 5, 56, "#61ca5d");
        drawText("BOOM", 104, 50, "#bb4e4e");
        drawText("SELECT", 100, 56, "#bb4e4e");
    } else if (STATE.isGameOver || STATE.isRoundOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (STATE.isGameOver) {
            const winColor = STATE.victimIdx === 0 ? STATE.players[1]?.color : STATE.players[0]?.color;
            const tauntColor = STATE.victimIdx === 1 ? STATE.players[1]?.color : STATE.players[0]?.color;
            let msg = `TIME OUT`;
            if (STATE.victimIdx === -1) {
                winColor = COLORS.find(x => x.name === 'MAGENTA');
                tauntColor = COLORS.find(x => x.name === 'CYAN');;
            } else
                msg = `${STATE.players[STATE.victimIdx].name}: '${STATE.messages.taunt}'`
            if (blink)
                drawText(STATE.messages.win, 49, 8, winColor);
            drawText(msg, STATE.scrollX, 29, tauntColor);
            if (blink) drawText("PRESS ANY TO RESET", 30, 52, "#6f6deb");
        } else {
            drawText("ROUND OVER", 46, 8, "#fff");
            drawText(STATE.messages.round, STATE.scrollX, 29, STATE.messages.roundColor);
            if (blink) drawText("PRESS ANY BUTTON", 34, 52, "#ffff00");
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

    // Tab headers
    const isLeaderboard = STATE.highScoreTab === 0;
    drawText("SCORES", 10, 2, isLeaderboard ? "#ffff00" : "#555");
    drawText("STATS", 95, 2, isLeaderboard ? "#555" : "#ffff00");
    drawText("<", 2, 2, "#888");
    drawText(">", 122, 2, "#888");

    if (isLeaderboard) {
        renderLeaderboard();
    } else {
        renderStats();
    }

    // Instructions
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    if (blink) {
        drawText("A/D:TAB  ANY:BACK", 30, 57, "#666");
    }
}

function renderLeaderboard() {
    // High scores list
    if (!STATE.highScores || STATE.highScores.length === 0) {
        drawText("NO SCORES YET", 35, 20, "#888");
        drawText("PLAY A GAME", 42, 30, "#666");
    } else {
        STATE.highScores.slice(0, 8).forEach((entry, idx) => {
            let yPos = 10 + (idx * 6);
            let rankColor = idx === 0 ? "#ffff00" : (idx === 1 ? "#ff8800" : "#888");
            let nameColor = entry.winColor;
            let oppColor = entry.oppColor;

            drawText(`${idx + 1}.`, 5, yPos, rankColor);
            let displayName = entry.name.substring(0, 3).toUpperCase();
            drawText(displayName, 14, yPos, nameColor);
            drawText("VS", 29, yPos, "#666");
            let oppName = entry.opponent;
            drawText(oppName, 40, yPos, oppColor);
            let score = Math.round((entry.score - entry.oppScore) * entry.multiplier);
            drawText(`${score}`, 110, yPos, rankColor);
        });
    }
}

function renderStats() {
    const stats = getFormattedStats();

    // Overall stats
    drawText("MATCHES", 5, 10, "#888");
    drawText(`${stats.totalMatches}`, 45, 10, "#fff");

    drawText("WINS", 65, 10, "#888");
    drawText(`${stats.wins}`, 85, 10, "#00ff00");

    drawText("LOSSES", 95, 10, "#888");
    drawText(`${stats.losses}`, 122, 10, "#ff0000");

    // Win rate
    drawText("WIN RATE", 5, 18, "#888");
    const winRateColor = stats.winRate >= 50 ? "#00ff00" : "#ff8800";
    drawText(`${stats.winRate}%`, 50, 18, winRateColor);

    drawText("PLAY TIME", 70, 18, "#888");
    drawText(`${stats.totalPlayTime}M`, 112, 18, "#fff");

    // By mode section
    drawText("BY MODE", 5, 28, "#ffff00");
    let modeY = 34;
    const modes = ['SINGLE', 'MULTI', 'ONLINE'];
    modes.forEach((mode, idx) => {
        const modeStats = stats.byMode[mode] || { wins: 0, losses: 0 };
        const x = 5 + idx * 43;
        drawText(mode.substring(0, 6), x, modeY, "#888");
        drawText(`${modeStats.wins}W`, x, modeY + 6, "#00ff00");
        drawText(`${modeStats.losses}L`, x + 16, modeY + 6, "#ff0000");
    });

    // Recent matches
    drawText("RECENT", 5, 48, "#ffff00");
    if (stats.recentMatches.length === 0) {
        drawText("NO MATCHES", 45, 48, "#555");
    } else {
        const recent = stats.recentMatches[0];
        const resultColor = recent.winner === recent.p1Name ? "#00ff00" : "#ff0000";
        drawText(`${recent.p1Name} ${recent.p1Score}-${recent.p2Score} ${recent.p2Name}`, 45, 48, resultColor);
    }
}

export function renderPlayerSetup() {
    // Clear screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++) {
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) {
            drawLED(x, y, '#111');
        }
    }
    drawMenuDecoratives("#8888ff33");
    const ps = STATE.playerSetup;
    const pId = ps.activePlayer + 1;
    const playerLabel = `PLAYER ${pId}`;
    const playerColor = COLORS[ps.colorIdx].hex;
    const difficulty = DIFFICULTIES[ps.difficultyIdx];
    let previewX = 65;
    const blink = Math.floor(Date.now() / 200) % 2 === 0;
    const isMulti = GAME.gameMode === 'MULTI';
    let progressText = isMulti ? "MULTI PLAYER" : "SINGLE PLAYER";
    let previewColorY = 24;                     //"MULTI PLAYER"
    let previewNameY = 34;
    drawText(progressText, isMulti ? 43 : 39, 3, "#fff");
    if (isMulti) {
        drawText(playerLabel, 52, 11, playerColor);
        previewColorY = 24;
        previewNameY = 36;
    } else {
        drawText("DIFF: ", 43, 16, "#888");
        drawText(difficulty.name, previewX, 16, (blink && ps.phase === 'DIFFICULTY') ? "#555" : difficulty.hex);
    }

    drawText("COLOR: ", 39, previewColorY + 1, "#888");
    for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
            drawLED(previewX + x, previewColorY + y, (blink && ps.phase === 'COLOR') ? "#555" : playerColor);
        }
    }
    drawText(COLORS[ps.colorIdx].name, previewX + 11, previewColorY + 1, (blink && ps.phase === 'COLOR') ? "#555" : playerColor);

    drawText("NAME: ", 43, previewNameY, "#888");
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
    drawText("↑↓", 13, 50, "#61ca5d");
    drawText("CHANGE ", 5, 56, "#61ca5d");
    drawText("←", 99, 50, "#bb4e4e");
    drawText("→", 118, 50, "#bb4e4e");
    drawText("PREV NEXT", 94, 56, "#bb4e4e");
}

export function renderMenu() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++)
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) drawLED(x, y, '#111');

    drawMenuDecoratives();

    const sel = GAME.menuSelection;
    const blink = Math.floor(Date.now() / 150) % 2 === 0;

    const menuColors = ["#08ffff", "#ff00ff", "#00ff88", "#8888ff"];

    drawText("SELECT MODE", 43, 3, "#fff");

    let center = 52 + (("SELECT MODE".length * 4) - 1) / 2;
    const menuOptions = ["SINGLE PLAYER", "LOCAL MULTI", "ONLINE MULTI", "HIGH SCORES"];

    const menuStartY = 24;
    const menuSpacing = 10;

    let wallColor = menuColors[sel] + '99'; // Add alpha for a dimmer effect
    // menuOptions.forEach((option, idx) => {
    //     const optionLength = option.length * 4;
    //     const isSelected = GAME.menuSelection === idx;
    //     const color = isSelected ? menuColors[idx] : "#888888";
    //     const x = center - optionLength / 2;
    //     if (blink && isSelected) drawText("→", x - 6, menuStartY + idx * menuSpacing, "#fff");
    //     if (blink && isSelected) drawText("←", x + optionLength, menuStartY + idx * menuSpacing, "#fff");
    //     drawText(option, x, menuStartY + idx * menuSpacing, color);
    //     wallColor = menuColors[idx] + '99'; 
    // });
    drawMenuDecoratives(wallColor);
    // Draw selection arrow
    if (blink) drawText("→", 33, 13 + sel * 10, "#fff");
    if (blink) drawText("←", 90, 13 + sel * 10, "#fff");

    // Menu options - selected one is bright and colored, others are dim
    drawText("SINGLE PLAYER", 39, 13, sel === 0 ? menuColors[0] + "ff" : "#555");
    drawText("LOCAL MULTI", 43, 23, sel === 1 ? menuColors[1] + "ff" : "#555");
    drawText("ONLINE MULTI", 41, 33, sel === 2 ? menuColors[2] + "ff" : "#555");
    drawText("HIGH SCORES", 43, 43, sel === 3 ? menuColors[3] + "ff" : "#555");

    drawText("↑↓", 13, 50, "#61ca5d");
    drawText("CHANGE ", 5, 56, "#61ca5d");
    drawText("START", 105, 50, "#bb4e4e");
    drawText("SELECT", 103, 56, "#bb4e4e");
}