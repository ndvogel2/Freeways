export interface Point { x: number; y: number }
export interface Portal extends Point { id: string; name: string; color: string }
export interface Road { id: string; points: Point[]; bridge: boolean }
export interface Demand { id: string; from: string; to: string; rate: number }
export interface Level {
  version: 1; id: string; name: string; description: string;
  portals: Portal[]; demands: Demand[]; roads: Road[]; updatedAt: number;
}
export type Tool = 'road' | 'bridge' | 'erase' | 'portal' | 'select';
export type Mode = 'build' | 'play';
export interface Car { id: number; position: Point; angle: number; color: string; waiting: boolean }
export interface SimulationStats {
  spawned: number; arrived: number; active: number; waiting: number;
  connected: number; total: number; efficiency: number; elapsed: number;
}
export const WORLD = { width: 1200, height: 850 };
export const ROAD_WIDTH = 10;
export const COLORS = ['#e89463', '#779bb5', '#a292ba', '#d6b65e', '#7ba78d', '#c98191'];
