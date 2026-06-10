export function parseArgs(args: string[]) {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (!arg) continue;

        if (arg.startsWith("--")) {
            flags[arg.slice(2)] = true;
            continue;
        }

        if (arg.startsWith("-")) {
            flags[arg.slice(1)] = args[i + 1] || true;
            i++;
            continue;
        }

        positional.push(arg);
    }

    return {
        positional,
        flags
    };
}

export function formatNumber(num: number, decimals: number = 2): string {
    //point is to convert for example 1.2442 to 1.24..
    return num.toFixed(decimals);
}

export function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

export function rad2deg(rad: number): number {
    return rad * (180 / Math.PI);
}
