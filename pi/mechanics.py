# pi/mechanics.py
# Core game physics and action resolution — ported faithfully from docs/js/mechanics.js
# Source of truth: docs/js/mechanics.js

import math

from config import (
    BASE_SPEED, MAX_SPEED, C_BEAM_SPEED, C_BEAM_RANGE, C_BEAM_LENGTH, C_BEAM_WIDTH,
    BEAM_SPEED, BEAM_LENGTH, BLAST_RADIUS, CELL_SIZE, MAZE_OFFSET_X, COLS, ROWS,
    MAX_ENERGY, MAX_MINES, MAX_SCORE, TAUNTS,
    TIMING, ENERGY_COSTS, ENERGY_RATES, COLLISION,
    CHARGE_MOVEMENT_PENALTY, BOOST_COOLDOWN_FRAMES,
    PORTAL_GLITCH_CHANCE,
)
from grid import is_wall, grid_index, destroy_wall_at, create_ammo_crate
from effects import (
    spawn_death_particles, spawn_explosion_particles,
    spawn_wall_hit_particles, spawn_muzzle_flash_particles,
    shake_camera,
)
from seeded_random import seeded_random
from state import save_high_scores


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _set_death_messages(state, reason: str) -> None:
    """Set death reason message on state."""
    state.messages['death_reason'] = reason


def _handle_multi_death(state, indices: list, reason: str) -> None:
    """Mark multiple players dead simultaneously (draw scenario)."""
    if state.is_game_over or state.is_round_over or state.death_timer > 0:
        return

    for idx in indices:
        state.players[idx].is_dead = True

    state.death_timer = COLLISION.DEATH_TIMER_FRAMES
    state.is_draw = len(indices) > 1
    state.victim_idx = -1 if len(indices) > 1 else indices[0]

    _set_death_messages(state, reason)
    for idx in indices:
        spawn_death_particles(state, state.players[idx])


def _handle_player_death(state, victim_idx: int, reason: str) -> None:
    """Mark a single player dead and spawn death particles."""
    if state.is_game_over or state.is_round_over or state.death_timer > 0:
        return

    state.players[victim_idx].is_dead = True
    state.victim_idx = victim_idx
    state.death_timer = COLLISION.DEATH_TIMER_FRAMES

    _set_death_messages(state, reason or "ELIMINATED BY A SNEAKY BUG")
    spawn_death_particles(state, state.players[victim_idx])


def _apply_player_explosion_damage(state, x: float, y: float, reason: str) -> None:
    """Collect victims in blast radius and apply death."""
    hit_indices = []
    if not state.is_round_over and not state.is_game_over:
        for idx, p in enumerate(state.players):
            if (abs(p.x + 1 - (x + 1)) < BLAST_RADIUS and
                    abs(p.y + 1 - (y + 1)) < BLAST_RADIUS):
                if not p.shield_active and not p.is_dead:
                    hit_indices.append(idx)

    if hit_indices:
        _handle_multi_death(state, hit_indices, reason)


def _handle_wall_destruction(state, x: float, y: float) -> None:
    """Destroy walls in a 3×3 cell radius around the explosion (dist²≤2)."""
    center_c = int((x - MAZE_OFFSET_X) / CELL_SIZE)
    center_r = int(y / CELL_SIZE)
    cell_radius = 1

    for r in range(center_r - cell_radius, center_r + cell_radius + 1):
        for c in range(center_c - cell_radius, center_c + cell_radius + 1):
            if c < 0 or c >= COLS or r < 0 or r >= ROWS:
                continue
            dc = c - center_c
            dr = r - center_r
            if dc * dc + dr * dr <= 2:
                destroy_wall_at(state.maze, c, r)


# ---------------------------------------------------------------------------
# Public: Collision
# ---------------------------------------------------------------------------

