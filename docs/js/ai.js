import { STATE } from './state.js';
import { CONFIG } from './config.js';
import { gridIndex, isWall } from './grid.js';

export function findPath(cpu, targetC, targetR, ignoreMines) {
    let start = gridIndex(Math.floor((cpu.x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE), Math.floor(cpu.y / CONFIG.CELL_SIZE));
    let end = gridIndex(targetC, targetR);
    if (!start || !end) return null;

    STATE.maze.forEach(c => {
        c.bfsVisited = false;
        c.parent = null;
    });
    let q = [start];
    start.bfsVisited = true;
    let found = false;

    while (q.length > 0) {
        let curr = q.shift();
        if (curr === end) {
            found = true;
            break;
        }

        [
            [0, -1, 0],
            [1, 0, 1],
            [0, 1, 2],
            [-1, 0, 3]
        ].forEach(d => {
            let n = gridIndex(curr.c + d[0], curr.r + d[1]);
            let isSafe = true;
            if (n && !ignoreMines) {
                let mx = CONFIG.MAZE_OFFSET_X + n.c * CONFIG.CELL_SIZE + 1.5;
                let my = n.r * CONFIG.CELL_SIZE + 1.5;
                if (STATE.mines.some(m => m.active && Math.abs(m.x - mx) < 3 && Math.abs(m.y - my) < 3)) {
                    isSafe = false;
                }
            }
            if (n && !n.bfsVisited && !curr.walls[d[2]] && isSafe) {
                n.bfsVisited = true;
                n.parent = curr;
                q.push(n);
            }
        });
    }

    if (found) {
        let path = [];
        let t = end;
        while (t) {
            path.push(t);
            t = t.parent;
        }
        path.reverse();
        return path;
    }
    return null;
}

export function canHitTarget(shooter, target) {
    // 1. Determine Shooting Direction based on relative position
    let dx = target.x - shooter.x;
    let dy = target.y - shooter.y;

    // Must be roughly aligned to an axis
    if (Math.abs(dx) > 4.0 && Math.abs(dy) > 4.0) return false;

    let stepX = 0, stepY = 0;
    if (Math.abs(dx) > Math.abs(dy)) stepX = Math.sign(dx); // Horizontal Shot
    else stepY = Math.sign(dy); // Vertical Shot

    // 2. Trace the path
    let dist = Math.hypot(dx, dy);
    let checkDist = 0;
    let currX = shooter.x + (shooter.size / 2); // Start at center
    let currY = shooter.y + (shooter.size / 2);

    while (checkDist < dist && checkDist < CONFIG.BEAM_LENGTH) {
        currX += stepX; // Step 1 unit at a time
        currY += stepY;
        checkDist++;

        // Hit Wall? Stop.
        if (isWall(currX, currY)) return false;

        // Hit Target? Success!
        // Simple AABB check against target body
        if (currX > target.x && currX < target.x + target.size &&
            currY > target.y && currY < target.y + target.size) {
            return true;
        }
    }
    return false;
}

export function getCpuInput(cpu, opponent) {
    // --- 0. INIT MEMORY ---
    if (!cpu.ai) {
        cpu.ai = {
            mode: 'SCORE',      // SCORE (Main), HUNT (If close), FLEE (If dying)
            stuckTimer: 0,
            lastCell: null
        };
    }

    let cmd = {
        up: false, down: false, left: false, right: false,
        shield: false, beam: false, mine: false, boost: false, boom: false
    };

    let distOpp = Math.hypot(opponent.x - cpu.x, opponent.y - cpu.y);

    // =============================================
    // 1. COMBAT (Opportunity Fire)
    // =============================================
    // Expert Logic: "If I shoot now, will it hit?"
    // We check this EVERY frame. If yes, pull the trigger.
    if (!cmd.shield && cpu.boostEnergy > 25 && distOpp < 35) {
        if (canHitTarget(cpu, opponent)) {
            cmd.beam = true;
        }
    }

    // Detonate Mines (Wall Hacks)
    // If enemy is near ANY of our mines, blow it up.
    STATE.mines.forEach(m => {
        if (m.owner === cpu.id && Math.hypot(m.x - opponent.x, m.y - opponent.y) < 5) {
            cmd.boom = true;
        }
    });


    // =============================================
    // 2. SURVIVAL (Reflexes)
    // =============================================
    // Only shield if absolutely necessary (conserves energy for boosting)
    STATE.projectiles.forEach(proj => {
        if (proj.owner !== cpu.id) {
            let d = Math.hypot(cpu.x - proj.x, cpu.y - proj.y);

            // Vector logic: Is it moving towards me?
            let dot = (proj.vx * (cpu.x - proj.x)) + (proj.vy * (cpu.y - proj.y));

            // If it's close (20px), incoming, and aligned with my body
            if (d < 20 && dot > 0) {
                // Check if it will actually hit my width
                let perp = Math.abs((proj.vx * (cpu.y - proj.y) - proj.vy * (cpu.x - proj.x)));
                if (perp < 2.0 && cpu.boostEnergy > 10) cmd.shield = true;
            }
        }
    });


    // =============================================
    // 3. NAVIGATION (Speed & Goal Pressure)
    // =============================================

    // A. DETERMINE GOAL
    let targetC, targetR;

    // Logic: If I have more health than enemy, ignore them and SCORE.
    // If I am dying, run to Ammo.
    if (cpu.boostEnergy < 20 && opponent.boostEnergy > 40) {
        // Survival Mode
        if (STATE.ammoCrate) {
            targetC = Math.floor((STATE.ammoCrate.x - CONFIG.MAZE_OFFSET_X) / CONFIG.CELL_SIZE);
            targetR = Math.floor(STATE.ammoCrate.y / CONFIG.CELL_SIZE);
        } else {
            // Run to furthest corner
            targetC = (opponent.c < CONFIG.COLS / 2) ? CONFIG.COLS - 1 : 0;
            targetR = (opponent.r < CONFIG.ROWS / 2) ? CONFIG.ROWS - 1 : 0;
        }
    } else {
        // Winning Mode: GO FOR GOAL
        targetC = cpu.goalC;
        targetR = cpu.goalR;
    }

    // B. CALCULATE PATH
    // Only re-calculate if we don't have a next cell or reached it
    if (!cpu.botNextCell || cpu.botRetargetTimer <= 0) {
        let path = findPath(cpu, targetC, targetR, false); // Try safe path
        if (!path) path = findPath(cpu, targetC, targetR, true); // Force path

        if (path && path.length > 0) {
            // Look Ahead: If path[1] is straight line from path[0], target that!
            cpu.botNextCell = path.length > 1 ? path[1] : path[0];
        }
        cpu.botRetargetTimer = 5;
    }
    cpu.botRetargetTimer--;

    // C. EXECUTE MOVEMENT
    if (cpu.botNextCell) {
        let tx = CONFIG.MAZE_OFFSET_X + cpu.botNextCell.c * CONFIG.CELL_SIZE + 0.5;
        let ty = cpu.botNextCell.r * CONFIG.CELL_SIZE + 0.5;

        let diffX = tx - cpu.x;
        let diffY = ty - cpu.y;

        // Move towards center of target cell
        if (Math.abs(diffX) > 0.1) { if (diffX < 0) cmd.left = true; else cmd.right = true; }
        if (Math.abs(diffY) > 0.1) { if (diffY < 0) cmd.up = true; else cmd.down = true; }

        // --- PRO MOVE: SPRINTING ---
        // If we are moving in a straight line towards the goal and have energy, BOOST.
        if (!cmd.shield && cpu.boostEnergy > 60 && !cmd.beam) {
            // Check if the path ahead is clear for a boost
            // Simple check: Are we moving exclusively X or Y?
            if ((cmd.left || cmd.right) && !cmd.up && !cmd.down) {
                if (!isWall(cpu.x + (cmd.right ? 4 : -4), cpu.y)) cmd.boost = true;
            }
            else if ((cmd.up || cmd.down) && !cmd.left && !cmd.right) {
                if (!isWall(cpu.x, cpu.y + (cmd.down ? 4 : -4))) cmd.boost = true;
            }
        }
    }

    // D. UNSTUCK (Fallback)
    // Check if we haven't moved in a while
    let distMoved = Math.hypot(cpu.x - cpu.lastPos.x, cpu.y - cpu.lastPos.y);
    if (distMoved < 0.05) cpu.ai.stuckTimer++; else cpu.ai.stuckTimer = 0;
    cpu.lastPos = { x: cpu.x, y: cpu.y };

    if (cpu.ai.stuckTimer > 15) {
        // Jiggle randomly to break free
        if (Math.random() > 0.5) cmd.up = !cmd.up;
        else cmd.left = !cmd.left;
        cmd.boost = true; // Burst out
    }

    return cmd;
}