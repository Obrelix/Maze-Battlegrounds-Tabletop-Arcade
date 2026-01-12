import { CONFIG, BITMAP_FONT, DIGIT_MAP } from './config.js';
import { STATE } from './state.js';
import { isWall, gridIndex } from './grid.js';

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
            for (let p = 0; p < 15; p++) {
                if (map[p]) drawLED(cx + (p % 3), y + Math.floor(p / 3), color);
            }
        }
        cx += 4;
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

function drawPlayerBody(x, y, color) {
    let p = STATE.players.find(pl => pl.color === color); // Simplified lookup
    if (p && p.boostEnergy < 25 && Math.floor(Date.now() / 100) % 2 === 0) {
        color = '#555'; // Flash grey if exhausted
    }
    drawLED(Math.floor(x), Math.floor(y), color);
    drawLED(Math.floor(x) + 1, Math.floor(y), color);
    drawLED(Math.floor(x), Math.floor(y) + 1, color);
    drawLED(Math.floor(x) + 1, Math.floor(y) + 1, color);
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

export function renderGame() {
    // --- FIX 1: Update Camera Physics ---
    STATE.camera.update();

    // 1. Draw Background
    if (!isBgRendered) preRenderBackground();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // SAVE CONTEXT BEFORE SHAKING
    ctx.save();
    ctx.translate(STATE.camera.x, STATE.camera.y); // Apply Shake

    // Draw Background Image
    ctx.drawImage(bgCanvas, 0, 0);

    let timeRatio = STATE.maxGameTime > 0 ? Math.max(0, Math.min(1, STATE.gameTime / STATE.maxGameTime)) : 0;
    let hue = Math.floor(timeRatio * 180);
    let wallColor = `hsl(${hue}, 100%, 50%)`;

    // 2. Draw Maze Walls
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

    // 3. Draw Goals
    let gc = Math.floor(Date.now() / 200) % 2 === 0 ? '#fff' : '#444';
    STATE.players.forEach(p => {
        let gx = CONFIG.MAZE_OFFSET_X + p.goalC * CONFIG.CELL_SIZE + 1;
        let gy = p.goalR * CONFIG.CELL_SIZE + 1;
        drawLED(gx, gy, gc);
        drawLED(gx + 1, gy, gc);
        drawLED(gx, gy + 1, gc);
        drawLED(gx + 1, gy + 1, gc);
    });
    // 4. Draw Portals (4x4 Animated)
    if (STATE.gameTime % 30 === 0)
        STATE.portalReverseColors = !STATE.portalReverseColors;
    STATE.portals.forEach((p, idx) => {
        // Calculate Top-Left corner of the 4x4 grid
        // p.x/p.y is the center of a 3x3 cell (e.g. 1.5). 
        // We subtract 1.5 to align the 4x4 box perfectly centered on the cell.
        // It will cover the 3x3 cell + 1 extra row/col.
        let tx = Math.floor(p.x - 1.5);
        let ty = Math.floor(p.y - 1.5);
        let outColor = CONFIG.PORTAL2_COLOR;
        let effectColor = '#ffffffaa';
        const inOpacityHex = '60';
        outColor = (idx === 0) ? ( STATE.portalReverseColors ? CONFIG.PORTAL1_COLOR : CONFIG.PORTAL2_COLOR ) : (STATE.portalReverseColors ? CONFIG.PORTAL2_COLOR : CONFIG.PORTAL1_COLOR);
        
        // --- A. Draw Perimeter (Static Color) ---
        // Indices relative to tx, ty:
        // (0,0) (1,0) (2,0) (3,0)
        // (0,1)             (3,1)
        // (0,2)             (3,2)
        // (0,3) (1,3) (2,3) (3,3)
        const perimeter = [
            { dx: 1, dy: 0 }, { dx: 2, dy: 0 },  // Top
            { dx: 0, dy: 1 }, { dx: 3, dy: 1 }, // Sides
            { dx: 0, dy: 2 }, { dx: 3, dy: 2 }, // Sides
            { dx: 1, dy: 3 }, { dx: 2, dy: 3 },   // Bottom
        ];

        perimeter.forEach(offset => {
            drawLED(tx + offset.dx, ty + offset.dy, outColor);
        });

        // --- B. Draw Center (4 LEDs Rotating) ---
        // Inner 2x2 Square relative coords:
        // (1,1) (2,1)
        // (1,2) (2,2)
        // We map them to a circular sequence for the animation
        const centerSeq = [
            { dx: 1, dy: 1 }, // Top-Left
            { dx: 2, dy: 1 }, // Top-Right
            { dx: 2, dy: 2 }, // Bottom-Right
            { dx: 1, dy: 2 }  // Bottom-Left
        ];

        // Animation Timing
        // We cycle through 0, 1, 2, 3 based on time
        let tick = Math.floor(Date.now() / 100);
        let activeIdx = tick % 4;

        centerSeq.forEach((pos, idx) => {
            if (idx === activeIdx) {
                // The "Moving" pixel is White (Bright)
                drawLED(tx + pos.dx, ty + pos.dy, effectColor);
            } else if (idx === activeIdx - 1) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${inOpacityHex}`);
            } else if (activeIdx === 0 && idx === 3) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${inOpacityHex}`);
            } else if (idx === activeIdx - 2) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${inOpacityHex - 10}`);
            } else if (activeIdx === 0 && idx === 2) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${inOpacityHex - 10}`);
            } else if (activeIdx === 1 && idx === 3) {
                drawLED(tx + pos.dx, ty + pos.dy, `${effectColor.slice(0, 7)}${inOpacityHex - 10}`);
            } else {
                // The trail pixels are dimmer versions of the portal color
                // OR different colors to make it look like a swirling vortex
                drawLED(tx + pos.dx, ty + pos.dy, '#000'); // Dark center hole
            }
        });
    });

    // Draw Ammo (Unchanged)
    if (STATE.ammoCrate) {
        let moveColor = 'rgba(255, 255, 255, 0.9)';
        let effectColor = 'rgba(0, 255, 21, 0.8)';
        let perimColor = 'rgba(255, 255, 255, 0.9)';
        const inOpacityHex = '60';
        let tx = STATE.ammoCrate.x;
        let ty = STATE.ammoCrate.y;
        const cellCeq = [
            { dx: 0, dy: 1 },  // Bottom-Left
            { dx: 1, dy: 1 }, // Bottom-Right
            { dx: 1, dy: 0 }, // Top-Right
            { dx: 0, dy: 0 }, // Top-Left
        ];
        let tick = Math.floor(Date.now() / 100);
        let activeIdx = tick % 4;
        cellCeq.forEach((pos, idx) => {
            if (idx === activeIdx) {
                drawLED(tx + pos.dx, ty + pos.dy, moveColor);
            }  else {
                drawLED(tx + pos.dx, ty + pos.dy, effectColor); 
            }
        });
        // // Indices relative to tx, ty:
        // // (-1, -1) (0, -1) (1, -1) (2, -1)
        // // (-1,  0) (0,  0) (1,  0) (2,  0)
        // // (-1,  1) (0,  1) (1,  1) (2,  1)
        // // (-1,  2) (0,  2) (1,  2) (2,  2)
        // const perimeter = [
        //     { dx: -1, dy: -1 }, { dx:  0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 2, dy: -1 },  
        //     { dx:  2, dy:  0 }, { dx:  2, dy:  1 }, { dx: 2, dy:  2 },
        //     { dx:  1, dy:  2 }, { dx:  0, dy:  2 }, { dx: -1, dy: 2 },
        //     { dx: -1, dy:  1 }, { dx: -1, dy: 0 } 
        // ];
        // activeIdx = tick % 3;
        // let pos = perimeter[activeIdx];
        // drawLED(tx + pos.dx, ty + pos.dy, perimColor);
        // activeIdx += 3;
        // pos = perimeter[activeIdx];
        // drawLED(tx + pos.dx, ty + pos.dy, perimColor);
        // activeIdx += 3;
        // pos = perimeter[activeIdx];
        // drawLED(tx + pos.dx, ty + pos.dy, perimColor);
        // activeIdx += 3;
        // pos = perimeter[activeIdx];
        // drawLED(tx + pos.dx, ty + pos.dy, perimColor);
        
    }

    // 5. Draw Mines & Projectiles
    STATE.mines.forEach(m => drawLED(m.x + m.visX, m.y + m.visY, m.active ? (Date.now() % 200 < 100 ? '#f00' : '#800') : '#444'));
    // ... Mines drawing code above ...

    // --- 5b. PROJECTILE RENDER (Rasterized Rotated Rectangle) ---
    STATE.projectiles.forEach(p => {
        // 1. Math Setup
        let mag = Math.hypot(p.vx, p.vy);
        if (mag === 0) return;

        let nx = p.vx / mag; // Direction
        let ny = p.vy / mag;

        let px = -ny;        // Perpendicular (Width)
        let py = nx;

        let halfLen = CONFIG.C_BEAM_LENGTH / 2;
        let halfWidth = CONFIG.C_BEAM_WIDTH / 2; // Try 1.5 or 2.0 in Config for a thick beam

        // 2. Optimization: Only scan relevant grid cells
        let scanRadius = halfLen + 3;
        let minX = Math.floor(p.x - scanRadius);
        let maxX = Math.ceil(p.x + scanRadius);
        let minY = Math.floor(p.y - scanRadius);
        let maxY = Math.ceil(p.y + scanRadius);

        let color = (Date.now() % 60 < 30) ? '#ffffff' : p.color; // Flash White/Color

        // 3. Loop through physical LEDs (Integers)
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {

                // Vector from beam center to this LED
                let dx = x - p.x;
                let dy = y - p.y;

                // Project this vector onto the beam's axes
                let distLength = Math.abs((dx * nx) + (dy * ny)); // Distance along length
                let distWidth = Math.abs((dx * px) + (dy * py));  // Distance along width

                // 4. Hit Test
                if (distLength <= halfLen && distWidth <= halfWidth) {
                    // We pass integer X,Y here, so drawLED will align perfectly
                    drawLED(x, y, color);
                }
            }
        }
    });

    STATE.players.forEach(p => {
        if (p.isDead) return;

        // --- 1. BEAM RENDERING (Unchanged) ---
        // (Keep your existing beam drawing loop here)
        for (let k = 0; k < CONFIG.BEAM_LENGTH; k++) {
            let i = Math.floor(p.beamIdx) - k;
            if (i >= 0 && i < p.beamPixels.length) {
                ctx.globalAlpha = 1 - (k / CONFIG.BEAM_LENGTH);
                drawLED(p.beamPixels[i].x, p.beamPixels[i].y, p.color);
                ctx.globalAlpha = 1;
            }
        }

        // --- 2. CHARGING EFFECT (Unchanged) ---
        // (Keep your existing charge effect logic here)
        if (p.isCharging) {
            let r = (Date.now() - p.chargeStartTime) / CONFIG.CHARGE_TIME; if (r > 1) r = 1;
            let cc = `hsl(${Math.floor((1 - r) * 120)},100%,50%)`;
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            let n = Math.ceil(8 * r);
            for (let i = 0; i < n; i++) drawLED(sx + perim[i].x, sy + perim[i].y, cc);
        }

        // --- 3. SHIELD EFFECT (Unchanged) ---
        if (p.shieldActive) {
            let sx = Math.floor(p.x) - 1, sy = Math.floor(p.y) - 1;
            let perim = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
            for (let i = 0; i < 8; i++) drawLED(sx + perim[i].x, sy + perim[i].y, '#88f');
        }

        // --- 4. TRAIL EFFECT (Unchanged) ---
        if (p.boostEnergy > 0 && p.currentSpeed > CONFIG.BASE_SPEED) {
            p.trail.forEach((t, i) => {
                const alpha = (i / p.trail.length) * 0.4;
                ctx.globalAlpha = alpha;
                drawLED(Math.floor(t.x), Math.floor(t.y), p.color);
                drawLED(Math.floor(t.x) + 1, Math.floor(t.y) + 1, p.color); 11
            });
            ctx.globalAlpha = 1.0;
        }

        // --- 5. NEW: GLITCH & STUN VISUALS ---
        if (p.glitchTime > 0 || p.stunTime > 0) {
            // 
            // EFFECT: "RGB Split" (Simulates Broken Controls)
            // const shake = Math.random(-3,1); // Pixel offset amount
            const min = -1, max = 1;
            // Draw RED Ghost (Offset Randomly)
            let rX = (Math.floor(Math.random() * (max - min + 1) + min));
            let rY = (Math.floor(Math.random() * (max - min + 1) + min));
            drawPlayerBody(p.x + rX, p.y + rY, '#FF0000');

            // Draw CYAN Ghost (Offset Opposite)
            let cX = Math.floor(Math.random() * (max - min + 1) + min);
            let cY = Math.floor(Math.random() * (max - min + 1) + min);
            drawPlayerBody(p.x + cX, p.y + cY, '#00FFFF');

            // 20% Chance to draw the real white core on top
            if (Math.random() > 0.8) drawPlayerBody(p.x, p.y, '#FFFFFF');

            if (p.stunTime > 0) {
                // 
                // EFFECT: "Static Shock" (Simulates Stun)
                // Rapidly flash between Dim Grey and Bright White
                let flashColor = (Math.floor(Date.now() / 40) % 2 === 0) ? '#444444' : '#FFFFFF';
                drawPlayerBody(p.x, p.y, flashColor);
            }
            // Draw random "sparks" around the player
            // for (let i = 0; i < 3; i++) {
            //     // Pick a random spot near the player
            //     let sx = p.x + (Math.random() * 3) ;
            //     let sy = p.y + (Math.random() * 3) - 0.5;
            //     // Draw a single yellow/white spark pixel
            //     drawLED(Math.floor(sx), Math.floor(sy), Math.random() > 0.5 ? '#FFFF00' : '#FFFFFF');
            // }

        } else {
            // NORMAL RENDER
            drawPlayerBody(p.x, p.y, p.color);
        }
    });

    // 7. Draw Particles
    STATE.particles.forEach(p => drawLED(p.x, p.y, p.color));

    // --- FIX 2: Restore Context BEFORE Drawing HUD ---
    // This ensures the HUD doesn't shake with the world
    ctx.restore();

    // 8. Draw HUD
    let p1 = STATE.players[0],
        p2 = STATE.players[1],
        s = Math.ceil(STATE.gameTime / 60).toString().padStart(3, '0');
    drawDigit(0, 0, parseInt(p1.score.toString().padStart(2, '0')[0]), p1.color, 90);
    drawDigit(0, 4, parseInt(p1.score.toString().padStart(2, '0')[1]), p1.color, 90);
    drawDigit(0, 10, p1.minesLeft, `hsl(${p1.minesLeft / 4 * 120},100%,50%)`, 90);
    for (let h = 0; h < Math.floor(p1.boostEnergy / 100 * 38); h++)
        for (let w = 0; w < 5; w++) drawLED(w, 14 + h, `hsl(${p1.boostEnergy / 100 * 120},100%,50%)`);

    drawDigit(0, 53, parseInt(s[0]), wallColor, 90);
    drawDigit(0, 57, parseInt(s[1]), wallColor, 90);
    drawDigit(0, 61, parseInt(s[2]), wallColor, 90);

    let rx = 123;
    drawDigit(rx, 61, parseInt(p2.score.toString().padStart(2, '0')[0]), p2.color, -90);
    drawDigit(rx, 57, parseInt(p2.score.toString().padStart(2, '0')[1]), p2.color, -90);
    drawDigit(rx, 51, p2.minesLeft, `hsl(${p2.minesLeft / 4 * 120},100%,50%)`, -90);
    for (let h = 0; h < Math.floor(p2.boostEnergy / 100 * 38); h++)
        for (let w = 0; w < 5; w++) drawLED(rx + w, 49 - h, `hsl(${p2.boostEnergy / 100 * 120},100%,50%)`);

    drawDigit(rx, 8, parseInt(s[0]), wallColor, -90);
    drawDigit(rx, 4, parseInt(s[1]), wallColor, -90);
    drawDigit(rx, 0, parseInt(s[2]), wallColor, -90);
    if (STATE.isAttractMode) {
        if (Math.floor(Date.now() / 800) % 2 === 0) { // Blink slowly
            drawText("DEMO MODE", 46, 25, "#ff0000");
            drawText("PRESS ANY BUTTON", 32, 35, "#ffff00");
        }
    }
    // 9. OVERLAY TEXT & DIMMER
    if (STATE.isGameOver || STATE.isRoundOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (STATE.isGameOver) {
            const winColor = STATE.looser == 1 ? CONFIG.P2COLOR : CONFIG.P1COLOR;
            const tauntColor = STATE.looser == 2 ? CONFIG.P2COLOR : CONFIG.P1COLOR;
            if (Math.floor(Date.now() / 300) % 2 === 0)
                drawText(STATE.messages.win, 38, 15, winColor);
            let msg = `P${STATE.looser}: '${STATE.messages.taunt}'`
            drawText(msg, STATE.scrollX, 35, tauntColor);
            drawText("PRESS 'R' TO RESET", 30, 52, "#888");
        } else {
            drawText("ROUND OVER", 46, 20, "#fff");
            drawText(STATE.messages.round, STATE.scrollX, 40, STATE.messages.roundColor);
            if (Math.floor(Date.now() / 500) % 2 === 0) drawText("PRESS 'START'", 42, 55, "#ffff00");
        }
    }
}