def check_player_collision(maze: list, p, dx: float, dy: float) -> bool:
    """
    Test 4 corners of player hitbox against is_wall.
    Returns True if the proposed move (dx, dy) would collide.
    """
    nx = p.x + dx
    ny = p.y + dy
    hitbox = COLLISION.HITBOX_SIZE
    pad = COLLISION.COLLISION_PAD
    return (
        is_wall(maze, nx + pad, ny + pad) or
        is_wall(maze, nx + pad + hitbox, ny + pad) or
        is_wall(maze, nx + pad, ny + pad + hitbox) or
        is_wall(maze, nx + pad + hitbox, ny + pad + hitbox)
    )


# ---------------------------------------------------------------------------
# Public: Player action handlers
# ---------------------------------------------------------------------------

def handle_shield(p, inp: dict) -> None:
    """Activate / drain shield based on input."""
    if inp.get('shield') and p.boost_energy > 0:
        if not p.shield_active:
            p.boost_energy -= ENERGY_COSTS.SHIELD_ACTIVATION
        if p.boost_energy > 0 and not p.shield_active:
            p.shield_active = True
        p.boost_energy -= ENERGY_RATES.SHIELD_DRAIN
        if p.boost_energy < 0:
            p.boost_energy = 0
    else:
        p.shield_active = False


def handle_detonate(state, p, inp: dict) -> None:
    """Detonate all owned (and neutral) mines on edge-detect of boom key."""
    if inp.get('boom') and not p.prev_detonate_key:
        if p.boost_energy >= ENERGY_COSTS.DETONATION:
            mines_to_detonate = []
            remaining_mines = []
            for mine in state.mines:
                if mine['owner'] == p.id or mine['owner'] == -1:
                    mines_to_detonate.append({'x': mine['x'], 'y': mine['y']})
                else:
                    remaining_mines.append(mine)

            if mines_to_detonate:
                p.boost_energy -= ENERGY_COSTS.DETONATION
                state.mines = remaining_mines
                for m in mines_to_detonate:
                    trigger_explosion(state, m['x'], m['y'], "WAS FRAGGED")

    p.prev_detonate_key = bool(inp.get('boom'))


def handle_beam_input(state, p, inp: dict) -> None:
    """Handle beam charging and firing logic."""
    now = state.frame_count
    if inp.get('beam'):
        if not p.is_charging:
            p.is_charging = True
            p.charge_start_time = now
        if p.charge_is_ready(now):
            fire_charged_beam(state, p)
            p.is_charging = False
            p.charge_start_time = None
        # else: still charging — sound effects handled by renderer/audio layer
    else:
        if p.is_charging:
            if not p.charge_is_ready(now):
                fire_beam(state, p)
        p.is_charging = False
        p.charge_start_time = None


