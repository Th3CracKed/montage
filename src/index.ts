import fsExtra from 'fs-extra';

import ytdl from 'ytdl-core';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import ffmpeg from 'fluent-ffmpeg'
import data from './input';


(async () => {
    ffmpeg.setFfmpegPath(ffmpegPath)
    fsExtra.emptyDirSync('videos');
    const videoProcessingPromises = data.map((video, index) => {
        return new Promise<string>((resolve, reject) => {
            const videoPath = 'videos/' + index + '.mp4';
            ytdl(video.url, { quality: 'highestvideo', filter: 'audioandvideo' })
                .pipe(fsExtra.createWriteStream(videoPath))
                .on('close', async () => {
                    try {
                        console.log('Download finish for :', videoPath);
                        console.log('Cutting video for :', videoPath);
                        const isCut = await cutVideo(videoPath, video.start, video.duration);
                        if (isCut) {
                            resolve(videoPath);
                        } else {
                            reject('Error while cutting video');
                        }
                    } catch (err) {
                        reject(err);
                    }
                })
                .on('error', reject);
        });
    });
    try {
        console.log('Downloading Videos...');
        const videosPaths = await Promise.all(videoProcessingPromises);
        mergeVideos(videosPaths, 'out.mp4');
    } catch (err) {
        console.log(err);
    }
})()


// mergeVideos(['videos/0.mp4', 'videos/1.mp4'], 'out.mp4');

function cutVideo(path: string, startTime: string, duration: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const outputPath = path.replace('.mp4', '_tmp.mp4');
        ffmpeg(path)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath)
            .on('end', async function (err: any) {
                if (!err) {
                    console.log('conversion Done for :', path);
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
