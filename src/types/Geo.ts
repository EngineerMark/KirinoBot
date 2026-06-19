import { deg2rad } from "../helpers.js";

export interface Geo {
    name: string;
    lat: number;
    lon: number;
    country: string;
    state: string;
}

export interface Coordinates {
    lat: number;
    lon: number;
}

//static coordinate class with functions
export class Coords {
    static Distance(c1: Coordinates, c2: Coordinates): number {
        const R = 6371;
        const dLat = deg2rad(c2.lat - c1.lat);
        const dLon = deg2rad(c2.lon - c1.lon);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(c1.lat)) * Math.cos(deg2rad(c2.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    static Bearing(c1: Coordinates, c2: Coordinates): number {
        const dLon = deg2rad(c2.lon - c1.lon);
        const y = Math.sin(dLon) * Math.cos(deg2rad(c2.lat));
        const x =
            Math.cos(deg2rad(c1.lat)) * Math.sin(deg2rad(c2.lat)) -
            Math.sin(deg2rad(c1.lat)) * Math.cos(deg2rad(c2.lat)) * Math.cos(dLon);
        const bearing = Math.atan2(y, x);
        return (bearing * 180) / Math.PI;
    }
}