def handle_movement(state, p, inp: dict) -> None:
    """
    Step-based movement with speed modifiers (stun, charging, boost),
    corner assist, and glitch inversion.
    """
    now = state.frame_count

    # --- Speed selection ---
    speed = BASE_SPEED
    if p.stun_is_active(now):
        speed = BASE_SPEED * COLLISION.STUN_SPEED_MULT
        if not inp.get('boost') and not p.shield_active:
            p.boost_energy = min(MAX_ENERGY, p.boost_energy + ENERGY_RATES.BOOST_REGEN)
    elif p.is_charging:
        speed = BASE_SPEED * CHARGE_MOVEMENT_PENALTY
        # No energy regen while charging
    else:
        if p.boost_cooldown > 0:
            p.boost_cooldown -= 1
            if not p.shield_active:
                p.boost_energy = min(MAX_ENERGY, p.boost_energy + ENERGY_RATES.BOOST_REGEN)
        elif inp.get('boost') and p.boost_energy > 0:
            p.boost_energy -= ENERGY_RATES.BOOST_DRAIN
            speed = MAX_SPEED
            if p.boost_energy <= 0:
                p.boost_energy = 0
        else:
            if p.boost_energy <= 0:
                p.boost_cooldown = BOOST_COOLDOWN_FRAMES
            elif not p.shield_active:
                p.boost_energy = min(MAX_ENERGY, p.boost_energy + ENERGY_RATES.BOOST_REGEN)

    p.current_speed = speed

    # --- Compute dx/dy from input ---
    dx = 0.0
    dy = 0.0
    if inp.get('up'):
        dy = -speed
    if inp.get('down'):
        dy = speed
    if inp.get('left'):
        dx = -speed
    if inp.get('right'):
        dx = speed

    # Glitch inverts controls
    if p.glitch_is_active(now):
        dx = -dx
        dy = -dy

    # Track last movement direction
    if abs(dx) > 0 or abs(dy) > 0:
        if abs(dx) > abs(dy):
            p.last_dir = {'x': 1 if dx > 0 else -1, 'y': 0}
        else:
            p.last_dir = {'x': 0, 'y': 1 if dy > 0 else -1}

    # --- Sub-step movement ---
    dist = math.hypot(dx, dy)
    if dist == 0:
        return

    steps = math.ceil(dist / COLLISION.MOVEMENT_STEP_SIZE)
    sx = dx / steps
    sy = dy / steps

    for _ in range(steps):
        # X-axis
        if sx != 0:
            if not check_player_collision(state.maze, p, sx, 0):
                p.x += sx
            else:
                if not check_player_collision(state.maze, p, sx, -COLLISION.CORNER_ASSIST_OFFSET):
                    p.y -= COLLISION.CORNER_NUDGE_SPEED
                elif not check_player_collision(state.maze, p, sx, COLLISION.CORNER_ASSIST_OFFSET):
                    p.y += COLLISION.CORNER_NUDGE_SPEED

        # Y-axis
        if sy != 0:
            if not check_player_collision(state.maze, p, 0, sy):
                p.y += sy
            else:
                if not check_player_collision(state.maze, p, -COLLISION.CORNER_ASSIST_OFFSET, sy):
                    p.x -= COLLISION.CORNER_NUDGE_SPEED
                elif not check_player_collision(state.maze, p, COLLISION.CORNER_ASSIST_OFFSET, sy):
                    p.x += COLLISION.CORNER_NUDGE_SPEED


def handle_mine_drop(state, p, inp: dict) -> None:
    """Drop a mine at player's current position with cooldown."""
    now = state.frame_count
    if (inp.get('mine') and p.mines_left > 0 and
            now - p.last_mine_time > TIMING.MINE_COOLDOWN):
        p.last_mine_time = now
        p.mines_left -= 1
        new_mine = {
            'x': int(p.x),
            'y': int(p.y),
            'dropped_at': now,
            'active': False,
            'vis_x': int(seeded_random() * 2),
            'vis_y': int(seeded_random() * 2),
            'owner': p.id,
        }
        state.mines.append(new_mine)


def handle_goal(state, p) -> None:
    """Check if player has reached their goal cell."""
    gx = MAZE_OFFSET_X + (p.goal_c * CELL_SIZE) + 1
    gy = (p.goal_r * CELL_SIZE) + 1
    if (abs(p.x - gx) < COLLISION.GOAL_DISTANCE and
            abs(p.y - gy) < COLLISION.GOAL_DISTANCE):
        resolve_round(state, p.id, 'GOAL')


def apply_player_actions(state, p, inp: dict) -> None:
    """
    Apply all player actions in order:
    detonate → shield → beam → movement → mine drop → goal check.
    """
    handle_detonate(state, p, inp)
    handle_shield(p, inp)
    handle_beam_input(state, p, inp)
    handle_movement(state, p, inp)
    handle_mine_drop(state, p, inp)
    handle_goal(state, p)


# ---------------------------------------------------------------------------
# Public: Beam system
# ---------------------------------------------------------------------------

