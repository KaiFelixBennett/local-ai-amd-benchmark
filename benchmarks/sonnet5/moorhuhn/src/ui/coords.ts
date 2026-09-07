import { GAME_HEIGHT, GAME_WIDTH } from '../config/screen';

let gameCanvas: HTMLCanvasElement | null = null;

export function registerGameCanvas(canvas: HTMLCanvasElement): void {
  gameCanvas = canvas;
}

/** Converts a point in Phaser game-world coordinates to page (DOM) coordinates. */
export function gameToScreen(x: number, y: number): { x: number; y: number } {
  if (!gameCanvas) return { x, y };
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = rect.width / GAME_WIDTH;
  const scaleY = rect.height / GAME_HEIGHT;
  return { x: rect.left + x * scaleX, y: rect.top + y * scaleY };
}
