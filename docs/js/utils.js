export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function checkRectCollision(rect1, rect2) {
  return rect1.left < rect2.right && rect1.right > rect2.left &&
         rect1.top < rect2.bottom && rect1.bottom > rect2.top;
}

export function angleToVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export const BLAST_RADIUS = 4.0;
export const PLAYER_HITBOX = 0.8;
