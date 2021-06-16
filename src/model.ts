import { videoFormat } from "ytdl-core";

export interface Video {
    url: string;
    start: string;
    duration: string;
    text: string;
}
export interface CustomVideoFormat extends videoFormat {
    ytUrl: string;
    start: string;
    duration: string;
}