def fire_beam(state, p) -> bool:
    """
    BFS pathfinding through maze to find beam path to opponent.
    Converts path to beam_pixels list with 3 pixels per cell segment.
    Deducts ENERGY_COSTS.BEAM (refunded if no path found).
    Returns True if beam was fired.
    """
    if p.boost_energy < ENERGY_COSTS.BEAM:
        return False
    if p.beam_idx < len(p.beam_pixels):
        return False

    opponent = state.players[(p.id + 1) % 2]
    if not opponent:
        return False

    # Target centre of opponent
    target_c = int((opponent.x + opponent.size / 2 - MAZE_OFFSET_X) / CELL_SIZE)
    target_r = int((opponent.y + opponent.size / 2) / CELL_SIZE)

    start = grid_index(state.maze, int((p.x - MAZE_OFFSET_X + 1) / CELL_SIZE),
                       int((p.y + 1) / CELL_SIZE))
    end = grid_index(state.maze, target_c, target_r)

    if start is None or end is None:
        return False

    # Deduct energy (may be refunded)
    p.boost_energy -= ENERGY_COSTS.BEAM

    # Reset BFS state
    for cell in state.maze:
        cell.parent = None
        cell.bfs_visited = False

    queue = [start]
    head = 0
    start.bfs_visited = True
    found = False

    # BFS: [dc, dr, wall_idx]  — directions: N, E, S, W
    directions = [(0, -1, 0), (1, 0, 1), (0, 1, 2), (-1, 0, 3)]

    while head < len(queue):
        curr = queue[head]
        head += 1
        if curr is end:
            found = True
            break
        for dc, dr, wall_idx in directions:
            n = grid_index(state.maze, curr.c + dc, curr.r + dr)
            if (n and not n.bfs_visited and
                    not curr.walls[wall_idx] and
                    not n.walls[(wall_idx + 2) % 4]):
                n.bfs_visited = True
                n.parent = curr
                queue.append(n)

    if not found:
        # Refund energy
        p.boost_energy += ENERGY_COSTS.BEAM
        return False

    # Trace path back
    path_cells = []
    temp = end
    while temp:
        path_cells.append(temp)
        temp = temp.parent
    path_cells.reverse()

    # Build beam_pixels: 3 pixels per segment
    p.beam_pixels = []
    for i in range(len(path_cells) - 1):
        x1 = MAZE_OFFSET_X + path_cells[i].c * CELL_SIZE + 1
        y1 = path_cells[i].r * CELL_SIZE + 1
        x2 = MAZE_OFFSET_X + path_cells[i + 1].c * CELL_SIZE + 1
        y2 = path_cells[i + 1].r * CELL_SIZE + 1
        p.beam_pixels.append({'x': x1, 'y': y1})
        ddx = (x2 - x1) / 3
        ddy = (y2 - y1) / 3
        p.beam_pixels.append({'x': x1 + ddx, 'y': y1 + ddy})
        p.beam_pixels.append({'x': x1 + ddx * 2, 'y': y1 + ddy * 2})

    # Final cell pixel
    p.beam_pixels.append({
        'x': MAZE_OFFSET_X + path_cells[-1].c * CELL_SIZE + 1,
        'y': path_cells[-1].r * CELL_SIZE + 1,
    })
    p.beam_idx = 0
    return True


def fire_charged_beam(state, p) -> bool:
    """
    Fire a projectile toward the opponent at C_BEAM_SPEED.
    Deducts ENERGY_COSTS.CHARGED_BEAM.
    Returns True if fired.
    """
    if p.boost_energy < ENERGY_COSTS.CHARGED_BEAM:
        return False

    opponent = state.players[(p.id + 1) % 2]
    if not opponent:
        return False

    start_x = p.x
    start_y = p.y
    target_x = opponent.x + opponent.size / 2
    target_y = opponent.y + opponent.size / 2

    dx = target_x - start_x
    dy = target_y - start_y
    dist = math.hypot(dx, dy)

    if dist < 0.1:
        dx = 1.0
        dy = 0.0
        dist = 1.0

    vx = (dx / dist) * C_BEAM_SPEED
    vy = (dy / dist) * C_BEAM_SPEED

    p.boost_energy -= ENERGY_COSTS.CHARGED_BEAM

    new_projectile = {
        'x': start_x,
        'y': start_y,
        'vx': vx,
        'vy': vy,
        'dist_traveled': 0.0,
        'owner': p.id,
        'color': p.color,
    }
    state.projectiles.append(new_projectile)

    spawn_muzzle_flash_particles(state, start_x, start_y)
    return True


