import fsExtra from 'fs-extra';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
import ffmpeg, { AudioVideoFilter } from 'fluent-ffmpeg'
import data from './input';
import { Video } from './model';
import { formatDuration, getSecondsFromDuration } from './utils';
import dargs from './libs/dargs';

import execa from 'execa';
import { YOUTUBE_DL_PATH } from './libs/constants';
import ytdl from 'ytdl-core';


(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpeg.setFfprobePath(ffprobePath);
    fsExtra.emptyDirSync('videos');
    try {
        const height = await getHighestVideosHeight(data);
        const videosPaths = await processVideos(height);
        const filteredVideoPaths = videosPaths.filter(vPath => !!vPath);
        mergeVideos(filteredVideoPaths, 'videos/out.mp4');
    } catch (err) {
        console.log(err);
    }
})()

async function processVideos(height: string) {
    const addingTextPromises: Promise<void>[] = [];
    const funcs = data.map((video, index) => {
        return () => processVideo(video, index, height, addingTextPromises);
    });
    const videosPaths = await chainAllTasksInSeries(funcs);
    console.log('Waiting for text adding task to finish...');
    await Promise.all(addingTextPromises);
    console.log('Text added !');
    return videosPaths;
}

async function processVideo(video: Video, index: number, height: string, promises: Promise<void>[]) {
    const videoPath = 'videos/' + index + '.mp4';
    try {
        const [videoUrl, audioUrl] = await getDirectStreamUrlFromYt(video.url, height);
        console.log(`Downloading ${video.url} as ${videoPath}`);
        await downloadYtVideoChunk(videoPath, videoUrl, audioUrl, video.start, video.duration);
        promises.push(addTextReplaceOriginal(videoPath, video));
    } catch (err) {
        console.log(err);
        console.log('problem downloading ' + videoPath);
        return undefined;
    }
    return videoPath;
}

function args(url: string, flags: any) {
    return [].concat(url, dargs(flags, { useEquals: false })).filter(Boolean)
}

function getUrl(url: string, flags: any, opts?: execa.Options<string>) {
    return execa(YOUTUBE_DL_PATH, args(url, flags), opts);
}

async function getHighestVideosHeight(videos: Video[]): Promise<string> {
    console.log('Choosing Videos Height...');
    const videosHeights = await getAvailableVideosHeights(videos);
    const map = countByHeight(videosHeights);
    const possibleQualities = getHeightsAvailableOnAllVideos(map, videos.length)
    const height = chooseTopHeight(possibleQualities);
    console.log(`${height} selected as best video height possible`);
    return height;
}

function getAvailableVideosHeights(videos: Video[]): Promise<string[]> {
    return videos.reduce(async (accArray: Promise<string[]>, video) => {
        const videoHeights = await getAvailableVideoHeights(video.url);
        return [...await accArray, ...videoHeights];
    }, Promise.resolve([]));
}

function getHeightsAvailableOnAllVideos(map: { [key: string]: number; }, length: number): { [key: string]: number; } {
    return Object.keys(map).reduce((acc: { [key: string]: number; }, height) => {
        if (map[height] === length) {
            acc[height] = map[height];
        }
        return acc;
    }, {})
}

async function getAvailableVideoHeights(url: string): Promise<string[]> {
    const videoInfo = await ytdl.getInfo(url);
    return extractHeights(videoInfo.formats)
}

function extractHeights(formats: ytdl.videoFormat[]): string[] {
    const map = formats.reduce((acc: { [key: number]: number }, format) => {
        const { height } = format;
        if (height) {
            acc[height] = height;
        }
        return acc;
    }, {});
    return Object.keys(map);
}

function countByHeight(videosFormats: string[]) {
    return videosFormats.reduce((accMap: { [key: string]: number }, height) => {
        accMap[height] = accMap[height] ? accMap[height] + 1 : 1;
        return accMap;
    }, {});
}

function chooseTopHeight(map: { [key: string]: number }): string {
    const resolutions = ['2160', '2160', '1440', '1440', '1080', '1080', '720', '720', '480', '360', '240', '144'];
    while (resolutions.length > 0) {
        const height = resolutions.shift();
        if (map[height]) {
            return height;
        }
    }
}

