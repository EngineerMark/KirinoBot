export interface WeatherResponse {
    lat: number;
    lon: number;
    timezone: string;
    timezone_offset: number;

    current: WeatherData;
    hourly?: WeatherData[] | null;
    daily?: WeatherData[] | null;
    alerts?: WeatherAlert[] | null;
}

export interface WeatherData {
    dt: number;
    sunrise: number;
    sunset: number;
    temp: number | WeatherTemperature | null;
    feels_like: number;
    pressure: number;
    humidity: number;
    dew_point: number;
    uvi: number;
    clouds: number;
    visibility: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust: number;
    pop?: number; // probability of precipitation, only in hourly and daily, 0 to 1
    
    weather: Weather[];
    rain?: WeatherPrecipitation | null;
    snow?: WeatherPrecipitation | null;
}

export interface WeatherTemperature {
    day: number;
    min: number;
    max: number;
    night: number;
    eve: number;
    morn: number;
}

export interface Weather {
    id: number;
    main: string;
    description: string;
    icon: string;
}

export interface WeatherPrecipitation {
    '1h': number;
}

export interface WeatherAlert {
    sender_name: string;
    event: string;
    start: number;
    end: number;
    description: string;
    tags: string[];
}