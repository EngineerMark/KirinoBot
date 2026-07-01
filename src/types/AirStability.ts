export interface AirStabilityResponse {
    timezone: string;
    hourly: {
        time: string[],
        cape: number[],
        convective_inhibition: number[]
    }
}
