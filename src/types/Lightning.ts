import type { Coordinates } from "./Geo.js";

export interface LightningResponse {
    strikes: Strike[];
}

export interface Strike {
    coord: Coordinates;
    time: Date;
}