async function getDirectStreamUrlFromYt(url: string, height: string) {
    const { stdout: result } = await getUrl(url, {
        'format': `bestvideo[height=${height}]+bestaudio/best[height=${height}]`,
        'youtube-skip-dash-manifest': true,
        'get-url': true
    });
    return result.split('\n');
}

async function downloadYtVideoChunk(videoPath: string, videoUrl: string, audioUrl: string, start: string, duration: string) {
    const audioParams = audioUrl ? ['-ss', start, '-i', audioUrl] : [];
    const audioMappingParams = audioUrl ? ['-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-c:a'] : ['-c']
    const [startVideoAt, cutParams] = getSecondsFromDuration(start) > 10 ? [getSecondsFromDuration(start) - 10, ['-ss', '10']] : [getSecondsFromDuration(start), []];
    await execa(ffmpegPath, [
        '-ss', formatDuration(startVideoAt), '-i', videoUrl, ...audioParams,
        ...cutParams, '-t', duration, ...audioMappingParams, 'copy', videoPath
    ])
}

async function addTextReplaceOriginal(videoPath: string, video: Video) {
    const tmpPath = videoPath.replace('.mp4', '_tmp.mp4');
    // TODO decide font size based on resolution
    const isTextAdded = await addText(videoPath, video.text, 100, tmpPath);
    if (!isTextAdded) {
        throw Error('Error while adding text to the video');
    }
    await replaceOriginalVideoWithTmpVideo(videoPath, tmpPath);
}

function addText(videoPath: string, text: string, fontSize: number, outputPath: string): Promise<boolean> {
    console.log(`adding text to ${videoPath}`);

    return new Promise<boolean>(async (resolve, reject) => {
        let textFilter: AudioVideoFilter = {
            filter: 'drawtext',
            options: {
                // fontfile: rootPath_1.default + '/assets/fonts/arial.ttf',
                text,
                fontsize: fontSize,
                fontcolor: 'white',
                x: '(main_w/2-text_w/2)',
                y: '(main_h-(text_h*1.2))',
                box: "1",
                boxcolor: "black@0.5",
                boxborderw: "5",
            },
        };
        ffmpeg(videoPath)
            .videoFilters([textFilter])
            .output(outputPath)
            .on('end', function (err) {
                console.log('End Processing for :', videoPath);
                resolve(!err);
            })
            .on('error', reject)
            .run();
    });
}

async function replaceOriginalVideoWithTmpVideo(path: string, outputPath: string) {
    console.log('Renaming video for :', path);
    return new Promise<void>(async (resolve, reject) => {
        try {
            await fsExtra.rm(path);
            await fsExtra.rename(outputPath, path);
            resolve();
            console.log('Renaming Done for :', path);
        } catch (err) {
            console.log('error : ', err);
            reject(err);
        }
    });
}

function mergeVideos(videosPaths: string[], outputPath: string) {
    console.log('Merging videos...');
    return chainVideos(videosPaths)
        .on('progress', function (info) {
            console.log('progress ' + info.percent + '%');
        })
        .on('end', function () {
            console.log('files have been merged successfully');
        })
        .on('error', function (err) {
            console.log('an error happened: ' + err.message);
        })
        .mergeToFile(outputPath);
}


function chainVideos(videosPaths: string[]) {
    const [firstVideo, ...remainingVideos] = videosPaths;
    return remainingVideos.reduce((ffmpegAcc, currentVideo) => {
        return ffmpegAcc.input(currentVideo);
    }, ffmpeg(firstVideo));
}

async function chainAllTasksInSeries<T>(tasksFactory: (() => Promise<T>)[]): Promise<T[]> {
    return tasksFactory.reduce((promiseChain, currentTask) => {
        return promiseChain.then(chainResults =>
            currentTask().then(currentResult =>
                [...chainResults, currentResult]
            )
        );
    }, Promise.resolve([]));
}