import fsExtra from 'fs-extra';

import ytdl, { videoFormat } from 'ytdl-core';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import ffmpeg from 'fluent-ffmpeg'
import data from './input';
import { CustomVideoFormat, Video } from './model';

(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    fsExtra.emptyDirSync('videos');
    const videosFormats = await getHighestCommonVideosFormats(data);
    try {
        const videosPaths = await downloadDefinedVideoChunks(videosFormats);
        mergeVideos(videosPaths, 'videos/out.mp4');
    } catch (err) {
        console.log(err);
    }
})()

async function downloadDefinedVideoChunks(videosFormats: CustomVideoFormat[]) {
    console.log('Downloading Videos...');
    const videoChunksPromises = videosFormats.map(async (video, index) => {
        const videoPath = 'videos/' + index + '.mp4';
        console.log(`Downloading : ${video.ytUrl} as ${videoPath}`);
        await downloadYtVideo(videoPath, video);
        console.log('Downloading finished for :', videoPath);
        console.log('Cutting video for :', videoPath);
        const isCut = await cutVideo(videoPath, video.start, video.duration);
        if (!isCut) {
            throw Error('Error while cutting video');
        }
        console.log('Cutting finished for :', videoPath);
        return videoPath;
    });
    return Promise.all(videoChunksPromises);
}

function downloadYtVideo(videoPath: string, video: CustomVideoFormat): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        ytdl(video.ytUrl, { quality: 'highestvideo', filter: 'audioandvideo', format: video })
            .pipe(fsExtra.createWriteStream(videoPath))
            .on('close', resolve)
            .on('error', reject);
    });
}

async function getHighestCommonVideosFormats(videos: Video[]): Promise<CustomVideoFormat[]> {
    const map: { [key: string]: CustomVideoFormat[]; } = {};
    const promises = videos.map(async video => {
        const videoInfo = await ytdl.getInfo(video.url);
        const videosFormats = getUniqValidMp4VideosFormats(videoInfo.formats);
        videosFormats.forEach(format => {
            const { qualityLabel } = format;
            map[qualityLabel] = [...(map[qualityLabel] || []), { ...format, ytUrl: video.url, start: video.start, duration: video.duration }];
        });
    });
    await Promise.all(promises);
    return chooseVideoFormatToDownload(map, videos.length);
}

function getUniqValidMp4VideosFormats(videosFormats: videoFormat[]) {
    const map = videosFormats.reduce((accMap: { [key: string]: ytdl.videoFormat }, videoFormat) => {
        const { qualityLabel, hasAudio, hasVideo, container } = videoFormat;
        const isValidVideoFormat = qualityLabel && hasAudio && hasVideo && container === 'mp4';
        const isExistingFormat = accMap[qualityLabel];
        if (isValidVideoFormat && !isExistingFormat) {
            accMap[qualityLabel] = videoFormat;
        }
        return accMap;
    }, {});
    return Object.values(map);
}

function chooseVideoFormatToDownload(map: { [key: string]: CustomVideoFormat[] }, numberOfVideos: number): CustomVideoFormat[] {
    const resolutions = ['2160p60', '2160p', '1440p60', '1440p', '1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
    while (resolutions.length > 0) {
        const qualityLabel = resolutions.shift();
        if (map[qualityLabel]?.length === numberOfVideos) {
            return map[qualityLabel];
        }
    }
}

function cutVideo(path: string, startTime: string, duration: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const outputPath = path.replace('.mp4', '_tmp.mp4');
        ffmpeg(path)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath)
            .on('end', async function (err: any) {
                if (!err) {
                    console.log('Conversion Done for :', path);
                    try {
                        await fsExtra.rm(path);
                        await fsExtra.rename(outputPath, path);
                        console.log('Renaming Done for :', path);
                        resolve(true);
                    } catch (err) {
                        console.log('error : ', err);
                        resolve(false);
                    }
                }
            })
            .on('error', function (err: any) {
                console.log('error: ', err)
                reject(err);
            }).run()
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
