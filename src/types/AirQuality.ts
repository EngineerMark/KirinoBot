import type { Coordinates } from "./Geo.js";

export interface AirQualityResponse {
    coord: Coordinates;
    list: AirQualityData[];
}

export interface AirQualityData {
    main: AirQualityMain;
    components: AirQualityComponents;
    dt: number;
}

export interface AirQualityMain {
    aqi: number; // 1 to 5, where 1 is good and 5 is very poor
}

export interface AirQualityComponents {
    //everything is in μg/m3
    co: number;
    no: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    nh3: number;
}