def check_beam_actions(state, p, idx: int) -> None:
    """
    Advance beam_idx by BEAM_SPEED and check if opponent's beam tip hits this player.
    On hit: stun + glitch + energy transfer.
    """
    if p.beam_idx < len(p.beam_pixels) + BEAM_LENGTH:
        p.beam_idx += BEAM_SPEED

    opponent = state.players[(idx + 1) % 2]
    tip_idx = int(opponent.beam_idx)
    if 0 <= tip_idx < len(opponent.beam_pixels):
        tip = opponent.beam_pixels[tip_idx]
        if (abs(p.x - tip['x']) < COLLISION.BEAM_HIT_RADIUS and
                abs(p.y - tip['y']) < COLLISION.BEAM_HIT_RADIUS):
            if not p.shield_active:
                p.stun_start_time = state.frame_count
                p.glitch_start_time = state.frame_count
            # Energy transfer regardless of shield
            opponent.beam_pixels = []
            opponent.beam_idx = 9999
            opponent.boost_energy = min(MAX_ENERGY,
                                        opponent.boost_energy + ENERGY_COSTS.BEAM_HIT_TRANSFER)
            p.boost_energy = max(0, p.boost_energy - ENERGY_COSTS.BEAM_HIT_TRANSFER)


def check_beam_collisions(state) -> None:
    """
    Check beam vs beam collision (Manhattan distance < BEAM_COLLISION_DIST).
    Must be called before check_beam_actions to ensure fair detection.
    Samples multiple points along each beam tip trail.
    """
    p1 = state.players[0]
    p2 = state.players[1]
    if not p1.beam_pixels or not p2.beam_pixels:
        return

    b1_start = max(0, int(p1.beam_idx) - math.ceil(BEAM_SPEED))
    b1_end = min(len(p1.beam_pixels) - 1, int(p1.beam_idx))
    b2_start = max(0, int(p2.beam_idx) - math.ceil(BEAM_SPEED))
    b2_end = min(len(p2.beam_pixels) - 1, int(p2.beam_idx))

    for i1 in range(b1_start, b1_end + 1):
        for i2 in range(b2_start, b2_end + 1):
            h1 = p1.beam_pixels[i1]
            h2 = p2.beam_pixels[i2]
            if (h1 and h2 and
                    abs(h1['x'] - h2['x']) + abs(h1['y'] - h2['y']) < COLLISION.BEAM_COLLISION_DIST):
                mid_x = (h1['x'] + h2['x']) / 2
                mid_y = (h1['y'] + h2['y']) / 2
                trigger_explosion(state, mid_x, mid_y, "ANNIHILATED")
                p1.beam_pixels = []
                p1.beam_idx = 9999
                p2.beam_pixels = []
                p2.beam_idx = 9999
                return


# ---------------------------------------------------------------------------
# Public: Projectiles
# ---------------------------------------------------------------------------

