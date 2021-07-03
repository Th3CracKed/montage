/**
 * Converts seconds to format hh:mm:ss
 * @param seconds 
 * @returns 
 */
export function formatDuration(seconds: number): string {
    return new Date(seconds * 1000).toISOString().substr(11, 8);
}


export function getSecondsFromDuration(duration: string): number {
    const array = duration.split(":").map(s => Number(s));

    const seconds = array[0] * 3600 + array[1] * 60 + (+array[2]);
    return seconds;
}