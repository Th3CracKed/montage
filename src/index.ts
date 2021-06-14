import fsExtra from 'fs-extra';

import ytdl, { videoFormat } from 'ytdl-core';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import ffmpeg from 'fluent-ffmpeg'
import data from './input';
import { CustomVideoFormat, Video } from './model';

(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    fsExtra.emptyDirSync('videos');
    const videosFormats = await getHighestVideosFormats(data);
    try {
        const videosPaths = await downloadDefinedVideoChunks(videosFormats);
        mergeVideos(videosPaths, 'videos/out.mp4');
    } catch (err) {
        console.log(err);
    }
})()

async function downloadDefinedVideoChunks(videosFormats: CustomVideoFormat[]) {
    console.log('Downloading Videos...');
    const videoChunksPromises = videosFormats.map(async (videoFormat, index) => {
        const videoPath = 'videos/' + index + '.mp4';
        await downloadYtVideo(videoPath, videoFormat);
        const tmpPath = videoPath.replace('.mp4', '_tmp.mp4');
        const isCut = await cutVideo(videoPath, tmpPath, videoFormat.start, videoFormat.duration);
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

function downloadYtVideo(videoPath: string, videoFormat: CustomVideoFormat): Promise<void> {
    console.log(`Downloading : ${videoFormat.ytUrl} as ${videoPath}`);
    return new Promise<void>(async (resolve, reject) => {
        ytdl(videoFormat.ytUrl, { quality: 'highestvideo', filter: 'audioandvideo', format: videoFormat })
            .pipe(fsExtra.createWriteStream(videoPath))
            .on('close', () => {
                console.log('Downloading finished for :', videoPath);
                resolve();
            })
            .on('error', reject);
    });
}

async function getHighestVideosFormats(videos: Video[]): Promise<CustomVideoFormat[]> {
    return Promise.all(videos.map(async video => {
        const videoInfo = await ytdl.getInfo(video.url);
        const highestVideoFormat = getHighestValidVideoFormat(videoInfo.formats);
        return { ...highestVideoFormat, ytUrl: video.url, start: video.start, duration: video.duration };
    }));
}

function getHighestValidVideoFormat(videosFormats: ytdl.videoFormat[]) {
    const map = videosFormats.reduce((accMap: { [key: string]: ytdl.videoFormat }, videoFormat) => {
        const { qualityLabel, hasAudio, hasVideo, container } = videoFormat;
        const isValidVideoFormat = qualityLabel && hasAudio && hasVideo && container === 'mp4';
        const isExistingFormat = accMap[qualityLabel];
        if (isValidVideoFormat && !isExistingFormat) {
            accMap[qualityLabel] = videoFormat;
        }
        return accMap;
    }, {});
    return chooseVideoFormatToDownload(map);
}

function chooseVideoFormatToDownload(map: { [key: string]: ytdl.videoFormat }): ytdl.videoFormat {
    const resolutions = ['2160p60', '2160p', '1440p60', '1440p', '1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
    while (resolutions.length > 0) {
        const qualityLabel = resolutions.shift();
        if (map[qualityLabel]) {
            return map[qualityLabel];
        }
    }
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