def update_projectiles(state) -> None:
    """Move projectiles; check range/wall/mine/player collisions."""
    mines_to_explode = []
    projectiles_to_remove = set()
    player_hit = None

    updated_projectiles = []
    for i, proj in enumerate(state.projectiles):
        proj = dict(proj)  # shallow copy
        proj['x'] += proj['vx']
        proj['y'] += proj['vy']
        proj['dist_traveled'] = proj.get('dist_traveled', 0.0) + C_BEAM_SPEED

        updated_projectiles.append(proj)

        # Out of range
        if proj['dist_traveled'] >= C_BEAM_RANGE:
            projectiles_to_remove.add(i)
            continue

        hw = C_BEAM_LENGTH / 2 if abs(proj['vx']) > 0 else C_BEAM_WIDTH / 2
        hh = C_BEAM_WIDTH / 2 if abs(proj['vx']) > 0 else C_BEAM_LENGTH / 2
        tip_x = proj['x'] + proj['vx'] * 2
        tip_y = proj['y'] + proj['vy'] * 2

        # Wall collision
        if is_wall(state.maze, tip_x, tip_y):
            gc = int((tip_x - MAZE_OFFSET_X) / CELL_SIZE)
            gr = int(tip_y / CELL_SIZE)
            destroy_wall_at(state.maze, gc, gr)
            spawn_wall_hit_particles(state, tip_x, tip_y, proj['vx'] * 0.5, proj['vy'] * 0.5)
            projectiles_to_remove.add(i)

        # Mine collision
        for m_idx, m in enumerate(state.mines):
            if (abs(proj['x'] - m['x']) < hw + 1 and
                    abs(proj['y'] - m['y']) < hh + 1):
                mines_to_explode.append({'x': m['x'], 'y': m['y'], 'idx': m_idx})

        # Player collision
        if player_hit is None:
            opp_id = (proj['owner'] + 1) % 2
            opp = state.players[opp_id]
            p_left = opp.x
            p_right = opp.x + opp.size
            p_top = opp.y
            p_bot = opp.y + opp.size
            b_left = proj['x'] - hw
            b_right = proj['x'] + hw
            b_top = proj['y'] - hh
            b_bot = proj['y'] + hh

            if b_left < p_right and b_right > p_left and b_top < p_bot and b_bot > p_top:
                projectiles_to_remove.add(i)
                if not opp.shield_active:
                    player_hit = {'opp_id': opp_id, 'reason': "WAS VAPORIZED"}

    # Filter projectiles
    state.projectiles = [p for j, p in enumerate(updated_projectiles)
                         if j not in projectiles_to_remove]

    # Filter mines
    hit_mine_indices = {m['idx'] for m in mines_to_explode}
    state.mines = [m for j, m in enumerate(state.mines) if j not in hit_mine_indices]

    # Trigger mine explosions after state update
    for m in mines_to_explode:
        trigger_explosion(state, m['x'], m['y'], "SHOCKWAVE")

    # Handle player death after state update
    if player_hit:
        _handle_player_death(state, player_hit['opp_id'], player_hit['reason'])


# ---------------------------------------------------------------------------
# Public: Mines
# ---------------------------------------------------------------------------

def check_mines_actions(state, p) -> None:
    """
    Check beam hitting mines and player stepping on active mines.
    Decrement portal invulnerability each call.
    """
    mines_to_explode = []
    mine_indices_to_remove = set()
    beam_hit_mine = False

    b_idx = int(p.beam_idx)
    bp = p.beam_pixels[b_idx] if 0 <= b_idx < len(p.beam_pixels) else None

    for i, m in enumerate(state.mines):
        # Beam hitting mine
        if bp and not beam_hit_mine:
            if (bp['x'] >= m['x'] - 1 and bp['x'] <= m['x'] + 3 and
                    bp['y'] >= m['y'] - 1 and bp['y'] <= m['y'] + 3):
                mines_to_explode.append({'x': m['x'], 'y': m['y'], 'reason': "MINESWEEPER"})
                mine_indices_to_remove.add(i)
                beam_hit_mine = True
                continue

        # Player stepping on active mine
        if (m['active'] and p.portal_invuln_frames <= 0 and
                p.x + p.size > m['x'] and p.x < m['x'] + 2 and
                p.y + p.size > m['y'] and p.y < m['y'] + 2):
            mines_to_explode.append({'x': m['x'], 'y': m['y'], 'reason': "TRIPPED MINE"})
            mine_indices_to_remove.add(i)

    # Clear beam if it hit a mine
    if beam_hit_mine:
        p.beam_pixels = []
        p.beam_idx = 9999

    # Update mines and trigger explosions
    if mine_indices_to_remove:
        state.mines = [m for j, m in enumerate(state.mines) if j not in mine_indices_to_remove]
        for m in mines_to_explode:
            trigger_explosion(state, m['x'], m['y'], m['reason'])

    # Decrement portal invulnerability
    if p.portal_invuln_frames > 0:
        p.portal_invuln_frames -= 1


