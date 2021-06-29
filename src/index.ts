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

(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpeg.setFfprobePath(ffprobePath);
    fsExtra.emptyDirSync('videos');
    try {
        const videosPaths = await processVideos();
        const { height, width } = await getHighestVideoResolutions(videosPaths);
        await scaleVideos(videosPaths, height, width);
        mergeVideos(videosPaths, 'videos/out.mp4');
    } catch (err) {
        console.log(err);
    }
})()

async function processVideos() {
    const funcs = data.map((video, index) => {
        return () => processVideo(video, index);
    });
    const videosPaths = await chainAllTasksInSeries(funcs);
    return videosPaths;
}

async function processVideo(video: Video, index: number) {
    const videoPath = 'videos/' + index + '.mp4';
    try {
        const [videoUrl, audioUrl] = await getDirectStreamUrlFromYt(video.url);
        console.log(`Downloading ${video.url} as ${videoPath}`);
        await downloadYtVideoChunk(videoPath, videoUrl, audioUrl, video.start, video.duration);
        await addTextReplaceOriginal(videoPath, video);
    } catch (err) {
        console.log('problem downloading ' + videoPath);
        console.log(err);
    }
    return videoPath;
}

async function getDirectStreamUrlFromYt(url: string) {
    const args = (url: string, flags: any) =>
        [].concat(url, dargs(flags, { useEquals: false })).filter(Boolean)
    const getUrl = (url: string, flags: any, opts?: execa.Options<string>) => execa(YOUTUBE_DL_PATH, args(url, flags), opts);
    const { stdout: result } = await getUrl(url, {
        'format': 'bestvideo+bestaudio',
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
                if (!err) {
                    console.log('End Prosessing');
                    resolve(true);
                } else {
                    console.log('End Prosessing for :', videoPath);
                    resolve(false);
                }
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


function getVideoResolution(videoPath: string) {
    return new Promise<{ height: number; width: number; }>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, function (err, metadata) {
            if (err) {
                console.error(err);
            } else {
                // metadata should contain 'width', 'height' and 'display_aspect_ratio'
                console.log(metadata);
                const videoStream = metadata?.streams?.find(s => s.codec_type === 'video');
                if (!videoStream) {
                    reject('Video Stream not found');
                }
                const { height, width } = videoStream;
                if (!height || !width) {
                    reject(`Height and/or width undefined not found, height = ${height} and width = ${width}`);
                }
                resolve({ height, width });
            }
        });
    });
}

function scaleVideo(videoPath: string, outputPath: string, size: string) {
    console.log('Scaling video to fhd:', videoPath);
    return new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
            .output(outputPath)
            .videoCodec('libx264')
            .size(size)
            .on('error', function (err) {
                reject(err);
                console.log('An error occurred while Scaling: ' + err.message, videoPath);
            })
            .on('progress', function (progress) {
                console.log('Scaling... frames: ' + progress.frames, videoPath);
            })
            .on('end', function () {
                console.log('Scaling finished for :', videoPath);
                resolve();
            })
            .run();
    })
}

function getHighestVideoResolutions(videosPaths: string[]): Promise<{ height: number; width: number; }> {
    return videosPaths.reduce<Promise<{ height: number; width: number; }>>(async (highestResolution, videoPath) => {
        try {
            const { height: currentHeight, width: currentWidth } = await getVideoResolution(videoPath);
            const { height: previousHighestHeight = 0, width: previousHighestWidth = 0 } = await highestResolution;
            const isNewResolutionHigher = currentHeight < previousHighestHeight && currentWidth < previousHighestWidth;
            return isNewResolutionHigher ? highestResolution : { height: currentHeight, width: currentWidth };
        } catch (err) {
            console.log(err);
            return highestResolution;
        }
    }, Promise.resolve({ height: 0, width: 0 }));
}

async function scaleVideos(videosPaths: string[], targetHeight: number, targetWidth: number) {
    for await (const videoPath of videosPaths) {
        const { height: currentHeight, width: currentWidth } = await getVideoResolution(videoPath);
        if (currentHeight === targetHeight && currentWidth === targetWidth) {
            return;
        }
        await scaleVideoReplaceOriginal(videoPath, `${targetWidth}x${targetHeight}`);
    }
}

async function scaleVideoReplaceOriginal(videoPath: string, size: string) {
    const tmpPath = videoPath.replace('.mp4', '_tmp.mp4');
    await scaleVideo(videoPath, tmpPath, size);
    await replaceOriginalVideoWithTmpVideo(videoPath, tmpPath);
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