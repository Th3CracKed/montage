/**
 * Converts seconds to format hh:mm:ss
 * @param seconds 
 * @returns 
 */
export function formatDuration(seconds: number | string): string {
    var parts = []
    parts.push(Number(seconds) % 60)
    var minutes = Math.floor(Number(seconds) / 60)
    if (minutes > 0) {
        parts.push(minutes % 60)
        var hours = Math.floor(minutes / 60)
        if (hours > 0) {
            parts.push(hours)
        }
    }
    return parts.reverse().join(':')
}