def update_mines(state) -> None:
    """Activate mines after MINE_ARM_TIME frames have elapsed since drop."""
    now = state.frame_count
    for mine in state.mines:
        if not mine['active'] and now - mine['dropped_at'] >= TIMING.MINE_ARM_TIME:
            mine['active'] = True


# ---------------------------------------------------------------------------
# Public: Portals & Crates
# ---------------------------------------------------------------------------

def check_portal_actions(state, p) -> None:
    """Teleportation with cooldown and glitch chance."""
    if p.portal_cooldown > 0:
        p.portal_cooldown -= 1
    else:
        pc = int((p.x + p.size / 2 - MAZE_OFFSET_X) / CELL_SIZE)
        pr = int((p.y + p.size / 2) / CELL_SIZE)
        portal = next((pt for pt in state.portals if pt['c'] == pc and pt['r'] == pr), None)
        if portal:
            dest = next((pt for pt in state.portals if pt is not portal), None)
            if dest:
                p.x = MAZE_OFFSET_X + dest['c'] * CELL_SIZE + 0.5
                p.y = dest['r'] * CELL_SIZE + 0.5
                p.portal_cooldown = COLLISION.PORTAL_COOLDOWN
                p.portal_invuln_frames = COLLISION.PORTAL_INVULN_FRAMES
                p.current_speed = BASE_SPEED
                if seeded_random() < PORTAL_GLITCH_CHANCE:
                    p.glitch_start_time = state.frame_count


def check_crate(state, p) -> None:
    """Ammo crate pickup: refills mines and energy."""
    if (state.ammo_crate and
            abs((p.x + 1) - (state.ammo_crate['x'] + 1)) < 2 and
            abs((p.y + 1) - (state.ammo_crate['y'] + 1)) < 2):
        p.mines_left = MAX_MINES
        p.boost_energy = MAX_ENERGY
        state.ammo_crate = None
        state.ammo_last_take_time = state.frame_count


# ---------------------------------------------------------------------------
# Public: Explosions & Death
# ---------------------------------------------------------------------------

def trigger_explosion(state, x: float, y: float, reason: str = "EXPLODED") -> None:
    """
    Camera shake, wall destruction (3×3 radius where dist²≤2),
    spawn particles, and player damage within BLAST_RADIUS.
    """
    shake_camera(state, 15)
    _handle_wall_destruction(state, x, y)
    spawn_explosion_particles(state, x, y)
    _apply_player_explosion_damage(state, x, y, reason)


def handle_player_death(state, victim_idx: int, reason: str) -> None:
    """Mark player dead, set death timer, spawn death particles."""
    _handle_player_death(state, victim_idx, reason)


