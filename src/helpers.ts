export function parseArgs(args: string[]) {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if(!arg) continue;

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
