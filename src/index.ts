import fsExtra from 'fs-extra';

import ytdl from 'ytdl-core';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import ffmpeg from 'fluent-ffmpeg'
import data from './input';
import { Video } from './model';

(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    fsExtra.emptyDirSync('videos');
    try {
        const videosPaths = await downloadDefinedVideoChunks(data);
        mergeVideos(videosPaths, 'videos/out.mp4');
    } catch (err) {
        console.log(err);
    }
})()

async function downloadDefinedVideoChunks(videosFormats: Video[]) {
    console.log('Downloading Videos...');
    const videoChunksPromises = videosFormats.map(async (video, index) => {
        const videoPath = 'videos/' + index + '.mp4';
        await downloadYtVideo(videoPath, video.url);
        const tmpPath = videoPath.replace('.mp4', '_tmp.mp4');
        const isCut = await cutVideo(videoPath, tmpPath, video.start, video.duration);
        if (!isCut) {
            throw Error('Error while cutting video');
        }
        await replaceOriginalVideoWithTmpVideo(videoPath, tmpPath);
        await scaleToFhdVideo(videoPath, tmpPath);
        await replaceOriginalVideoWithTmpVideo(videoPath, tmpPath);
        return videoPath;
    });
    return Promise.all(videoChunksPromises);
}

function downloadYtVideo(videoPath: string, url: string): Promise<void> {
    console.log(`Downloading : ${url} as ${videoPath}`);

    return new Promise<void>(async (resolve, reject) => {
        const cp = require('child_process');
        const stream = require('stream');

        const result = new stream.PassThrough({ highWaterMark: 1024 * 512 });
        const info = await ytdl.getInfo(url);
        const audioStream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
        const videoStream = ytdl.downloadFromInfo(info, { quality: 'highestvideo' });
        // create the ffmpeg process for muxing
        const ffmpegProcess = cp.spawn(ffmpegPath, [
            // supress non-crucial messages
            '-loglevel', '8', '-hide_banner',
            // input audio and video by pipe
            '-i', 'pipe:3', '-i', 'pipe:4',
            // map audio and video correspondingly
            '-map', '0:a', '-map', '1:v',
            // no need to change the codec
            '-c', 'copy',
            // output mp4 and pipe
            '-f', 'matroska', 'pipe:5'
        ], {
            // no popup window for Windows users
            windowsHide: true,
            stdio: [
                // silence stdin/out, forward stderr,
                'inherit', 'inherit', 'inherit',
                // and pipe audio, video, output
                'pipe', 'pipe', 'pipe'
            ]
        });
        audioStream.pipe(ffmpegProcess.stdio[3]);
        videoStream.pipe(ffmpegProcess.stdio[4]);
        ffmpegProcess.stdio[5].pipe(result);
        result.pipe(fsExtra.createWriteStream(videoPath))
            .on('close', () => {
                console.log('Downloading finished for :', videoPath);
                resolve();
            })
            .on('error', reject);
    });
}

function cutVideo(path: string, outputPath: string, startTime: string, duration: string): Promise<boolean> {
    console.log('Cutting video for :', path);
    return new Promise((resolve, reject) => {
        ffmpeg(path)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath)
            .on('end', async function (err: any) {
                if (!err) {
                    console.log('Cutting Done for :', path);
                    resolve(true);
                } else {
                    console.log('Cutting failed for :', path);
                    resolve(false);
                }
            })
            .on('error', function (err: any) {
                console.log('error: ', err)
                reject(err);
            }).run()
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

function scaleToFhdVideo(videoPath: string, outputPath: string) {
    console.log('Scaling video to fhd:', videoPath);
    return new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
            .output(outputPath)
            .videoCodec('libx264')
            .size('1920x1080')
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