def resolve_round(state, winner_idx, reason: str) -> None:
    """
    Central round resolution. All round-ending paths funnel through here.

    reason: 'GOAL', 'DRAW', 'TIMEOUT', or 'COMBAT'
    winner_idx: index of winning player (None for draw/timeout)
    """
    # Reset scroll-in and clear any pending transition
    state.scroll_x = 134  # LOGICAL_W + 6 — off-screen
    state.death_timer = 0

    # --- DRAW ---
    if reason == 'DRAW':
        state.is_round_over = True
        state.is_draw = False
        state.messages['round'] = "DOUBLE KO! DRAW!"
        state.messages['round_color'] = "#ffffff"
        if state.is_attract_mode:
            state.demo_reset_timer = TIMING.DEMO_RESET_TIMER
        return

    # --- TIMEOUT ---
    if reason == 'TIMEOUT':
        p0 = state.players[0]
        p1 = state.players[1]
        if p0.score == p1.score:
            # Equal scores — draw
            state.is_draw = True
            state.is_game_over = True
            state.messages['round'] = "TIME OUT! DRAW!"
            state.messages['round_color'] = "#ffff00"
            state.messages['win'] = "DRAW GAME!"
            state.messages['win_color'] = "#ffffff"
        else:
            timeout_winner_idx = 0 if p0.score > p1.score else 1
            winner = state.players[timeout_winner_idx]
            state.victim_idx = 1 if timeout_winner_idx == 0 else 0
            state.is_game_over = True
            state.messages['round'] = f"TIME OUT! {winner.name} WINS!"
            state.messages['round_color'] = winner.color.hex if hasattr(winner.color, 'hex') else str(winner.color)
            state.messages['win'] = f"{winner.name} WINS!"
            state.messages['win_color'] = winner.color.hex if hasattr(winner.color, 'hex') else str(winner.color)
            if winner.name != "CPU":
                save_high_score_entry(state, timeout_winner_idx)

        if state.is_attract_mode:
            state.demo_reset_timer = TIMING.DEMO_RESET_TIMER
        return

    # --- STANDARD WIN (GOAL or COMBAT) ---
    victim_idx = 1 if winner_idx == 0 else 0
    state.victim_idx = victim_idx

    # Increment winner's score
    state.players[winner_idx].score += 1
    winner = state.players[winner_idx]

    # Round message
    if reason == 'GOAL':
        round_msg = f"{winner.name} SCORES!"
        round_color = winner.color.hex if hasattr(winner.color, 'hex') else str(winner.color)
    else:
        death_reason = state.messages.get('death_reason', '')
        victim_name = state.players[victim_idx].name if state.players[victim_idx] else ''
        round_msg = f"{victim_name} '{death_reason}!'"
        round_color = (state.players[victim_idx].color.hex
                       if hasattr(state.players[victim_idx].color, 'hex')
                       else str(state.players[victim_idx].color))

    if winner.score >= MAX_SCORE:
        # Game over
        state.is_game_over = True
        state.messages['round'] = round_msg
        state.messages['round_color'] = round_color
        state.messages['win'] = f"{winner.name} WINS!"
        state.messages['win_color'] = winner.color.hex if hasattr(winner.color, 'hex') else str(winner.color)
        taunt_idx = int(seeded_random() * len(TAUNTS))
        state.messages['taunt'] = TAUNTS[taunt_idx]
        if winner.name != "CPU":
            save_high_score_entry(state, winner_idx)
    else:
        # Round over, game continues
        state.is_round_over = True
        state.messages['round'] = round_msg
        state.messages['round_color'] = round_color

    if state.is_attract_mode:
        state.demo_reset_timer = TIMING.DEMO_RESET_TIMER


def save_high_score_entry(state, winner_idx: int) -> None:
    """Add a high score entry to state.high_scores list."""
    winner = state.players[winner_idx]
    loser_idx = 1 if winner_idx == 0 else 0
    loser = state.players[loser_idx]

    winner_color = winner.color.hex if hasattr(winner.color, 'hex') else str(winner.color)
    loser_color = loser.color.hex if hasattr(loser.color, 'hex') else str(loser.color)

    entry = {
        'name': winner.name[:3].upper(),
        'win_color': winner_color,
        'opp_color': loser_color,
        'score': winner.score,
        'opp_score': loser.score,
        'opponent': loser.name,
        'multiplier': 1.0,
    }
    state.high_scores.append(entry)
    # Keep sorted by score descending, limit to top 10
    state.high_scores.sort(key=lambda e: e.get('score', 0), reverse=True)
    state.high_scores = state.high_scores[:10]
    save_high_scores(state)