export function renderMenu() {
    document.getElementById('p1-header').style.color = CONFIG.P1COLOR;
    document.getElementById('p2-header').style.color = CONFIG.P2COLOR;
    document.getElementById('p1-panel').style.border = `1px solid ${CONFIG.P1COLOR.slice(0, 7)}63`;
    document.getElementById('p1-panel').style.boxShadow = `inset 0 0 15px ${CONFIG.P1COLOR.slice(0, 7)}23`;
    document.getElementById('p2-panel').style.border = `1px solid ${CONFIG.P2COLOR.slice(0, 7)}63`;
    document.getElementById('p2-panel').style.boxShadow = `inset 0 0 15px ${CONFIG.P2COLOR.slice(0, 7)}23`;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < CONFIG.LOGICAL_H; y++)
        for (let x = 0; x < CONFIG.LOGICAL_W; x++) drawLED(x, y, '#111');

    drawText("SELECT MODE", 42, 10, "#fff");
    drawText("1. SINGLE PLAYER", 30, 25, Math.floor(Date.now() / 500) % 2 === 0 ? CONFIG.P1COLOR : "#555");
    drawText("2. MULTIPLAYER", 35, 35, Math.floor(Date.now() / 500) % 2 !== 0 ? CONFIG.P2COLOR : "#555");
    drawText("CPU: HARD", 45, 55, "#f55");
}