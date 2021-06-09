import fs from 'fs';
import ytdl from 'ytdl-core';

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import ffmpeg from 'fluent-ffmpeg'
import data from './input';
console.log(data);
// [
//     'http://www.youtube.com/watch?v=aqz-KE-bpKQ',
//     'https://www.youtube.com/watch?v=xZ4F2Dhij8k'
// ]
//     .forEach((url, index) => {
//         ytdl(url).pipe(fs.createWriteStream('videos/' + index + '.mp4'));
//     });

ffmpeg.setFfmpegPath(ffmpegPath)

/* Cut video */
// ffmpeg('videos/0.mp4')
//     .setStartTime('00:00:10')
//     .setDuration('10')
//     .output('videos/video_out.mp4')
//     .on('end', function (err: any) {
//         if (!err) { console.log('conversion Done') }
//     })
//     .on('error', function (err: any) {
//         console.log('error: ', err)
//     }).run()


/* Merge videos */
// var firstFile = "videos/0.mp4";
// var secondFile = "videos/1.mp4";
// var outPath = "videos/out.mp4";

// var proc = ffmpeg(firstFile)
//     .input(secondFile)
//     .on('progress', function (info) {
//         console.log('progress ' + info.percent + '%');
//     })
//     .on('end', function () {
//         console.log('files have been merged succesfully');
//     })
//     .on('error', function (err) {
//         console.log('an error happened: ' + err.message);
//     })
//     .mergeToFile(outPath);